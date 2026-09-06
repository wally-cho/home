import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.kakaoId) redirect('/');
  const { error } = await searchParams;

  return (
    <div className="app" style={{ display: 'grid', placeItems: 'center', padding: '0 28px' }}>
      <div style={{ width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em' }}>home</div>
        <p className="sub kr" style={{ margin: '10px 0 32px' }}>
          월 계획과 생활비를 한 곳에서 봅니다.
        </p>

        {error && (
          <p
            className="kr"
            style={{
              background: 'var(--red-soft)',
              color: 'var(--red)',
              borderRadius: 14,
              padding: '13px 16px',
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: 20,
              textAlign: 'left',
            }}
          >
            허용된 계정이 아닙니다. 이 가계부는 두 사람만 씁니다.
          </p>
        )}

        <form
          action={async () => {
            'use server';
            await signIn('kakao', { redirectTo: '/' });
          }}
        >
          <button className="btn" type="submit" style={{ background: '#fee500', color: '#191600' }}>
            카카오로 시작하기
          </button>
        </form>
      </div>
    </div>
  );
}
