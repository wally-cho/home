'use server';

import { revalidatePath } from 'next/cache';
import { execute, queryOne, BOOK_ID } from './db';
import { currentUser } from '@/auth';
import { isYm } from './month';
import { WALLET, SCHEDULE, pathsOf } from './areas';

/**
 * 쓰기는 전부 서버 액션이다. API 라우트를 만들지 않는다 -
 * CloudFront 기본 동작이 AllViewer 원본 요청 정책이라 POST와 쿠키가 그대로 넘어간다.
 *
 * 모든 액션은 세션을 확인한다. proxy.ts는 쿠키가 있는지만 보므로
 * 실제 서명 검증은 여기서 한다.
 */
async function requireUser(): Promise<string> {
  const id = await currentUser();
  if (!id) throw new Error('로그인이 필요합니다');
  return id;
}

// 가계부 영역의 화면들. 경로를 손으로 적지 않는다 -
// 새 화면을 붙였을 때 그 화면만 옛 데이터를 보여주게 된다.
// 설정은 영역 안에 있으므로(`/wallet/settings`) 함께 턴다
function refresh() {
  for (const p of pathsOf(WALLET)) revalidatePath(p);
  revalidatePath('/wallet/settings');
}

// ── 생활비 기록 ─────────────────────────────────────────────

export async function addEntry(input: {
  amount: number;
  categoryId: number;
  methodId: number | null;
  occurredOn: string;
  memo?: string | null;
}) {
  const who = await requireUser();
  if (!(input.amount > 0)) throw new Error('금액을 넣어주세요');
  await execute(
    `INSERT INTO entry (book_id, category_id, method_id, amount, occurred_on, memo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      BOOK_ID,
      input.categoryId,
      input.methodId,
      input.amount,
      input.occurredOn,
      input.memo || null,
      who,
    ],
  );
  refresh();
}

export async function updateEntry(input: {
  id: number;
  amount: number;
  categoryId: number;
  methodId: number | null;
  occurredOn: string;
  memo?: string | null;
}) {
  await requireUser();
  if (!(input.amount > 0)) throw new Error('금액을 넣어주세요');
  await execute(
    `UPDATE entry SET amount = ?, category_id = ?, method_id = ?, occurred_on = ?, memo = ?
      WHERE id = ? AND book_id = ? AND deleted_at IS NULL`,
    [
      input.amount,
      input.categoryId,
      input.methodId,
      input.occurredOn,
      input.memo || null,
      input.id,
      BOOK_ID,
    ],
  );
  refresh();
}

/** 삭제는 소프트 삭제다. 되돌리기가 되어야 하고, 상대가 지운 것도 복구해야 한다 */
export async function deleteEntry(id: number) {
  await requireUser();
  await execute(`UPDATE entry SET deleted_at = NOW() WHERE id = ? AND book_id = ?`, [id, BOOK_ID]);
  refresh();
}

export async function restoreEntry(id: number) {
  await requireUser();
  await execute(`UPDATE entry SET deleted_at = NULL WHERE id = ? AND book_id = ?`, [id, BOOK_ID]);
  refresh();
}

// ── 월 계획 ─────────────────────────────────────────────────

/**
 * 목록에서 바로 고치는 금액. **그 달부터** 적용된다.
 *
 * 금액을 바꾸는 것은 "이 달부터 이렇게 낸다"는 뜻이다. 정의 하나를 고치면
 * override가 없는 지난 달 화면까지 따라 바뀌고, 그 달만 고치면 다음 달에
 * 또 고쳐야 한다. 둘 다 의도가 아니다.
 *
 * 그 달만 바꾸고 싶으면 상세 시트의 '이 달만 수정'을 쓴다.
 */
export async function setItemAmount(itemId: number, ym: string, amount: number) {
  await requireUser();
  if (!isYm(ym)) throw new Error('잘못된 월입니다');
  const value = Math.max(0, Math.round(amount));

  // 그 달에 '이 달만' 예외가 걸려 있었다면 거둔다. 방금 한 편집이 더 나중의 뜻이다
  await execute(`DELETE FROM plan_override WHERE item_id = ? AND ym = ?`, [itemId, ym]);
  await execute(
    `INSERT INTO plan_amount (item_id, from_ym, amount) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
    [itemId, ym, value],
  );
  refresh();
}

export async function saveItem(input: {
  id: number | null;
  groupId: number;
  name: string | null;
  amount: number;
  payDay: number | null;
  startYm: string | null;
  endYm: string | null;
  memo: string | null;
  accrues: boolean;
  loanId: number | null;
  onlyThisMonth: boolean;
  ym: string;
}) {
  await requireUser();
  if (!isYm(input.ym)) throw new Error('잘못된 월입니다');
  const amount = Math.max(0, Math.round(input.amount));

  let id = input.id;
  if (id === null) {
    const next = await queryOne<{ n: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM plan_item WHERE group_id = ?`,
      [input.groupId],
    );
    const res = await execute(
      `INSERT INTO plan_item
         (book_id, group_id, name, amount, pay_day, start_ym, end_ym, loan_id, accrues, memo, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        BOOK_ID,
        input.groupId,
        input.name,
        amount,
        input.payDay,
        input.startYm,
        input.endYm,
        input.loanId,
        input.accrues ? 1 : 0,
        input.memo,
        next?.n ?? 10,
      ],
    );
    id = res.insertId;
    // 새 항목의 금액도 시점을 남긴다. 넣은 달부터 적용된다
    await execute(`INSERT INTO plan_amount (item_id, from_ym, amount) VALUES (?, ?, ?)`, [
      id,
      input.startYm && input.startYm < input.ym ? input.startYm : input.ym,
      amount,
    ]);
  } else {
    await execute(
      `UPDATE plan_item
          SET name = ?, pay_day = ?, start_ym = ?, end_ym = ?, loan_id = ?, accrues = ?, memo = ?
        WHERE id = ? AND book_id = ?`,
      [
        input.name,
        input.payDay,
        input.startYm,
        input.endYm,
        input.loanId,
        input.accrues ? 1 : 0,
        input.memo,
        id,
        BOOK_ID,
      ],
    );
    if (input.onlyThisMonth) {
      await execute(
        `INSERT INTO plan_override (item_id, ym, amount) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = VALUES(amount), skipped = 0`,
        [id, input.ym, amount],
      );
    } else {
      // 금액은 그 달부터 적용된다. 지난 달은 그대로 둔다
      await execute(`DELETE FROM plan_override WHERE item_id = ? AND ym = ?`, [id, input.ym]);
      await execute(
        `INSERT INTO plan_amount (item_id, from_ym, amount) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
        [id, input.ym, amount],
      );
    }
  }
  refresh();
  return id;
}

/** 삭제 대신 아카이브한다. 항목을 지우면 과거 달에서도 사라지기 때문이다 */
export async function archiveItem(itemId: number) {
  await requireUser();
  await execute(`UPDATE plan_item SET archived_at = NOW() WHERE id = ? AND book_id = ?`, [
    itemId,
    BOOK_ID,
  ]);
  refresh();
}

export async function skipItemThisMonth(itemId: number, ym: string) {
  await requireUser();
  if (!isYm(ym)) throw new Error('잘못된 월입니다');
  await execute(
    `INSERT INTO plan_override (item_id, ym, skipped) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE skipped = 1`,
    [itemId, ym],
  );
  refresh();
}

export async function clearOverride(itemId: number, ym: string) {
  await requireUser();
  await execute(`DELETE FROM plan_override WHERE item_id = ? AND ym = ?`, [itemId, ym]);
  refresh();
}

export async function saveGroup(input: {
  id: number | null;
  name: string;
  methodId: number | null;
  isVariable: boolean;
  kind: 'income' | 'expense';
}) {
  await requireUser();
  const name = input.name.trim().slice(0, 12);
  if (!name) throw new Error('이름을 넣어주세요');

  if (input.isVariable) {
    // 유동 예산 그룹은 하나뿐이다. 일 기록의 예산이 둘이 되면 홈 화면이 성립하지 않는다
    await execute(`UPDATE plan_group SET is_variable = 0 WHERE book_id = ?`, [BOOK_ID]);
  }

  if (input.id === null) {
    const next = await queryOne<{ n: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM plan_group WHERE book_id = ?`,
      [BOOK_ID],
    );
    const res = await execute(
      `INSERT INTO plan_group (book_id, kind, name, method_id, is_variable, rail, sort_order)
       VALUES (?, ?, ?, ?, ?, 'save', ?)`,
      [BOOK_ID, input.kind, name, input.methodId, input.isVariable ? 1 : 0, next?.n ?? 10],
    );
    // 그룹만 만들면 쓸 수 없다. 이름 없는 항목 하나로 시작한다(항목 줄 하나로 그려진다)
    await execute(
      `INSERT INTO plan_item (book_id, group_id, name, amount, sort_order) VALUES (?, ?, NULL, 0, 10)`,
      [BOOK_ID, res.insertId],
    );
  } else {
    await execute(
      `UPDATE plan_group SET name = ?, method_id = ?, is_variable = ? WHERE id = ? AND book_id = ?`,
      [name, input.methodId, input.isVariable ? 1 : 0, input.id, BOOK_ID],
    );
  }
  refresh();
}

export async function archiveGroup(groupId: number) {
  await requireUser();
  await execute(`UPDATE plan_group SET archived_at = NOW() WHERE id = ? AND book_id = ?`, [
    groupId,
    BOOK_ID,
  ]);
  refresh();
}

// ── 지급 수단 ───────────────────────────────────────────────

export async function saveMethod(input: { id: number | null; name: string }) {
  await requireUser();
  const name = input.name.trim().slice(0, 12);
  if (!name) throw new Error('이름을 넣어주세요');

  if (input.id === null) {
    const next = await queryOne<{ n: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM method WHERE book_id = ?`,
      [BOOK_ID],
    );
    await execute(`INSERT INTO method (book_id, name, sort_order) VALUES (?, ?, ?)`, [
      BOOK_ID,
      name,
      next?.n ?? 10,
    ]);
  } else {
    await execute(`UPDATE method SET name = ? WHERE id = ? AND book_id = ?`, [
      name,
      input.id,
      BOOK_ID,
    ]);
  }
  refresh();
}

/**
 * 쓰는 곳이 없을 때만 지운다.
 *
 * 그룹이나 항목이 참조하고 있으면 지울 수 없다 - 카드 이름을 지우면 그 그룹이
 * 어디서 빠져나가는 돈인지 알 수 없게 된다. 이름만 바꾸면 되는 경우가 대부분이다.
 */
export async function deleteMethod(id: number) {
  await requireUser();
  const used = await queryOne<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM plan_group WHERE method_id = ?)
          + (SELECT COUNT(*) FROM plan_item  WHERE method_id = ?) AS n`,
    [id, id],
  );
  if ((used?.n ?? 0) > 0) throw new Error('이 수단을 쓰는 그룹이 있어 지울 수 없습니다');
  await execute(`DELETE FROM method WHERE id = ? AND book_id = ?`, [id, BOOK_ID]);
  refresh();
}

export async function moveMethod(id: number, dir: -1 | 1) {
  await requireUser();
  const me = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM method WHERE id = ? AND book_id = ?`,
    [id, BOOK_ID],
  );
  if (!me) return;
  const neighbor = await queryOne<{ id: number; sort_order: number }>(
    `SELECT id, sort_order FROM method
      WHERE book_id = ? AND sort_order ${dir < 0 ? '<' : '>'} ?
      ORDER BY sort_order ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`,
    [BOOK_ID, me.sort_order],
  );
  if (!neighbor) return;
  await execute(`UPDATE method SET sort_order = ? WHERE id = ?`, [neighbor.sort_order, id]);
  await execute(`UPDATE method SET sort_order = ? WHERE id = ?`, [me.sort_order, neighbor.id]);
  refresh();
}

// ── 카테고리 ────────────────────────────────────────────────

export async function saveCategory(input: { id: number | null; name: string; hidden: boolean }) {
  await requireUser();
  const name = input.name.trim().slice(0, 10);
  if (!name) throw new Error('이름을 넣어주세요');

  if (input.id === null) {
    const next = await queryOne<{ n: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 AS n
         FROM category WHERE book_id = ? AND is_fallback = 0`,
      [BOOK_ID],
    );
    await execute(`INSERT INTO category (book_id, name, sort_order) VALUES (?, ?, ?)`, [
      BOOK_ID,
      name,
      next?.n ?? 10,
    ]);
  } else {
    const row = await queryOne<{ is_fallback: 0 | 1 }>(
      `SELECT is_fallback FROM category WHERE id = ? AND book_id = ?`,
      [input.id, BOOK_ID],
    );
    // '기타'는 숨길 수 없다. 다른 카테고리를 숨길 때 갈 곳이 필요하다
    const hidden = row?.is_fallback ? false : input.hidden;
    await execute(
      `UPDATE category SET name = ?, hidden_at = ${hidden ? 'COALESCE(hidden_at, NOW())' : 'NULL'}
        WHERE id = ? AND book_id = ?`,
      [name, input.id, BOOK_ID],
    );
  }
  refresh();
}

/** 순서 이동. 앞뒤 카테고리와 sort_order를 맞바꾼다 */
export async function moveCategory(id: number, dir: -1 | 1) {
  await requireUser();
  const me = await queryOne<{ sort_order: number; is_fallback: 0 | 1 }>(
    `SELECT sort_order, is_fallback FROM category WHERE id = ? AND book_id = ?`,
    [id, BOOK_ID],
  );
  if (!me || me.is_fallback) return;
  const neighbor = await queryOne<{ id: number; sort_order: number }>(
    `SELECT id, sort_order FROM category
      WHERE book_id = ? AND is_fallback = 0 AND sort_order ${dir < 0 ? '<' : '>'} ?
      ORDER BY sort_order ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`,
    [BOOK_ID, me.sort_order],
  );
  if (!neighbor) return;
  await execute(`UPDATE category SET sort_order = ? WHERE id = ?`, [neighbor.sort_order, id]);
  await execute(`UPDATE category SET sort_order = ? WHERE id = ?`, [me.sort_order, neighbor.id]);
  refresh();
}

// ── 일정 (연결 해제) ────────────────────────────────────────

/**
 * 캘린더 연결을 끊는다.
 *
 * 자격을 지우고 가져온 일정도 함께 지운다. 조회 전용이라 남겨둘 이유가 없고,
 * 개인정보처리방침에 "연결을 끊으면 가져온 일정을 지웁니다"라고 적어뒀다.
 *
 * 소스 행 자체는 아카이브로 둔다. 다시 연결할 때 이름과 색을 그대로 쓴다.
 */
export async function disconnectCalendar(id: number) {
  await requireUser();
  await execute(`DELETE FROM calendar_event WHERE source_id = ?`, [id]);
  await execute(
    `UPDATE calendar_source
        SET credential = NULL, account = NULL, synced_at = NULL, sync_error = NULL,
            archived_at = UTC_TIMESTAMP()
      WHERE id = ? AND book_id = ?`,
    [id, BOOK_ID],
  );
  for (const p of pathsOf(SCHEDULE)) revalidatePath(p);
  revalidatePath('/schedule/settings');
}

/**
 * 캘린더 소스의 표시 이름을 바꾼다.
 *
 * 이름은 화면에 뜨는 라벨일 뿐이다. 신원은 `(provider, account)`라서 이름을 바꿔도
 * 재연결할 때 같은 줄을 찾는다. 처음 연결할 때 카카오 닉네임이 그대로 들어오는데,
 * 필터 칩에 들어갈 길이가 아니라 여기서 줄인다.
 */
export async function renameCalendar(id: number, owner: string) {
  await requireUser();
  const name = owner.trim().slice(0, 12);
  if (!name) return;
  await execute(`UPDATE calendar_source SET owner = ? WHERE id = ? AND book_id = ?`, [
    name,
    id,
    BOOK_ID,
  ]);
  for (const p of pathsOf(SCHEDULE)) revalidatePath(p);
  revalidatePath('/schedule/settings');
}
