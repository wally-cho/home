import { NextResponse } from 'next/server';
import { currentUser } from '@/auth';
import { getSources, syncAll } from '@/lib/calendar';
import { cookies } from 'next/headers';
import { MONTH_COOKIE, pickYm, shiftYm } from '@/lib/month';

/**
 * 새로고침 버튼이 부르는 자리. 24시간을 안 기다리고 지금 가져온다.
 *
 * 서버 액션이 아니라 라우트인 것은 이것이 화면을 바꾸는 쓰기가 아니라 바깥에서
 * 당겨오는 일이기 때문이다. 부르고 나서 화면은 `router.refresh()`가 다시 그린다.
 */
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!(await currentUser())) return NextResponse.json({ ok: false }, { status: 401 });

  const ym = pickYm(undefined, (await cookies()).get(MONTH_COOKIE)?.value);
  const sources = await getSources();
  await syncAll(sources, shiftYm(ym, -1), shiftYm(ym, 1));

  return NextResponse.json({ ok: true });
}
