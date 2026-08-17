import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getPlan, totalsOf, upcomingOf } from '@/lib/plan';
import { getEntries, spentOf, byDayOf, categoryOrder, usageByCategory } from '@/lib/entries';
import { getMethods, getVisibleCategories } from '@/lib/categories';
import { daysInMonth, MONTH_COOKIE, pickYm, today } from '@/lib/month';
import { HomeScreen } from '@/components/HomeScreen';
import { SpendChart } from '@/components/SpendChart';

// 모든 페이지가 동적이다. DB를 읽으므로 프리렌더할 것이 없고
// CloudFront가 HTML을 캐시하지 않는다(CachingDisabled).
export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const t = today();
  const { m } = await searchParams;
  // 월은 화면 전체가 공유한다. URL이 우선이고, 없으면 쿠키다
  const ym = pickYm(m, (await cookies()).get(MONTH_COOKIE)?.value);
  const isThisMonth = ym === t.ym;

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
  const spent = spentOf(entries);
  const dim = daysInMonth(ym);
  const byDay = byDayOf(entries);
  const lastDay = isThisMonth ? t.d : dim;

  return (
    <HomeScreen
      ym={ym}
      todayYmd={t.ymd}
      isThisMonth={isThisMonth}
      budget={totals.budget}
      spent={spent}
      entries={entries}
      upcoming={upcomingOf(groups, isThisMonth ? t.d : 1)}
      categories={categories}
      methods={methods}
      defaultMethodId={defaultMethodId}
      order={order}
      usage={Object.fromEntries(usage)}
      chart={
        <SpendChart
          byDay={byDay}
          budget={totals.budget}
          daysInMonth={dim}
          lastDay={lastDay}
        />
      }
    />
  );
}
