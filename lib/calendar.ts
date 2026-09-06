import { query, execute, BOOK_ID } from './db';
import { monthRange } from './month';
import { fetchEvents, type CalDavAuth } from './caldav';

/**
 * 일정 영역. 부부 각자의 캘린더를 끌어와 한 곳에서 본다.
 *
 * **조회만 한다.** 여기서 만들거나 고치지 않는다. 원본은 각자의 구글·네이버에 있고
 * 이 파일이 하는 일은 그것을 그대로 비추는 것뿐이다.
 *
 * **배치를 만들지 않는다.** 크론을 새로 붙이는 대신 화면을 열 때 마지막 동기화가
 * 24시간을 넘었으면 그때 가져온다. 부부 둘이 하루에 한 번은 여는 화면이라 결과는
 * 같고 인프라가 늘지 않는다. 새로고침 버튼이 곧 '지금 당장' 경로다.
 */

export const SYNC_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * 사람을 구분하는 색. 연결한 순서대로 배정한다.
 *
 * 연두와 빨강을 넣지 않는다 - 그 둘은 조작과 지출이 이미 쓰고 있어서, 정보에 또 쓰면
 * 무엇이 버튼인지 구분이 안 된다.
 */
export const CAL_COLORS = ['#5b8def', '#c98ba0', '#7a9e7e', '#c9a227'];

export type Provider = 'google' | 'naver';

export interface SourceRow {
  id: number;
  owner: string;
  provider: Provider;
  account: string | null;
  color: string;
  synced_at: string | null;
  /** 어느 해를 채웠는가. 다른 해를 보면 그 해로 다시 가져온다 */
  synced_year: string | null;
  sync_error: string | null;
  /** 자격이 들어 있는가. 값 자체는 화면으로 내보내지 않는다 */
  connected: 0 | 1;
}

export interface EventRow {
  id: number;
  source_id: number;
  owner: string;
  color: string;
  title: string;
  starts_on: string;
  ends_on: string;
  /** 종일 일정이면 null */
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
}

/** 연결 목록. 자격은 있는지 여부만 내보낸다 */
export async function getSources(): Promise<SourceRow[]> {
  return query<SourceRow>(
    `SELECT id, owner, provider, account, color, synced_at, synced_year, sync_error,
            (credential IS NOT NULL) AS connected
       FROM calendar_source
      WHERE book_id = ? AND archived_at IS NULL
      ORDER BY sort_order, id`,
    [BOOK_ID],
  );
}

/**
 * 그 달에 걸치는 일정.
 *
 * 시작일이 그 달 이전이어도 끝일이 그 달 안이면 나와야 한다 - 여러 날에 걸친
 * 여행이 그렇다. 그래서 `starts_on <= 말일 AND ends_on >= 1일` 로 겹침을 본다.
 */
export async function getEvents(ym: string): Promise<EventRow[]> {
  const [from, to] = monthRange(ym);
  return query<EventRow>(
    `SELECT e.id, e.source_id, s.owner, s.color, e.title,
            e.starts_on, e.ends_on, e.starts_at, e.ends_at, e.location
       FROM calendar_event e
       JOIN calendar_source s ON s.id = e.source_id
      WHERE s.book_id = ? AND s.archived_at IS NULL
        AND e.starts_on <= ? AND e.ends_on >= ?
      ORDER BY e.starts_on, e.starts_at IS NULL DESC, e.starts_at, e.id`,
    [BOOK_ID, to, from],
  );
}

/**
 * 날짜별로 흩어 놓는다. 여러 날짜에 걸친 일정은 걸치는 날마다 들어간다.
 *
 * 격자의 각 칸이 "그날 무엇이 있나"를 물으므로 시작일에만 넣으면 여행 중간 날이 빈다.
 */
export function byDayOf(events: EventRow[], ym: string): Map<number, EventRow[]> {
  const [from, to] = monthRange(ym);
  const m = new Map<number, EventRow[]>();
  for (const e of events) {
    const s = e.starts_on < from ? from : e.starts_on;
    const t = e.ends_on > to ? to : e.ends_on;
    for (let d = Number(s.slice(8, 10)); d <= Number(t.slice(8, 10)); d++) {
      const list = m.get(d);
      if (list) list.push(e);
      else m.set(d, [e]);
    }
  }
  return m;
}

/**
 * 화면을 열 때 다시 가져와야 하는가.
 *
 * 두 경우다 - 24시간이 지났거나, **채워둔 두 해 밖을 보고 있거나.** 뒤쪽이 없으면
 * 해를 넘겼을 때 옛 해의 일정을 그대로 보여준다. `synced_at`만으로는 알 수 없다.
 */
export function needsSync(sources: SourceRow[], year: string): boolean {
  const now = Date.now();
  return sources.some((s) => {
    if (s.connected !== 1) return false;
    if (!s.synced_at || !s.synced_year) return true;
    if (!coveredBy(s.synced_year, year)) return true;
    return now - new Date(s.synced_at + 'Z').getTime() > SYNC_AFTER_MS;
  });
}

/**
 * 한 번에 **두 해**를 채운다. 보는 해와 그다음 해다.
 *
 * 한 해만 채우면 12월에 다음 달을 볼 때 비고, 해가 바뀌는 순간 통째로 빈다.
 * 두 해면 어느 쪽으로 넘겨도 이미 들어 있다.
 *
 * `synced_year`에는 앞의 해를 적는다. 그 값이 곧 "여기부터 두 해를 채웠다"는 뜻이다.
 */
export function yearWindow(ym: string): { year: string; fromYm: string; toYm: string } {
  const year = ym.slice(0, 4);
  return { year, fromYm: `${year}-01`, toYm: `${Number(year) + 1}-12` };
}

/** 채워둔 두 해 안에 드는가 */
function coveredBy(syncedYear: string, viewing: string): boolean {
  const base = Number(syncedYear);
  const y = Number(viewing);
  return y === base || y === base + 1;
}

/* ── 구글에서 가져오기 ────────────────────────────────────── */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** refresh token으로 access token을 받는다. 이 토큰은 저장하지 않는다 - 한 번 쓰고 버린다 */
async function accessTokenOf(refresh: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? `토큰 갱신 실패 (${res.status})`);
  }
  return json.access_token;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

/**
 * 구글이 주는 시각을 우리 컬럼으로 옮긴다.
 *
 * 종일 일정은 `date`로 오고 **끝 날짜가 하루 뒤**다(9월 6일 하루짜리면 end=9월 7일).
 * 그대로 넣으면 격자에서 하루가 더 칠해진다. 그래서 하루를 뺀다.
 */
function toRow(g: GoogleEvent) {
  if (g.start?.date) {
    const end = new Date(`${g.end?.date ?? g.start.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    const ends = end.toISOString().slice(0, 10);
    return {
      starts_on: g.start.date,
      ends_on: ends < g.start.date ? g.start.date : ends,
      starts_at: null,
      ends_at: null,
    };
  }
  // 시각이 있는 일정. 구글이 KST 오프셋을 붙여 주므로 앞의 날짜·시각을 그대로 쓴다
  const s = g.start?.dateTime ?? '';
  const e = g.end?.dateTime ?? s;
  return {
    starts_on: s.slice(0, 10),
    ends_on: e.slice(0, 10),
    starts_at: s.slice(11, 19),
    ends_at: e.slice(11, 19),
  };
}

/**
 * 한 소스를 그 기간만큼 다시 가져온다.
 *
 * 반복 일정은 `singleEvents=true`로 구글이 펼쳐서 준다. 우리가 RRULE을 해석하지
 * 않는다 - 예외 규칙(그 주만 옮김, 그 회만 취소)에서 원본과 어긋나고 그 차이를
 * 설명할 방법이 없다. 상환표를 계산하지 않는 것과 같은 이유다.
 *
 * 가져온 기간은 통째로 갈아끼운다. 조회 전용이라 병합할 이유가 없고, 원본에서
 * 지운 일정이 우리 쪽에 남는 것이 제일 나쁘다.
 */
export async function syncSource(source: SourceRow, year: string) {
  const row = await query<{ credential: string | null }>(
    `SELECT credential FROM calendar_source WHERE id = ?`,
    [source.id],
  );
  const refresh = row[0]?.credential;
  if (!refresh) return;

  const [from] = monthRange(`${year}-01`);
  const [, to] = monthRange(`${Number(year) + 1}-12`);

  try {
    if (source.provider === 'naver') {
      await syncNaver(source, refresh, from, to, year);
      return;
    }
    const token = await accessTokenOf(refresh);

    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(EVENTS_URL);
      url.searchParams.set('timeMin', `${from}T00:00:00+09:00`);
      url.searchParams.set('timeMax', `${to}T23:59:59+09:00`);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '250');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`일정을 못 받았습니다 (${res.status})`);
      const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
      events.push(...(json.items ?? []));
      pageToken = json.nextPageToken;
    } while (pageToken);

    // 그 기간을 비우고 다시 넣는다
    await execute(
      `DELETE FROM calendar_event WHERE source_id = ? AND starts_on <= ? AND ends_on >= ?`,
      [source.id, to, from],
    );

    for (const g of events) {
      if (g.status === 'cancelled') continue;
      const t = toRow(g);
      if (!t.starts_on) continue;
      await execute(
        `INSERT INTO calendar_event
           (source_id, uid, title, starts_on, ends_on, starts_at, ends_at, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), starts_on = VALUES(starts_on), ends_on = VALUES(ends_on),
           starts_at = VALUES(starts_at), ends_at = VALUES(ends_at), location = VALUES(location)`,
        [
          source.id,
          g.id.slice(0, 190),
          (g.summary ?? '제목 없음').slice(0, 120),
          t.starts_on,
          t.ends_on,
          t.starts_at,
          t.ends_at,
          (g.location ?? null)?.slice(0, 120) ?? null,
        ],
      );
    }

    await execute(
      `UPDATE calendar_source SET synced_at = UTC_TIMESTAMP(), synced_year = ?, sync_error = NULL
        WHERE id = ?`,
      [year, source.id],
    );
  } catch (err) {
    // 조용히 옛 일정을 보여주지 않는다. 화면에 그대로 띄운다
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    await execute(`UPDATE calendar_source SET sync_error = ? WHERE id = ?`, [
      msg.slice(0, 200),
      source.id,
    ]);
  }
}

/**
 * 네이버는 CalDAV다. `credential`에 아이디와 앱 비밀번호가 JSON으로 들어 있다.
 *
 * 구글과 다른 점이 둘 있다.
 *   - 반복을 서버가 안 펼친다. 생일·기념일이 쓰는 `매년 m월 d일`만 우리가 펴고
 *     나머지는 손대지 않는다(`lib/caldav.ts`의 `expandInWindow`)
 *   - 한 파일에 여러 일정을 담아 보내서 기간 밖이 딸려 온다. 우리가 거른다
 */
async function syncNaver(
  source: SourceRow,
  credential: string,
  from: string,
  to: string,
  year: string,
) {
  const auth = JSON.parse(credential) as CalDavAuth;
  const { events, unexpanded } = await fetchEvents(auth, from, to);

  await execute(
    `DELETE FROM calendar_event WHERE source_id = ? AND starts_on <= ? AND ends_on >= ?`,
    [source.id, to, from],
  );

  for (const e of events) {
    await execute(
      `INSERT INTO calendar_event
         (source_id, uid, title, starts_on, ends_on, starts_at, ends_at, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), starts_on = VALUES(starts_on), ends_on = VALUES(ends_on),
         starts_at = VALUES(starts_at), ends_at = VALUES(ends_at), location = VALUES(location)`,
      [source.id, e.uid, e.title, e.starts_on, e.ends_on, e.starts_at, e.ends_at, e.location],
    );
  }

  // 우리가 못 편 반복이 남아 있으면 그대로 말한다. 조용히 빠뜨리지 않는다
  await execute(
    `UPDATE calendar_source SET synced_at = UTC_TIMESTAMP(), synced_year = ?, sync_error = ?
      WHERE id = ?`,
    [
      year,
      unexpanded > 0
        ? `반복 일정 ${unexpanded}건은 못 펼쳤습니다 - 매년 같은 날 말고 다른 규칙입니다`
        : null,
      source.id,
    ],
  );
}

/** 보는 해와 그다음 해를 가져온다. 어느 쪽으로 넘겨도 이미 들어 있다 */
export async function syncAll(sources: SourceRow[], year: string) {
  for (const s of sources) {
    if (s.connected === 1) await syncSource(s, year);
  }
}
