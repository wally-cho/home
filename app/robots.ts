import type { MetadataRoute } from 'next';

// 급여·대출·가족 용돈이 든 화면이다. 검색에 잡히는 건 확실한 유출이다.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
