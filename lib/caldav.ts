/**
 * CalDAV 클라이언트. 네이버 캘린더를 읽으려고 만들었다.
 *
 * 라이브러리를 넣지 않는다. 쓰는 요청이 세 종류(principal 찾기, 캘린더 목록,
 * 일정 조회)뿐이고 읽는 필드도 예닐곱 개다. `tsdav`는 쓰기·동기화·계정 관리까지
 * 들고 오는데 우리는 **읽기만** 한다.
 *
 * 네이버는 HTTP Basic이다(`www-authenticate: basic realm="Naver Calendar"`).
 * 일반 비밀번호로는 안 되고 2단계 인증의 **애플리케이션 비밀번호**를 써야 한다.
 */

const NAVER_BASE = 'https://caldav.calendar.naver.com';

export interface CalDavAuth {
  id: string;
  /** 애플리케이션 비밀번호. 계정 비밀번호가 아니다 */
  password: string;
}

export interface CalDavEvent {
  uid: string;
  title: string;
  starts_on: string;
  ends_on: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  /** 서버가 반복을 안 펼쳐서 원본 규칙이 그대로 온 경우 */
  recurring: boolean;
}

function authHeader(a: CalDavAuth): string {
  return 'Basic ' + Buffer.from(`${a.id}:${a.password}`).toString('base64');
}

async function dav(
  url: string,
  method: 'PROPFIND' | 'REPORT',
  auth: CalDavAuth,
  depth: '0' | '1',
  body: string,
): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: authHeader(auth),
      depth,
      'content-type': 'application/xml; charset=utf-8',
    },
    body,
  });
  if (res.status === 401) {
    throw new Error('아이디나 앱 비밀번호가 맞지 않습니다');
  }
  if (!res.ok && res.status !== 207) {
    throw new Error(`캘린더 서버가 거절했습니다 (${res.status})`);
  }
  return res.text();
}

/**
 * 네임스페이스 접두어를 무시하고 태그를 찾는다.
 *
 * 서버마다 `d:`, `D:`, `dav:`를 섞어 쓴다. 접두어를 고정해 파싱하면 서버를 바꿀 때
 * 조용히 빈 결과가 된다 - `IN (?)`에 배열을 넣는 것과 같은 종류의 실패다.
 */
function tags(xml: string, local: string): string[] {
  const re = new RegExp(`<[^>]*?\\b${local}\\b[^>]*?>([\\s\\S]*?)</[^>]*?\\b${local}\\b>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function firstHref(xml: string): string | null {
  const h = tags(xml, 'href')[0];
  return h ? h.trim() : null;
}

function absolute(href: string): string {
  return href.startsWith('http') ? href : new URL(href, NAVER_BASE).href;
}

/* ── iCalendar 파싱 ───────────────────────────────────────── */

/**
 * 접힌 줄을 편다. RFC 5545는 75옥텟마다 줄을 끊고 다음 줄을 공백으로 시작한다.
 * 이걸 안 펴면 긴 제목이 중간에서 잘린다.
 */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** `DTSTART;TZID=Asia/Seoul:20260906T140000` → 이름·파라미터·값 */
function field(line: string): { name: string; params: string; value: string } | null {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const head = line.slice(0, i);
  const j = head.indexOf(';');
  return {
    name: (j < 0 ? head : head.slice(0, j)).toUpperCase(),
    params: j < 0 ? '' : head.slice(j + 1).toUpperCase(),
    value: line.slice(i + 1),
  };
}

/**
 * `20260906` 또는 `20260906T140000[Z]` 을 날짜와 시각으로 나눈다.
 *
 * 시각에 `Z`가 붙으면 UTC라 KST로 옮긴다. TZID가 붙은 값은 이미 그 지역 시각이므로
 * 그대로 쓴다. 네이버는 `TZID=Asia/Seoul`로 주는 것이 보통이다.
 */
function moment(value: string, params: string): { date: string; time: string | null } {
  const v = value.trim();
  const date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (params.includes('VALUE=DATE') || !v.includes('T')) return { date, time: null };

  const hh = v.slice(9, 11);
  const mm = v.slice(11, 13);
  const ss = v.slice(13, 15) || '00';
  if (!v.endsWith('Z')) return { date, time: `${hh}:${mm}:${ss}` };

  // UTC로 온 값. 화면은 KST라 옮겨서 넣는다
  const d = new Date(`${date}T${hh}:${mm}:${ss}Z`);
  d.setUTCHours(d.getUTCHours() + 9);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 19) };
}

/** 하루 빼기. 종일 일정의 DTEND는 끝나는 날의 다음 날로 온다 */
function dayBefore(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 하나의 VCALENDAR 안에 든 VEVENT들을 우리 행으로 옮긴다 */
export function parseEvents(ics: string): CalDavEvent[] {
  const out: CalDavEvent[] = [];
  let cur: Partial<CalDavEvent> & { allDay?: boolean; cancelled?: boolean } | null = null;

  for (const line of unfold(ics)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = { recurring: false };
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (cur && cur.uid && cur.starts_on && !cur.cancelled) {
        out.push({
          uid: cur.uid,
          title: (cur.title ?? '제목 없음').slice(0, 120),
          starts_on: cur.starts_on,
          ends_on: cur.ends_on ?? cur.starts_on,
          starts_at: cur.starts_at ?? null,
          ends_at: cur.ends_at ?? null,
          location: cur.location ? cur.location.slice(0, 120) : null,
          recurring: cur.recurring ?? false,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const f = field(line);
    if (!f) continue;

    switch (f.name) {
      case 'UID':
        // 반복을 펼치면 인스턴스마다 같은 UID가 온다. 시작일을 붙여 유일하게 만든다 -
        // 안 그러면 uk_event가 마지막 하나만 남긴다
        cur.uid = f.value.trim();
        break;
      case 'SUMMARY':
        cur.title = unescape(f.value);
        break;
      case 'LOCATION':
        cur.location = unescape(f.value);
        break;
      case 'STATUS':
        if (f.value.trim().toUpperCase() === 'CANCELLED') cur.cancelled = true;
        break;
      case 'RRULE':
        // 서버가 안 펼쳤다는 뜻이다. 우리가 풀지 않고 표시만 한다
        cur.recurring = true;
        break;
      case 'DTSTART': {
        const m = moment(f.value, f.params);
        cur.starts_on = m.date;
        cur.starts_at = m.time;
        cur.allDay = m.time === null;
        break;
      }
      case 'DTEND': {
        const m = moment(f.value, f.params);
        cur.ends_on = cur.allDay && m.time === null ? dayBefore(m.date) : m.date;
        cur.ends_at = m.time;
        break;
      }
    }
  }
  return out;
}

/** iCalendar는 쉼표·세미콜론·역슬래시를 이스케이프한다 */
function unescape(v: string): string {
  return v
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/* ── 서버에 묻기 ──────────────────────────────────────────── */

/** `2026-08-01` → `20260801T000000Z` (KST 자정을 UTC로) */
function stamp(ymd: string, endOfDay = false): string {
  const d = new Date(`${ymd}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** 캘린더 컬렉션들의 주소. 사람마다 캘린더가 여럿일 수 있다 */
export async function findCalendars(auth: CalDavAuth): Promise<string[]> {
  const principalXml = await dav(
    `${NAVER_BASE}/`,
    'PROPFIND',
    auth,
    '0',
    `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  );
  const principal = firstHref(tags(principalXml, 'current-user-principal').join(''));
  if (!principal) throw new Error('계정을 찾지 못했습니다');

  const homeXml = await dav(
    absolute(principal),
    'PROPFIND',
    auth,
    '0',
    `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
  );
  const home = firstHref(tags(homeXml, 'calendar-home-set').join(''));
  if (!home) throw new Error('캘린더 목록을 찾지 못했습니다');

  const listXml = await dav(
    absolute(home),
    'PROPFIND',
    auth,
    '1',
    `<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`,
  );

  // 캘린더 컬렉션인 것만 고른다. 홈 자신과 휴지통 같은 것이 섞여 온다
  return tags(listXml, 'response')
    .filter((r) => /<[^>]*?\bcalendar\b[^>]*?\/>/i.test(r))
    .map((r) => firstHref(r))
    .filter((h): h is string => !!h)
    .map(absolute);
}

/**
 * 기간 안의 일정.
 *
 * `<C:expand>`로 **서버에게** 반복을 펼쳐 달라고 한다. 구글의 `singleEvents=true`와
 * 같은 요청이다. 서버가 지원하지 않으면 원본이 그대로 오고 그 안에 `RRULE`이 남는데,
 * 그때는 `recurring: true`로 표시만 하고 우리가 풀지 않는다 -
 * 예외 규칙(그 주만 옮김, 그 회만 취소)에서 원본과 어긋나고 그 차이를 설명할 방법이 없다.
 */
export async function fetchEvents(
  auth: CalDavAuth,
  from: string,
  to: string,
): Promise<CalDavEvent[]> {
  const start = stamp(from);
  const end = stamp(to, true);
  const query = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-data><c:expand start="${start}" end="${end}"/></c:calendar-data>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}" end="${end}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const found: CalDavEvent[] = [];
  for (const cal of await findCalendars(auth)) {
    const xml = await dav(cal, 'REPORT', auth, '1', query);
    for (const data of tags(xml, 'calendar-data')) {
      found.push(...parseEvents(decodeXml(data)));
    }
  }

  // 반복을 펼치면 인스턴스마다 UID가 같다. 시작일을 붙여 유일하게 만든다
  const seen = new Set<string>();
  return found.map((e) => {
    let uid = `${e.uid}:${e.starts_on}`;
    while (seen.has(uid)) uid += '+';
    seen.add(uid);
    return { ...e, uid: uid.slice(0, 190) };
  });
}

function decodeXml(v: string): string {
  return v
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
