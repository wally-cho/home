import { query, BOOK_ID } from './db';
import type { EntryRow } from './types';
import { monthRange } from './month';

/** 그 달 생활비 기록. 날짜 내림차순 */
export async function getEntries(ym: string): Promise<EntryRow[]> {
  const [from, to] = monthRange(ym);
  return query<EntryRow>(
    `SELECT e.id, e.amount, e.occurred_on, e.memo, e.category_id, c.name AS category_name,
            e.method_id, m.name AS method_name
       FROM entry e
       JOIN category c ON c.id = e.category_id
       LEFT JOIN method m ON m.id = e.method_id
      WHERE e.book_id = ? AND e.deleted_at IS NULL
        AND e.occurred_on BETWEEN ? AND ?
      ORDER BY e.occurred_on DESC, e.id DESC`,
    [BOOK_ID, from, to],
  );
}

/** 그 달 유동 실지출 합계 */
export function spentOf(entries: EntryRow[]): number {
  return entries.reduce((a, e) => a + Number(e.amount), 0);
}

/** 일별 합계 - 달력 칸과 누적 곡선이 쓴다 */
export function byDayOf(entries: EntryRow[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) {
    const d = Number(e.occurred_on.slice(8, 10));
    m.set(d, (m.get(d) ?? 0) + Number(e.amount));
  }
  return m;
}

/**
 * 카테고리 순서 - 최근 쓴 것 먼저.
 *
 * category.last_used_at 컬럼으로 비정규화하고 싶어지겠지만 하지 않는다.
 * 쓰기마다 UPDATE가 하나 더 붙고, 이 규모에서 GROUP BY가 느려질 일이 없다.
 */
export async function categoryOrder(): Promise<number[]> {
  const rows = await query<{ category_id: number }>(
    `SELECT e.category_id, MAX(e.id) AS last_used
       FROM entry e
      WHERE e.book_id = ? AND e.deleted_at IS NULL
      GROUP BY e.category_id
      ORDER BY last_used DESC`,
    [BOOK_ID],
  );
  return rows.map((r) => r.category_id);
}

/** 카테고리별 이번 달 사용액 - 입력 화면과 설정 화면이 쓴다 */
export async function usageByCategory(ym: string): Promise<Map<number, number>> {
  const [from, to] = monthRange(ym);
  const rows = await query<{ category_id: number; total: number }>(
    `SELECT category_id, SUM(amount) AS total
       FROM entry
      WHERE book_id = ? AND deleted_at IS NULL AND occurred_on BETWEEN ? AND ?
      GROUP BY category_id`,
    [BOOK_ID, from, to],
  );
  return new Map(rows.map((r) => [r.category_id, Number(r.total)]));
}
