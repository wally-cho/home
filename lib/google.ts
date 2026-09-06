/**
 * 바깥에서 보이는 주소로 URL을 만든다.
 *
 * **`request.url`을 쓰지 않는다.** CloudFront가 EC2:3001로 넘길 때 컨테이너가 보는
 * 요청은 `http://`다. 그걸로 리디렉션 주소를 만들면 구글에 `http://home.devckm.kr/...`
 * 이 가고, 구글은 localhost가 아닌 http를 정책 위반으로 막는다(`400 invalid_request`).
 * 로컬 dev는 원래 http라 여기서는 절대 재현되지 않는다 - 오리진 검증과 같은 종류의 함정이다.
 *
 * `AUTH_URL`이 유일하게 바깥 주소를 안다. 구글 콘솔에 등록한 리디렉션 URI와
 * 글자 하나까지 같아야 한다.
 */
export function siteUrl(path: string): string {
  const base = process.env.AUTH_URL;
  if (!base) throw new Error('AUTH_URL이 없습니다');
  return new URL(path, base).href;
}

export const googleRedirectUri = () => siteUrl('/api/calendar/google/callback');
