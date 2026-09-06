import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getSources, getEvents, byDayOf, needsSync, syncAll } from '@/lib/calendar';
import { daysInMonth, firstDow, MONTH_COOKIE, pickYm, shiftYm, today } from '@/lib/month';
import { ScheduleScreen } from '@/components/ScheduleScreen';

export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const t = today();
  const { m } = await searchParams;
  // 월은 가계부와 같은 쿠키를 공유한다. 영역을 오가도 같은 달을 본다
  const ym = pickYm(m, (await cookies()).get(MONTH_COOKIE)?.value);

  let sources = await getSources();

  // 배치를 만들지 않는다. 화면을 열 때 24시간이 지났으면 그때 가져온다.
  // 보고 있는 달의 앞뒤 한 달까지 - 월을 넘길 때 빈 화면이 잠깐 보이지 않게
  if (needsSync(sources)) {
    await syncAll(sources, shiftYm(ym, -1), shiftYm(ym, 1));
    sources = await getSources();
  }

  const events = await getEvents(ym);

  return (
    <ScheduleScreen
      ym={ym}
      todayDay={t.d}
      isThisMonth={ym === t.ym}
      daysInMonth={daysInMonth(ym)}
      firstDow={firstDow(ym)}
      sources={sources}
      byDay={Object.fromEntries(byDayOf(events, ym))}
    />
  );
}
