import type { MetadataRoute } from 'next';

// 급여·대출·가족 용돈이 든 화면이다. 검색에 잡히는 건 확실한 유출이다.
//
// `/privacy`만 연다. 구글 OAuth 동의 화면을 게시하려면 개인정보처리방침이 공개로
// 열려 있어야 한다. 그 페이지에는 데이터가 없고 무엇을 저장하는지만 적혀 있다.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/privacy', disallow: '/' }] };
}
