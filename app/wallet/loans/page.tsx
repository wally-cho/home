import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { getLoans } from '@/lib/loans';
import { MONTH_COOKIE, pickYm } from '@/lib/month';
import { LoansScreen } from '@/components/LoansScreen';

export const dynamic = 'force-dynamic';

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  // 허용 목록에 있는지 요청마다 확인한다. 목록에서 빠지면 다음 요청부터 막힌다
  if (!(await currentUser())) redirect('/login');

  const { m } = await searchParams;
  const ym = pickYm(m, (await cookies()).get(MONTH_COOKIE)?.value);
  const loans = await getLoans(ym);

  return <LoansScreen ym={ym} loans={loans} />;
}
