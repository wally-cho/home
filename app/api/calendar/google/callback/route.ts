import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { currentUser } from '@/auth';
import { execute, queryOne, BOOK_ID } from '@/lib/db';
import { googleRedirectUri, siteUrl } from '@/lib/google';
import { CAL_COLORS } from '@/lib/calendar';

/**
 * 구글이 돌려보내는 자리. 코드를 refresh token으로 바꿔 저장한다.
 *
 * 소스의 신원은 **`(provider, account)`** 다 - 어느 서비스의 어느 계정인가.
 * `owner`는 화면에 뜨는 이름일 뿐이고 설정에서 바꿀 수 있다. 이름으로 찾으면
 * 이름을 고친 뒤 재연결할 때 옛 줄을 못 찾고 두 줄이 생긴다.
 *
 * 처음 연결할 때의 이름은 카카오 닉네임에서 가져온다. 사용자 테이블을 만들지
 * 않기로 했으므로 그것이 유일한 단서다.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await currentUser())) return NextResponse.redirect(siteUrl('/login'));

  const back = new URL(siteUrl('/schedule/settings'));
  const code = new URL(request.url).searchParams.get('code');
  const denied = new URL(request.url).searchParams.get('error');

  if (denied || !code) {
    back.searchParams.set('cal', 'denied');
    return NextResponse.redirect(back);
  }

  const session = await auth();
  const owner = (session?.user?.name ?? '나').slice(0, 12);

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: googleRedirectUri(),
      }),
    });
    const json = (await res.json()) as {
      refresh_token?: string;
      access_token?: string;
      error_description?: string;
    };
    if (!res.ok || !json.refresh_token) {
      // access token만 오고 refresh token이 없으면 하루 뒤에 끊긴다.
      // prompt=consent 를 빼면 재연결에서 이 상태가 된다
      throw new Error(json.error_description ?? 'refresh token을 받지 못했습니다');
    }

    // 어느 계정에 붙었는지 보여주려고 한 번만 묻는다
    let account: string | null = null;
    if (json.access_token) {
      const me = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
        headers: { authorization: `Bearer ${json.access_token}` },
      });
      if (me.ok) account = ((await me.json()) as { id?: string }).id?.slice(0, 190) ?? null;
    }

    // 계정으로 찾는다. 계정을 못 읽었으면 이름으로 떨어진다 - 그때는 새로 만들기보다
    // 옛 줄을 살리는 쪽이 낫다
    const existing = account
      ? await queryOne<{ id: number }>(
          `SELECT id FROM calendar_source
            WHERE book_id = ? AND provider = 'google' AND account = ?`,
          [BOOK_ID, account],
        )
      : await queryOne<{ id: number }>(
          `SELECT id FROM calendar_source
            WHERE book_id = ? AND provider = 'google' AND owner = ?`,
          [BOOK_ID, owner],
        );

    if (existing) {
      // 이름은 덮어쓰지 않는다. 설정에서 고쳐둔 것이 재연결로 되돌아가면 안 된다
      await execute(
        `UPDATE calendar_source
            SET credential = ?, account = ?, archived_at = NULL, sync_error = NULL, synced_at = NULL
          WHERE id = ?`,
        [json.refresh_token, account, existing.id],
      );
    } else {
      const n = await queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM calendar_source WHERE book_id = ?`,
        [BOOK_ID],
      );
      const i = Number(n?.c ?? 0);
      await execute(
        `INSERT INTO calendar_source (book_id, owner, provider, account, credential, color, sort_order)
         VALUES (?, ?, 'google', ?, ?, ?, ?)`,
        [BOOK_ID, owner, account, json.refresh_token, CAL_COLORS[i % CAL_COLORS.length], i * 10],
      );
    }

    back.searchParams.set('cal', 'ok');
  } catch (err) {
    console.warn('[calendar] 구글 연결 실패', err);
    back.searchParams.set('cal', 'fail');
  }

  return NextResponse.redirect(back);
}
