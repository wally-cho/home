/** DB 행 타입. 캐스팅을 한 곳에 몰아둬야 스키마가 바뀔 때 찾을 곳이 명확하다 */

export type Kind = 'income' | 'expense';

export interface MethodRow {
  id: number;
  name: string;
  sort_order: number;
}

export interface CategoryRow {
  id: number;
  name: string;
  sort_order: number;
  is_fallback: 0 | 1;
  hidden_at: Date | null;
}

export interface LoanRow {
  id: number;
  name: string;
  note: string | null;
  monthly: number | null;
  balance: number | null;
  sort_order: number;
}

export interface ScheduleRow {
  loan_id: number;
  seq: number;
  ym: string;
  due_date: string;
  business_date: string | null;
  total: number;
  principal: number;
  interest: number;
  balance: number;
}

/** 계획 조회 결과 한 줄. 그룹과 항목을 조인해서 받는다 */
export interface PlanRow {
  group_id: number;
  kind: Kind;
  group_name: string;
  is_variable: 0 | 1;
  rail: string;
  group_method: string | null;
  item_id: number;
  item_name: string | null;
  base_amount: number;
  amount: number;
  overridden: 0 | 1;
  skipped: 0 | 1;
  pay_day: number | null;
  start_ym: string | null;
  end_ym: string | null;
  memo: string | null;
  item_memo: string | null;
  accrues: 0 | 1;
  loan_id: number | null;
  loan_name: string | null;
  loan_suggestion: number | null;
  item_method: string | null;
  method_id: number | null;
}

export interface EntryRow {
  id: number;
  amount: number;
  occurred_on: string;
  memo: string | null;
  category_id: number;
  category_name: string;
  method_id: number | null;
  method_name: string | null;
}

/** 화면에 넘기는 계획 구조 */
export interface PlanItem {
  id: number;
  name: string | null;
  amount: number;
  baseAmount: number;
  overridden: boolean;
  skipped: boolean;
  payDay: number | null;
  startYm: string | null;
  endYm: string | null;
  memo: string | null;
  accrues: boolean;
  accrued: number;
  loanId: number | null;
  loanSuggestion: number | null;
  methodId: number | null;
}

export interface PlanGroup {
  id: number;
  kind: Kind;
  name: string;
  method: string | null;
  methodId: number | null;
  isVariable: boolean;
  rail: string;
  items: PlanItem[];
  sum: number;
}
