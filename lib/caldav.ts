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
  /** 그 회차만 빼기로 한 날들 */
  exdates: string[];
  /** 이 줄이 어떤 회차의 수정본인가. 그 날의 원래 회차를 대신한다 */
  recurrenceId: string | null;
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
      cur = { rrule: null, exdates: [], recurrenceId: null };
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
          exdates: cur.exdates ?? [],
          recurrenceId: cur.recurrenceId ?? null,
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
        // 쉼표로 여러 개가 온다. 그 회차는 빼기로 한 날들이다
        cur.exdates = [
          ...(cur.exdates ?? []),
          ...f.value.split(',').map((v) => moment(v, f.params).date),
        ];
        break;
      case 'RECURRENCE-ID':
        // 이 줄은 어떤 회차의 수정본이다. 그 날의 원래 회차를 대신한다
        cur.recurrenceId = moment(f.value, f.params).date;
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
 * 네이버는 `<C:expand>`를 지원하지 않아 반복 일정의 원본이 그대로 온다.
 * 그대로 두면 매년 오는 생일이 시작일(2016년 같은 날)에만 찍힌다. 그래서 편다.
 *
 * **원본과 어긋나지 않는 이유는 네이버가 필요한 걸 다 주기 때문이다.**
 *   - `RRULE`   규칙
 *   - `EXDATE`  그 회차만 뺀 날
 *   - `RECURRENCE-ID` 그 회차만 고친 별도 줄 (옮긴 날짜·바뀐 제목이 들어 있다)
 *
 * 셋을 다 쓰면 "그 주만 옮김", "그 회는 취소"가 그대로 반영된다. 규칙만 보고
 * 계산했다면 어긋났을 자리다. 그래도 우리가 모르는 규칙이 오면 손대지 않고
 * 몇 건인지 세어 화면에 적는다 - 조용히 틀린 날에 찍는 것이 제일 나쁘다.
 */

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  until: string | null;
  byDay: string[];
  byMonthDay: number[];
  byMonth: number[];
}

function parseRule(rrule: string): Rule | null {
  const p = new Map<string, string>();
  for (const kv of rrule.split(';')) {
    const [k, v] = kv.split('=');
    if (k) p.set(k, v ?? '');
  }
  const freq = p.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }
  // 우리가 모르는 조건이 붙으면 손대지 않는다. BYSETPOS·BYWEEKNO·BYYEARDAY 같은 것들이다
  const known = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'];
  for (const k of p.keys()) if (!known.includes(k)) return null;

  const until = p.get('UNTIL');
  return {
    freq,
    interval: Math.max(1, Number(p.get('INTERVAL') ?? 1)),
    count: p.has('COUNT') ? Number(p.get('COUNT')) : null,
    until: until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null,
    byDay: (p.get('BYDAY') ?? '').split(',').filter(Boolean),
    byMonthDay: (p.get('BYMONTHDAY') ?? '').split(',').filter(Boolean).map(Number),
    byMonth: (p.get('BYMONTH') ?? '').split(',').filter(Boolean).map(Number),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

/** `2TU`(둘째 화요일) · `-1FR`(마지막 금요일) · `MO`(모든 월요일) */
function matchesByDay(token: string, d: Date): boolean {
  const m = /^(-?\d+)?([A-Z]{2})$/.exec(token);
  if (!m) return false;
  if (DOW[d.getUTCDay()] !== m[2]) return false;
  if (!m[1]) return true;

  const n = Number(m[1]);
  if (n > 0) return Math.floor((d.getUTCDate() - 1) / 7) + 1 === n;

  // 뒤에서 센다. 그 달 말일까지 남은 같은 요일의 수
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.floor((last - d.getUTCDate()) / 7) + 1 === -n;
}

/** 그 날이 규칙에 맞는가 */
function matches(rule: Rule, start: Date, d: Date): boolean {
  if (rule.byMonth.length && !rule.byMonth.includes(d.getUTCMonth() + 1)) return false;

  if (rule.byMonthDay.length) {
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const ok = rule.byMonthDay.some((n) => (n > 0 ? n === d.getUTCDate() : last + n + 1 === d.getUTCDate()));
    if (!ok) return false;
  }

  if (rule.byDay.length) {
    if (!rule.byDay.some((t) => matchesByDay(t, d))) return false;
  }

  switch (rule.freq) {
    case 'DAILY':
      return daysBetween(start, d) % rule.interval === 0;
    case 'WEEKLY': {
      // 주 간격은 시작일이 속한 주부터 센다
      const weeks = Math.floor(daysBetween(start, d) / 7);
      if (weeks % rule.interval !== 0) return false;
      return rule.byDay.length > 0 || d.getUTCDay() === start.getUTCDay();
    }
    case 'MONTHLY': {
      const months =
        (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + (d.getUTCMonth() - start.getUTCMonth());
      if (months % rule.interval !== 0) return false;
      return (
        rule.byMonthDay.length > 0 ||
        rule.byDay.length > 0 ||
        d.getUTCDate() === start.getUTCDate()
      );
    }
    case 'YEARLY': {
      const years = d.getUTCFullYear() - start.getUTCFullYear();
      if (years % rule.interval !== 0) return false;
      if (!rule.byMonth.length && d.getUTCMonth() !== start.getUTCMonth()) return false;
      return (
        rule.byMonthDay.length > 0 ||
        rule.byDay.length > 0 ||
        d.getUTCDate() === start.getUTCDate()
      );
    }
  }
}

/** COUNT가 붙은 규칙만 시작일부터 세어야 한다. 그 외에는 창 안만 훑으면 된다 */
const COUNT_SCAN_CAP = 20000;

function instancesIn(rule: Rule, startYmd: string, from: string, to: string): string[] | null {
  const start = utc(startYmd);
  const out: string[] = [];

  if (rule.count !== null) {
    // 몇 번째까지인지 알려면 시작부터 센다. 너무 멀면 포기하고 손대지 않는다
    let seen = 0;
    const cur = new Date(start);
    for (let i = 0; i < COUNT_SCAN_CAP && seen < rule.count; i++) {
      const day = ymd(cur);
      if (matches(rule, start, cur)) {
        seen++;
        if (day >= from && day <= to) out.push(day);
      }
      if (day > to) break;
      cur.setUTCDate(cur.getUTCDate() + 1);
      if (i === COUNT_SCAN_CAP - 1) return null;
    }
    return out;
  }

  const begin = startYmd > from ? startYmd : from;
  const cur = utc(begin);
  const stop = utc(to);
  while (cur <= stop) {
    const day = ymd(cur);
    if ((!rule.until || day <= rule.until) && matches(rule, start, cur)) out.push(day);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * 기간에 걸치는 것만 남기고, 반복은 편다.
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

  // 그 회차만 고친 줄들. 원래 날짜로 찾아 쓴다
  const overrides = new Map<string, CalDavEvent>();
  for (const e of events) {
    if (e.recurrenceId) overrides.set(`${e.uid}|${e.recurrenceId}`, e);
  }

  const keep = (e: CalDavEvent) => e.starts_on <= to && e.ends_on >= from;

  for (const e of events) {
    // 수정본은 아래에서 원래 회차 자리에 넣는다. 여기서 또 넣으면 두 번 나온다
    if (e.recurrenceId) continue;

    if (!e.rrule) {
      if (keep(e)) out.push(e);
      continue;
    }

    const rule = parseRule(e.rrule);
    const days = rule ? instancesIn(rule, e.starts_on, from, to) : null;
    if (!days) {
      // 모르는 규칙이다. 조용히 틀린 날에 찍지 않고 원본만 두고 센다
      unexpanded += 1;
      if (keep(e)) out.push(e);
      continue;
    }

    const span = daysBetween(utc(e.starts_on), utc(e.ends_on));
    const skip = new Set(e.exdates);
    for (const day of days) {
      if (skip.has(day)) continue;
      const fixed = overrides.get(`${e.uid}|${day}`);
      if (fixed) {
        // 그 회차만 고친 것이 있으면 그것을 쓴다. 옮긴 날짜와 바뀐 제목이 들어 있다
        if (keep(fixed)) out.push(fixed);
        continue;
      }
      const end = utc(day);
      end.setUTCDate(end.getUTCDate() + Math.max(0, span));
      out.push({ ...e, starts_on: day, ends_on: ymd(end) });
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
