import { query, BOOK_ID } from './db';
import type { CategoryRow, MethodRow } from './types';

export async function getCategories(): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    `SELECT id, name, sort_order, is_fallback, hidden_at
       FROM category WHERE book_id = ?
      ORDER BY sort_order, id`,
    [BOOK_ID],
  );
}

/** 입력 화면에 보일 카테고리. 숨긴 것은 뺀다 */
export async function getVisibleCategories(): Promise<CategoryRow[]> {
  return (await getCategories()).filter((c) => !c.hidden_at);
}

export async function getMethods(): Promise<MethodRow[]> {
  return query<MethodRow>(
    `SELECT id, name, sort_order FROM method WHERE book_id = ? ORDER BY sort_order, id`,
    [BOOK_ID],
  );
}
