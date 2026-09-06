import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { AREA_COOKIE, DEFAULT_AREA, areaBySlug } from '@/lib/areas';
import { getCategories, getMethods } from '@/lib/categories';
import { usageByCategory } from '@/lib/entries';
import { getPlan } from '@/lib/plan';
import { getSources } from '@/lib/calendar';
import { today } from '@/lib/month';
import { SettingsScreen } from '@/components/SettingsScreen';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const t = today();

  // 설정은 영역 밖이라 하단 네비가 어느 영역의 칸을 그릴지 스스로 알 수 없다.
  // 들어오기 전에 보던 영역을 쿠키에서 읽어 넘긴다
  const slug = (await cookies()).get(AREA_COOKIE)?.value;

  // 카테고리 사용액은 보고 있는 달이 아니라 '이번 달' 기준이다.
  // 설정은 특정 달에 매이지 않으므로 이 화면에는 월 선택이 없다.
  const [categories, methods, usage, groups, sources] = await Promise.all([
    getCategories(),
    getMethods(),
    usageByCategory(t.ym),
    getPlan(t.ym),
    getSources(),
  ]);

  return (
    <SettingsScreen
      area={(areaBySlug(slug) ?? DEFAULT_AREA).slug}
      sources={sources}
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
