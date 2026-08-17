import NextAuth, { type DefaultSession } from 'next-auth';
import Kakao from 'next-auth/providers/kakao';
// 모듈 보강(declare module)을 하려면 해당 모듈이 먼저 해석돼야 한다
import type {} from 'next-auth/jwt';

/**
 * 로그인은 문지기다. 허용한 카카오 계정 둘(나·아내)만 통과시킨다.
 *
 * handari와 다르게 회원 테이블을 만들지 않는다. 둘뿐인 사용자를 테이블로 관리하면
 * 회원 행을 만들고 지우고 닉네임을 동기화하는 코드가 전부 하는 일 없이 남는다.
 * 데이터는 공용 단일 가계부이므로 book_id는 계속 1이다.
 *
 * AUTH_KAKAO_ID / AUTH_KAKAO_SECRET / AUTH_SECRET 은 Auth.js가 환경변수에서 자동으로 읽는다.
 */

/**
 * 허용 목록이 비어 있으면 아무도 통과하지 못한다.
 * 값을 실수로 안 넣었을 때 전부 열리는 쪽보다 전부 막히는 쪽이 안전하다.
 *
 * `*` 하나만 두면 카카오 계정이 있는 누구나 통과한다. 두 사람의 카카오
 * 회원번호를 알아내는 동안만 쓰는 임시 상태다 - 회원번호는 앱마다 달라서
 * 다른 서비스에서 가져올 수 없고, 이 앱으로 한 번 로그인해봐야 알 수 있다.
 * 번호를 넣는 즉시 이 값을 걷어낸다.
 */
const ALLOWED = (process.env.ALLOWED_KAKAO_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const OPEN_TO_EVERYONE = ALLOWED.length === 1 && ALLOWED[0] === '*';

/**
 * 요청마다 다시 검사한다.
 *
 * signIn 콜백은 로그인하는 순간에만 돈다. 그것만 믿으면 목록에서 뺀 계정의
 * 이미 발급된 세션 쿠키가 만료될 때까지 계속 통과한다. 페이지와 서버 액션이
 * 이 함수를 불러서, 목록에서 빠지면 다음 요청부터 막힌다.
 */
export function isAllowed(kakaoId: string | undefined | null): boolean {
  if (!kakaoId) return false;
  return OPEN_TO_EVERYONE || ALLOWED.includes(kakaoId);
}

/** 세션이 있고 허용 목록에 있는 사용자. 없으면 null */
export async function currentUser(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.kakaoId;
  return isAllowed(id) ? (id as string) : null;
}

declare module 'next-auth' {
  interface Session {
    user: { kakaoId: string } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    kakaoId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Kakao],

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async signIn({ account, profile }) {
      const kakaoId = String(profile?.id ?? account?.providerAccountId ?? '');
      if (!kakaoId) return false;
      const nickname =
        (profile as { properties?: { nickname?: string } } | undefined)?.properties?.nickname ?? '';

      // 통과든 거절이든 회원번호를 남긴다. 이 값을 ALLOWED_KAKAO_IDS에 넣어 문을 닫는다
      if (!isAllowed(kakaoId)) {
        console.warn(`[auth] 거절 · 카카오 ID ${kakaoId} · ${nickname}`);
        return false;
      }
      console.log(
        `[auth] 로그인 · 카카오 ID ${kakaoId} · ${nickname}` +
          (OPEN_TO_EVERYONE ? ' · 지금은 전체 개방 상태다' : ''),
      );
      return true;
    },

    async jwt({ token, account, profile }) {
      // 최초 로그인 시점에만 account가 들어온다
      if (account && profile) {
        token.kakaoId = String(profile.id ?? account.providerAccountId);
        const props = (profile as { properties?: { nickname?: string } }).properties;
        token.name = props?.nickname ?? '이름없음';
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        kakaoId: (token.kakaoId as string) ?? '',
        name: token.name,
      };
      return session;
    },
  },
});
