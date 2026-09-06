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
  /** 원본 반복 규칙. 네이버는 펼쳐 주지 않으므로 그대로 온다 */
  rrule: string | null;
  /** 예외 날짜나 개별 수정이 붙어 있는가. 있으면 우리가 펴지 않는다 */
  hasException: boolean;
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
  let cur: (Partial<CalDavEvent> & { allDay?: boolean; cancelled?: boolean }) | null = null;

  for (const line of unfold(ics)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = { rrule: null, hasException: false };
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
          rrule: cur.rrule ?? null,
          hasException: cur.hasException ?? false,
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
        cur.rrule = f.value.trim().toUpperCase();
        break;
      case 'EXDATE':
      case 'RECURRENCE-ID':
        // 예외가 붙은 반복은 우리가 펴지 않는다. 규칙만 보고 계산하면
        // 옮기거나 취소한 회차에서 원본과 어긋나고 그 차이를 설명할 방법이 없다
        cur.hasException = true;
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

/* ── 반복 일정 ───────────────────────────────────────────── */

/**
 * `매년 m월 d일`만 편다.
 *
 * 네이버는 `<C:expand>`를 지원하지 않아 반복 일정의 원본이 그대로 온다. 그대로 두면
 * 매년 오는 생일이 시작일(1964년 같은 날)에만 찍힌다.
 *
 * **확실한 것만 편다.** 생일·기념일이 쓰는 이 한 가지 형태는 예외가 붙지 않는 한
 * 계산해도 원본과 어긋날 여지가 없다 - 매년 그 날이다. 요일 규칙·간격·횟수 제한이
 * 붙거나 예외가 하나라도 있으면 손대지 않고 몇 건인지 세어서 화면에 적는다.
 * 상환표를 계산하지 않는 것과 같은 이유다.
 */
function yearlyOn(rrule: string): { month: number; day: number } | null {
  const p = new Map(
    rrule.split(';').map((kv) => {
      const [k, v] = kv.split('=');
      return [k, v ?? ''];
    }),
  );
  if (p.get('FREQ') !== 'YEARLY') return null;
  if (p.has('INTERVAL') && p.get('INTERVAL') !== '1') return null;
  // 다른 조건이 붙으면 우리가 아는 형태가 아니다
  for (const k of p.keys()) {
    if (!['FREQ', 'INTERVAL', 'BYMONTH', 'BYMONTHDAY', 'WKST'].includes(k)) return null;
  }
  const month = Number(p.get('BYMONTH'));
  const day = Number(p.get('BYMONTHDAY'));
  if (!month || !day) return null;
  return { month, day };
}

/**
 * 기간에 걸치는 것만 남기고, 펼 수 있는 반복은 편다.
 *
 * 기간 밖을 우리가 버려야 한다 - 네이버는 한 파일에 여러 일정을 담아 보내서
 * 주소 목록이 걸러져도 내용에는 기간 밖 일정이 딸려 온다.
 */
export function expandInWindow(
  events: CalDavEvent[],
  from: string,
  to: string,
): { events: CalDavEvent[]; unexpanded: number } {
  const out: CalDavEvent[] = [];
  let unexpanded = 0;
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));

  for (const e of events) {
    if (!e.rrule) {
      if (e.starts_on <= to && e.ends_on >= from) out.push(e);
      continue;
    }

    const on = e.hasException ? null : yearlyOn(e.rrule);
    if (!on) {
      // 못 펴는 반복. 첫 회가 기간 안이면 그것만 보이고, 아니면 아예 안 보인다
      unexpanded += 1;
      if (e.starts_on <= to && e.ends_on >= from) out.push(e);
      continue;
    }

    const span = Number(e.ends_on.slice(8, 10)) - Number(e.starts_on.slice(8, 10));
    for (let y = fromYear; y <= toYear; y++) {
      // 시작 연도 이전은 아직 없던 일이다
      if (y < Number(e.starts_on.slice(0, 4))) continue;
      const d = `${y}-${String(on.month).padStart(2, '0')}-${String(on.day).padStart(2, '0')}`;
      if (d < from || d > to) continue;
      const end = new Date(`${d}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + Math.max(0, span));
      out.push({ ...e, starts_on: d, ends_on: end.toISOString().slice(0, 10) });
    }
  }
  return { events: out, unexpanded };
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
 * **두 단계로 받는다.** 네이버의 `calendar-query`는 주소(href) 목록만 주고
 * `<D:prop />`을 비워서 보낸다 - `<c:calendar-data>`를 요청해도 담아 주지 않는다.
 * 그래서 목록을 먼저 받고, 그 주소들로 `calendar-multiget`을 한 번 더 보낸다.
 * 한 건씩 GET하지 않는 것은 일정이 수십 개면 요청도 수십 개가 되기 때문이다.
 *
 * `<C:expand>`(서버가 반복을 펼쳐 주는 것)는 네이버가 지원하지 않는다. 그래서
 * 반복 일정은 원본 그대로 오고 `RRULE`이 남는다. 우리가 풀지 않고 `recurring`으로
 * 표시만 한다 - 예외 규칙(그 주만 옮김, 그 회만 취소)에서 원본과 어긋나고
 * 그 차이를 설명할 방법이 없다. 상환표를 계산하지 않는 것과 같은 이유다.
 */
const MULTIGET_CHUNK = 50;

export async function fetchEvents(
  auth: CalDavAuth,
  from: string,
  to: string,
): Promise<{ events: CalDavEvent[]; unexpanded: number }> {
  const start = stamp(from);
  const end = stamp(to, true);
  const query = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/></d:prop>
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
    // 1단계 - 그 기간에 걸치는 일정의 주소만 받는다
    const listXml = await dav(cal, 'REPORT', auth, '1', query);
    const hrefs = tags(listXml, 'response')
      .map((r) => firstHref(r))
      .filter((h): h is string => !!h);

    // 2단계 - 그 주소들의 내용을 한 번에 받는다
    for (let i = 0; i < hrefs.length; i += MULTIGET_CHUNK) {
      const chunk = hrefs.slice(i, i + MULTIGET_CHUNK);
      const multiget = `<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  ${chunk.map((h) => `<d:href>${h.replace(/&/g, '&amp;')}</d:href>`).join('\n  ')}
</c:calendar-multiget>`;
      const dataXml = await dav(cal, 'REPORT', auth, '1', multiget);
      for (const data of tags(dataXml, 'calendar-data')) {
        found.push(...parseEvents(decodeXml(data)));
      }
    }
  }

  const { events, unexpanded } = expandInWindow(found, from, to);

  // 펼친 인스턴스는 UID가 같다. 시작일을 붙여 유일하게 만든다 -
  // 안 그러면 uk_event가 마지막 하나만 남긴다
  const seen = new Set<string>();
  return {
    events: events.map((e) => {
      let uid = `${e.uid}:${e.starts_on}`;
      while (seen.has(uid)) uid += '+';
      seen.add(uid);
      return { ...e, uid: uid.slice(0, 190) };
    }),
    unexpanded,
  };
}

function decodeXml(v: string): string {
  // 네이버는 iCalendar 본문을 CDATA로 감싸 보낸다. 벗기지 않으면 첫 줄이 안 맞는다
  const inner = v.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
  return inner
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
