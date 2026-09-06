import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getSources, getEvents } from '@/lib/calendar';
import { MONTH_COOKIE, pickYm, today } from '@/lib/month';
import { ScheduleListScreen } from '@/components/ScheduleListScreen';

export const dynamic = 'force-dynamic';

export default async function ScheduleListPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const { m } = await searchParams;
  const ym = pickYm(m, (await cookies()).get(MONTH_COOKIE)?.value);

  // 여기서는 가져오지 않는다. 달력 화면이 24시간 규칙을 맡는다 -
  // 두 화면이 다 가져오면 탭을 옮길 때마다 구글을 두 번 부른다
  const [sources, events] = await Promise.all([getSources(), getEvents(ym)]);

  return (
    <ScheduleListScreen ym={ym} todayYmd={today().ymd} sources={sources} events={events} />
  );
}
