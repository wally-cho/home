import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'home',
  description: '월 계획과 생활비를 한 곳에서',
  // 급여·대출이 든 화면이다. 검색에 잡히는 건 확실한 유출이다
  robots: { index: false, follow: false },
};

// 모바일 웹 전용이다. 데스크톱 레이아웃은 만들지 않는다
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
