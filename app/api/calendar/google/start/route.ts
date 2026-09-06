import { NextResponse } from 'next/server';
import { currentUser } from '@/auth';
import { googleRedirectUri, siteUrl } from '@/lib/google';

/**
 * 구글 동의 화면으로 보낸다.
 *
 * Auth.js에 provider를 하나 더 얹지 않는다. 카카오는 **로그인**이고 구글은
 * **캘린더 읽기 권한**이라 하는 일이 다르다. 섞으면 "구글로도 로그인되나?"가 되고,
 * 허용 목록(카카오 회원번호)이 무너진다.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await currentUser())) return NextResponse.redirect(siteUrl('/login'));

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', googleRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly');
  // refresh token은 이 둘이 있어야 온다. 없으면 access token만 오고 하루 뒤에 끊긴다
  url.searchParams.set('access_type', 'offline');
  // 이미 동의한 계정을 다시 연결할 때도 refresh token을 다시 받으려면 필요하다.
  // 없으면 두 번째 연결에서 조용히 자격 없이 저장된다
  url.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(url);
}
