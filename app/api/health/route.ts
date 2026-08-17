import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

// 배포 헬스체크. GitHub Actions와 컨테이너 헬스체크가 이걸 때린다.
// DB까지 확인해야 "떴는데 DB를 못 붙는" 상태를 잡아낸다.

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await queryOne<{ ok: number }>('SELECT 1 AS ok');
    return NextResponse.json({ status: 'ok', db: 'ok' });
  } catch (e) {
    return NextResponse.json(
      { status: 'error', db: 'fail', message: (e as Error).message },
      { status: 503 },
    );
  }
}
