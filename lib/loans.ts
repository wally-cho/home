import { query, BOOK_ID } from './db';
import type { LoanRow, ScheduleRow } from './types';
import { shiftYm } from './month';

export interface LoanView {
  id: number;
  name: string;
  note: string | null;
  /** 상환표가 없는 대출(신용대출: 만기일시상환) */
  flat: boolean;
  thisMonth: number | null;
  nextMonth: number | null;
  balance: number | null;
  count: number;
  endYm: string | null;
  rows: ScheduleRow[];
}

/**
 * 대출 목록. 상환표는 이번 달 주변만 가져온다 - 480회차를 전부 내려보낼 이유가 없다.
 * 앱이 원리금을 계산하지 않는다. 은행이 준 표를 그대로 읽는다.
 */
export async function getLoans(ym: string, window = 6): Promise<LoanView[]> {
  const loans = await query<LoanRow>(
    `SELECT id, name, note, monthly, balance, sort_order
       FROM loan WHERE book_id = ? ORDER BY sort_order, id`,
    [BOOK_ID],
  );

  const from = shiftYm(ym, -Math.floor(window / 2));
  const to = shiftYm(ym, Math.ceil(window / 2));

  const out: LoanView[] = [];
  for (const l of loans) {
    const stats = await query<{ n: number; end_ym: string | null; last_balance: number | null }>(
      `SELECT COUNT(*) AS n, MAX(ym) AS end_ym,
              (SELECT balance FROM loan_schedule WHERE loan_id = ? AND ym <= ?
                ORDER BY ym DESC LIMIT 1) AS last_balance
         FROM loan_schedule WHERE loan_id = ?`,
      [l.id, ym, l.id],
    );
    const count = Number(stats[0]?.n ?? 0);
    const rows =
      count === 0
        ? []
        : await query<ScheduleRow>(
            `SELECT loan_id, seq, ym, due_date, business_date, total, principal, interest, balance
               FROM loan_schedule
              WHERE loan_id = ? AND ym BETWEEN ? AND ?
              ORDER BY seq`,
            [l.id, from, to],
          );

    const cur = rows.find((r) => r.ym === ym);
    const nxt = rows.find((r) => r.ym === shiftYm(ym, 1));
    out.push({
      id: l.id,
      name: l.name,
      note: l.note,
      flat: count === 0,
      thisMonth: count === 0 ? (l.monthly === null ? null : Number(l.monthly)) : (cur?.total ?? null),
      nextMonth: count === 0 ? null : (nxt?.total ?? null),
      balance:
        count === 0
          ? l.balance === null
            ? null
            : Number(l.balance)
          : stats[0]?.last_balance === null || stats[0]?.last_balance === undefined
            ? null
            : Number(stats[0].last_balance),
      count,
      endYm: stats[0]?.end_ym ?? null,
      rows,
    });
  }
  return out;
}
