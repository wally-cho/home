import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AREA_COOKIE, areaBySlug } from './lib/areas';

/**
 * 두 겹으로 막는다.
 *
 *  1. 오리진 검증 - tium의 nginx를 거치지 않으므로 nginx가 하던 일을 여기서 한다.
 *     CloudFront를 우회해 EC2 포트로 직접 들어오는 요청(스캐너 등)을 막는다.
 *     ORIGIN_VERIFY_SECRET 이 없으면(로컬 개발) 검사하지 않는다.
 *
 *  2. 로그인 - 허용한 카카오 계정만 통과시킨다(auth.ts).
 *     세션 쿠키가 있는지만 본다. 서명 검증은 각 페이지의 auth() 호출이 한다 -
 *     미들웨어에서 Auth.js를 부르면 엣지 런타임 제약에 걸린다.
 */

// `/privacy`는 구글이 로그인 없이 읽어야 한다. OAuth 동의 화면을 게시하려면
// 개인정보처리방침 주소가 공개로 열려 있어야 하고, 막아두면 게시가 반려된다.
const PUBLIC_PATHS = ['/login', '/privacy', '/api/auth', '/api/health'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const expected = process.env.ORIGIN_VERIFY_SECRET;
  if (expected && pathname !== '/api/health') {
    if (request.headers.get('x-origin-verify') !== expected) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Auth.js v5 쿠키 이름. https에서는 __Secure- 접두어가 붙는다
  const hasSession =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token');

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const next = NextResponse.next();

  // 영역 안의 화면을 보면 그 영역을 기억한다. `/`로 다시 들어오면 여기로 온다.
  // 페이지에서 하지 않는 것은 서버 컴포넌트가 렌더 중에 쿠키를 못 쓰기 때문이다
  const area = areaBySlug(pathname.split('/')[1]);
  if (area && request.cookies.get(AREA_COOKIE)?.value !== area.slug) {
    next.cookies.set(AREA_COOKIE, area.slug, {
      path: '/',
      maxAge: 365 * 86400,
      sameSite: 'lax',
    });
  }

  return next;
}

export const config = {
  // 정적 자산은 검사하지 않는다. 두 가지 이유가 있다.
  //   1. CloudFront가 캐시해서 오리진까지 잘 오지 않는다
  //   2. 이미지 최적화기가 public/ 파일을 자기 자신에게 다시 요청하는데,
  //      그 내부 요청에는 x-origin-verify 헤더가 없다. 막으면 이미지가 깨진다
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|txt|xml|webmanifest)$).*)',
  ],
};
