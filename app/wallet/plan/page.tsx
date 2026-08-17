import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getPlan, totalsOf } from '@/lib/plan';
import { categoryOrder, getEntries, spentOf, usageByCategory } from '@/lib/entries';
import { getMethods, getVisibleCategories } from '@/lib/categories';
import { query, BOOK_ID } from '@/lib/db';
import { MONTH_COOKIE, pickYm, today } from '@/lib/month';
import { PlanScreen } from '@/components/PlanScreen';
import type { LoanRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const t = today();
  const { m } = await searchParams;
  // 월은 화면 전체가 공유한다. URL이 우선이고, 없으면 쿠키다
  const ym = pickYm(m, (await cookies()).get(MONTH_COOKIE)?.value);

  const [groups, entries, methods, loans, categories, order, usage] = await Promise.all([
    getPlan(ym),
    getEntries(ym),
    getMethods(),
    query<LoanRow>(
      `SELECT id, name, note, monthly, balance, sort_order FROM loan WHERE book_id = ?
        ORDER BY sort_order, id`,
      [BOOK_ID],
    ),
    getVisibleCategories(),
    categoryOrder(),
    usageByCategory(ym),
  ]);

  const totals = totalsOf(groups);
  // 새 기록의 기본 지급 수단은 계획의 유동 예산 그룹이 쓰는 것이다.
  // 유동 80만이 수협에서 나가기로 되어 있으면 기록도 거기서 시작한다
  const variable = groups.find((g) => g.isVariable);
  const defaultMethodId = methods.find((m) => m.name === variable?.method)?.id ?? null;

  return (
    <PlanScreen
      ym={ym}
      todayYmd={t.ymd}
      isThisMonth={ym === t.ym}
      groups={groups}
      income={totals.income}
      expense={totals.expense}
      budget={totals.budget}
      spent={spentOf(entries)}
      balance={totals.balance}
      methods={methods}
      loans={loans}
      categories={categories}
      defaultMethodId={defaultMethodId}
      order={order}
      usage={Object.fromEntries(usage)}
    />
  );
}
