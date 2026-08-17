import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getPlan, payDaysOf, totalsOf } from '@/lib/plan';
import { byDayOf, categoryOrder, getEntries, spentOf, usageByCategory } from '@/lib/entries';
import { getMethods, getVisibleCategories } from '@/lib/categories';
import { daysInMonth, firstDow, MONTH_COOKIE, pickYm, today } from '@/lib/month';
import { CalendarScreen } from '@/components/CalendarScreen';

export const dynamic = 'force-dynamic';

export default async function LogPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const t = today();
  const { m } = await searchParams;
  // 월은 화면 전체가 공유한다. URL이 우선이고, 없으면 쿠키다
  const ym = pickYm(m, (await cookies()).get(MONTH_COOKIE)?.value);

  const [groups, entries, categories, methods, order, usage] = await Promise.all([
    getPlan(ym),
    getEntries(ym),
    getVisibleCategories(),
    getMethods(),
    categoryOrder(),
    usageByCategory(ym),
  ]);

  const totals = totalsOf(groups);
  // 새 기록의 기본 지급 수단은 계획의 유동 예산 그룹이 쓰는 것이다.
  // 유동 80만이 수협에서 나가기로 되어 있으면 기록도 거기서 시작한다
  const variable = groups.find((g) => g.isVariable);
  const defaultMethodId = methods.find((m) => m.name === variable?.method)?.id ?? null;

  // 날짜별 계획 결제 - 날짜를 탭하면 기록과 함께 보인다
  const plansByDay: Record<number, { name: string; method: string | null; amount: number }[]> = {};
  for (const g of groups) {
    if (g.kind === 'income') continue;
    for (const it of g.items) {
      if (!it.payDay) continue;
      (plansByDay[it.payDay] ??= []).push({
        name: it.name ?? g.name,
        method: g.method,
        amount: it.amount,
      });
    }
  }

  return (
    <CalendarScreen
      ym={ym}
      isThisMonth={ym === t.ym}
      todayDay={t.d}
      daysInMonth={daysInMonth(ym)}
      firstDow={firstDow(ym)}
      budget={totals.budget}
      spent={spentOf(entries)}
      byDay={Object.fromEntries(byDayOf(entries))}
      payDays={[...payDaysOf(groups)]}
      entries={entries}
      plansByDay={plansByDay}
      categories={categories}
      methods={methods}
      defaultMethodId={defaultMethodId}
      order={order}
      usage={Object.fromEntries(usage)}
    />
  );
}
