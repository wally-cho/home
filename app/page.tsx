import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AREA_COOKIE, DEFAULT_AREA, areaBySlug } from '@/lib/areas';

/**
 * 루트에는 화면이 없다. 마지막으로 본 영역으로 보낸다.
 *
 * 홈 화면 아이콘과 북마크가 `/`를 가리키므로 여기를 영역 하나에 묶어두면
 * 그 영역이 특별해진다. 영역은 전부 같은 모양이어야 나중에 하나를 빼거나
 * 순서를 바꿔도 아무 데도 안 걸린다.
 */
export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const slug = (await cookies()).get(AREA_COOKIE)?.value;
  redirect(`/${(areaBySlug(slug) ?? DEFAULT_AREA).slug}`);
}
