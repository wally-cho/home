import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getCategories, getMethods } from '@/lib/categories';
import { usageByCategory } from '@/lib/entries';
import { getPlan } from '@/lib/plan';
import { today } from '@/lib/month';
import { SettingsScreen } from '@/components/SettingsScreen';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const t = today();

  // 카테고리 사용액은 보고 있는 달이 아니라 '이번 달' 기준이다.
  // 설정은 특정 달에 매이지 않으므로 이 화면에는 월 선택이 없다.
  const [categories, methods, usage, groups] = await Promise.all([
    getCategories(),
    getMethods(),
    usageByCategory(t.ym),
    getPlan(t.ym),
  ]);

  return (
    <SettingsScreen
      categories={categories}
      usage={Object.fromEntries(usage)}
      methods={methods.map((mm) => ({
        id: mm.id,
        name: mm.name,
        groups: groups.filter((g) => g.method === mm.name).map((g) => g.name),
      }))}
    />
  );
}
