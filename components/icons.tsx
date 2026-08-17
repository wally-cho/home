/**
 * 하단 네비 아이콘. 영역 표(`lib/areas.ts`)가 키로 고른다.
 *
 * 전부 24x24 뷰박스에 선만으로 그린다. 채우기를 쓰면 활성 탭의 굵기 변화가
 * 안 보인다 - 활성 표시는 색과 선 굵기가 맡는다.
 */
export const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" />,
  calendar: <path d="M4 6h16v14H4zM4 10h16M9 4v4M15 4v4" />,
  sheet: <path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" />,
  card: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
};
