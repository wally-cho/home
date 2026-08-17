import { query, BOOK_ID } from './db';
import type { PlanGroup, PlanItem, PlanRow } from './types';
import { shiftYm, today } from './month';

/**
 * 특정 달의 계획.
 *
 * 쿼리 하나가 /plan 과 홈의 계획 부분을 다 만든다. 합계와 잔액은 이 결과를
 * 앱에서 접어서 계산한다 - SQL로 그룹 합계와 총계를 동시에 내려면 ROLLUP이
 * 필요하고, 행 스무 개짜리에 그건 과하다.
 */
export async function getPlan(ym: string): Promise<PlanGroup[]> {
  const rows = await query<PlanRow>(
    `SELECT g.id AS group_id, g.kind, g.name AS group_name, g.is_variable, g.rail,
            gm.name AS group_method, g.method_id,
            i.id AS item_id, i.name AS item_name, i.amount AS base_amount,
            -- 그 달의 금액: 이 달만의 예외 > 그 달까지의 최신 변경값 > 최초 금액
            COALESCE(o.amount, pa.amount, i.amount) AS amount,
            o.item_id IS NOT NULL AS overridden,
            COALESCE(o.skipped, 0) AS skipped,
            i.pay_day, i.start_ym, i.end_ym, i.accrues, i.loan_id,
            COALESCE(o.memo, i.memo) AS memo, i.memo AS item_memo,
            l.name AS loan_name, s.total AS loan_suggestion,
            im.name AS item_method
       FROM plan_group g
       JOIN plan_item i        ON i.group_id = g.id AND i.archived_at IS NULL
       LEFT JOIN plan_override o ON o.item_id = i.id AND o.ym = ?
       LEFT JOIN plan_amount pa
              ON pa.item_id = i.id
             AND pa.from_ym = (SELECT MAX(x.from_ym) FROM plan_amount x
                                WHERE x.item_id = i.id AND x.from_ym <= ?)
       LEFT JOIN method gm     ON gm.id = g.method_id
       LEFT JOIN method im     ON im.id = i.method_id
       LEFT JOIN loan l        ON l.id = i.loan_id
       LEFT JOIN loan_schedule s ON s.loan_id = i.loan_id AND s.ym = ?
      WHERE g.book_id = ? AND g.archived_at IS NULL
        AND (i.start_ym IS NULL OR i.start_ym <= ?)
        AND (i.end_ym   IS NULL OR i.end_ym   >= ?)
      ORDER BY g.sort_order, g.id, i.sort_order, i.id`,
    // 플레이스홀더 등장 순서: override.ym · plan_amount.from_ym · schedule.ym
    //                        · book_id · start_ym · end_ym
    [ym, ym, ym, BOOK_ID, ym, ym],
  );

  const accrued = await getAccrued();

  const groups: PlanGroup[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.id === r.group_id);
    if (!g) {
      g = {
        id: r.group_id,
        kind: r.kind,
        name: r.group_name,
        method: r.group_method,
        methodId: r.method_id,
        isVariable: !!r.is_variable,
        rail: r.rail,
        items: [],
        sum: 0,
      };
      groups.push(g);
    }
    const item: PlanItem = {
      id: r.item_id,
      name: r.item_name,
      amount: r.skipped ? 0 : Number(r.amount),
      baseAmount: Number(r.base_amount),
      overridden: !!r.overridden,
      skipped: !!r.skipped,
      payDay: r.pay_day,
      startYm: r.start_ym,
      endYm: r.end_ym,
      memo: r.item_method && !r.item_name ? r.memo : r.memo,
      accrues: !!r.accrues,
      accrued: accrued.get(r.item_id) ?? 0,
      loanId: r.loan_id,
      loanSuggestion: r.loan_suggestion === null ? null : Number(r.loan_suggestion),
      methodId: null,
    };
    g.items.push(item);
    g.sum += item.amount;
  }
  return groups;
}

/**
 * 적립형 항목의 누적액.
 *
 * 금액이 달마다 다를 수 있으므로 시작월부터 이번 달까지 한 달씩 훑는다.
 * 기본금액 × 개월로 줄여 쓰던 계산은 금액에 시점이 생긴 뒤로 맞지 않는다.
 * 적립 항목은 몇 개뿐이고 개월도 수십 개라 훑는 비용이 문제되지 않는다.
 */
async function getAccrued(): Promise<Map<number, number>> {
  const nowYm = today().ym;
  const items = await query<{ id: number; amount: number; start_ym: string | null; end_ym: string | null }>(
    `SELECT id, amount, start_ym, end_ym FROM plan_item
      WHERE book_id = ? AND accrues = 1 AND archived_at IS NULL`,
    [BOOK_ID],
  );
  if (items.length === 0) return new Map();

  const ids = items.map((i) => i.id);
  const marks = new Map(ids.map((id) => [id, [] as { ym: string; amount: number }[]]));
  const overrides = new Map(ids.map((id) => [id, new Map<string, { amount: number | null; skipped: boolean }>()]));

  // execute()는 준비된 문장이라 IN (?) 에 배열을 펼쳐주지 않는다(조용히 0행이 된다).
  // id는 DB에서 방금 읽은 정수라 그대로 박아도 안전하다
  const idList = ids.map((n) => Number(n)).join(',');

  for (const r of await query<{ item_id: number; from_ym: string; amount: number }>(
    `SELECT item_id, from_ym, amount FROM plan_amount
      WHERE item_id IN (${idList}) ORDER BY from_ym`,
  )) {
    marks.get(r.item_id)?.push({ ym: r.from_ym, amount: Number(r.amount) });
  }
  for (const r of await query<{ item_id: number; ym: string; amount: number | null; skipped: 0 | 1 }>(
    `SELECT item_id, ym, amount, skipped FROM plan_override WHERE item_id IN (${idList})`,
  )) {
    overrides.get(r.item_id)?.set(r.ym, {
      amount: r.amount === null ? null : Number(r.amount),
      skipped: !!r.skipped,
    });
  }

  const out = new Map<number, number>();
  for (const it of items) {
    if (!it.start_ym) continue;
    const last = it.end_ym && it.end_ym < nowYm ? it.end_ym : nowYm;
    const hist = marks.get(it.id) ?? [];
    const ovr = overrides.get(it.id) ?? new Map();
    let total = 0;
    for (let ym = it.start_ym; ym <= last; ym = shiftYm(ym, 1)) {
      const o = ovr.get(ym);
      if (o?.skipped) continue;
      const mark = [...hist].reverse().find((m) => m.ym <= ym);
      total += o?.amount ?? mark?.amount ?? Number(it.amount);
    }
    out.set(it.id, total);
  }
  return out;
}

export interface PlanTotals {
  income: number;
  expense: number;
  budget: number;
  balance: number;
}

export function totalsOf(groups: PlanGroup[]): PlanTotals {
  let income = 0;
  let expense = 0;
  let budget = 0;
  for (const g of groups) {
    if (g.kind === 'income') income += g.sum;
    else expense += g.sum;
    if (g.isVariable) budget += g.sum;
  }
  return { income, expense, budget, balance: income - expense };
}

export interface Upcoming {
  day: number;
  name: string;
  method: string | null;
  amount: number;
  past: boolean;
}

/** 결제 예정 - 오늘부터 7일. 지난 것은 닷새까지 흐리게 남긴다(빠져나갔는지 확인용) */
export function upcomingOf(groups: PlanGroup[], todayDay: number): Upcoming[] {
  const out: Upcoming[] = [];
  for (const g of groups) {
    if (g.kind === 'income') continue;
    for (const it of g.items) {
      if (!it.payDay) continue;
      const diff = it.payDay - todayDay;
      if (diff > 7 || diff < -5) continue;
      out.push({
        day: it.payDay,
        name: it.name ?? g.name,
        method: g.method,
        amount: it.amount,
        past: diff < 0,
      });
    }
  }
  return out.sort((a, b) => a.day - b.day);
}

/** 그 달에 결제 예정이 있는 날 - 달력에 점을 찍는다 */
export function payDaysOf(groups: PlanGroup[]): Set<number> {
  const days = new Set<number>();
  for (const g of groups) {
    if (g.kind === 'income') continue;
    for (const it of g.items) if (it.payDay) days.add(it.payDay);
  }
  return days;
}
