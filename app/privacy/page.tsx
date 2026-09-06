import type { Metadata } from 'next';

/**
 * 공개로 열리는 유일한 내용 페이지다.
 *
 * 구글 OAuth 동의 화면을 게시하려면 개인정보처리방침 주소가 있어야 하고, 구글이
 * 로그인 없이 읽을 수 있어야 한다. 그래서 `proxy.ts`의 공개 경로에 넣어뒀다.
 *
 * 여기에는 데이터가 없다. 무엇을 저장하고 무엇을 안 하는지만 적는다.
 */
export const metadata: Metadata = {
  title: '개인정보처리방침 - home',
  // 이 페이지만 색인을 허용한다. 나머지는 robots.ts가 전부 막는다
  robots: { index: true, follow: false },
};

export default function PrivacyPage() {
  return (
    <main className="doc">
      <h1>개인정보처리방침</h1>
      <p className="upd">최종 수정일 2026년 9월 6일</p>

      <p>
        home(<code>home.devckm.kr</code>)은 부부 두 사람이 가계와 일정을 함께 보려고 만든 개인
        사이트입니다. 서비스로 공개되어 있지 않고, 허용 목록에 있는 계정만 들어올 수 있습니다.
      </p>

      <h2>수집하고 저장하는 것</h2>
      <ul>
        <li>
          <b>카카오 로그인</b> - 회원번호와 닉네임. 누가 들어왔는지 확인하는 용도이고 그 밖에
          쓰지 않습니다.
        </li>
        <li>
          <b>직접 입력한 가계 정보</b> - 월 계획 항목, 생활비 기록, 대출 상환표.
        </li>
        <li>
          <b>연결한 캘린더의 일정</b> - 제목, 날짜, 시각, 장소. 한 화면에서 같이 보기 위한
          것입니다. <b>읽기만 하고 고치거나 만들지 않습니다.</b> 연결을 끊으면 가져온 일정을
          지웁니다.
        </li>
      </ul>

      <h2>구글 계정으로 가져오는 것</h2>
      <p>
        구글 캘린더를 연결하면 <code>calendar.readonly</code> 권한만 요청합니다. 일정을 읽을 수만
        있고 쓰거나 지울 수 없는 권한입니다. 받은 토큰은 이 사이트의 데이터베이스에만 두고 다른
        곳으로 보내지 않습니다.
      </p>
      <p>
        연결을 끊으려면 이 사이트의 설정에서 해제하거나,{' '}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          구글 계정의 서드파티 액세스
        </a>
        에서 직접 해제하면 됩니다.
      </p>

      <h2>하지 않는 것</h2>
      <ul>
        <li>제3자에게 제공하거나 판매하지 않습니다.</li>
        <li>광고·분석 목적으로 쓰지 않습니다. 추적 도구를 넣지 않았습니다.</li>
        <li>검색엔진에 노출시키지 않습니다. 이 페이지만 예외입니다.</li>
      </ul>

      <h2>보관과 삭제</h2>
      <p>
        데이터는 서비스를 쓰는 동안 보관합니다. 지우고 싶으면 아래로 연락하거나 사이트에서 직접
        지우면 됩니다. 사이트를 닫을 때는 데이터베이스째 삭제합니다.
      </p>

      <h2>문의</h2>
      <p>
        <a href="mailto:wras456@gmail.com">wras456@gmail.com</a>
      </p>
    </main>
  );
}
