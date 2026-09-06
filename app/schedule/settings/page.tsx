import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getSources } from '@/lib/calendar';
import { ScheduleSettingsScreen } from '@/components/ScheduleSettingsScreen';

export const dynamic = 'force-dynamic';

export default async function ScheduleSettingsPage() {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  return <ScheduleSettingsScreen sources={await getSources()} />;
}
