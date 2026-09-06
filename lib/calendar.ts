import { query, execute, BOOK_ID } from './db';
import { monthRange } from './month';

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

export type Provider = 'google' | 'naver';

export interface SourceRow {
  id: number;
  owner: string;
  provider: Provider;
  account: string | null;
  color: string;
  synced_at: string | null;
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
    `SELECT id, owner, provider, account, color, synced_at, sync_error,
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

/** 하나라도 24시간이 지났으면 화면을 열 때 가져온다 */
export function needsSync(sources: SourceRow[]): boolean {
  const now = Date.now();
  return sources.some(
    (s) =>
      s.connected === 1 &&
      (!s.synced_at || now - new Date(s.synced_at + 'Z').getTime() > SYNC_AFTER_MS),
  );
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
export async function syncSource(source: SourceRow, fromYm: string, toYm: string) {
  const row = await query<{ credential: string | null }>(
    `SELECT credential FROM calendar_source WHERE id = ?`,
    [source.id],
  );
  const refresh = row[0]?.credential;
  if (!refresh) return;

  const [from] = monthRange(fromYm);
  const [, to] = monthRange(toYm);

  try {
    if (source.provider !== 'google') {
      throw new Error('아직 구글만 가져옵니다');
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

    await execute(`UPDATE calendar_source SET synced_at = UTC_TIMESTAMP(), sync_error = NULL WHERE id = ?`, [
      source.id,
    ]);
  } catch (err) {
    // 조용히 옛 일정을 보여주지 않는다. 화면에 그대로 띄운다
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    await execute(`UPDATE calendar_source SET sync_error = ? WHERE id = ?`, [
      msg.slice(0, 200),
      source.id,
    ]);
  }
}

/** 보고 있는 달의 앞뒤 한 달까지 가져온다. 월을 넘길 때 빈 화면이 잠깐 보이지 않게 */
export async function syncAll(sources: SourceRow[], fromYm: string, toYm: string) {
  for (const s of sources) {
    if (s.connected === 1) await syncSource(s, fromYm, toYm);
  }
}
