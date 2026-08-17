/**
 * 이 사이트는 영역을 여러 개 담는다. 가계부는 그중 하나다.
 *
 * 영역을 하나 붙이려면 아래 표에 한 줄을 더하고 `app/<slug>/` 아래에 그 탭들의
 * 페이지를 만든다. 상단 스위치와 하단 네비는 이 표만 읽으므로 따로 고칠 곳이 없다.
 *
 * 단은 둘까지다. 영역 -> 화면이 끝이고 그 아래는 시트로 연다. 하루 2.4건을
 * 넣는 앱이라 한 단을 더 파면 입력이 그만큼 느려진다.
 *
 * 하단 네비를 영역 목록으로 쓰지 않는다. 네 칸뿐이라 영역이 다섯 개가 되는
 * 순간 '더보기' 뒤로 밀리고, 거기 들어간 영역은 안 쓰게 된다. 영역은 상단
 * 스위치가 맡고 하단 네 칸은 지금 영역의 화면이 통째로 쓴다.
 */

export type AreaTab = {
  /** 경로의 둘째 칸. 빈 문자열이면 영역의 첫 화면이다 */
  seg: string;
  label: string;
  /** components/icons.tsx 의 키 */
  icon: string;
};

export type Area = {
  /** 경로의 첫 칸 */
  slug: string;
  /** 스위치 시트에 뜨는 이름 */
  name: string;
  /**
   * 시간 축. 'month'면 상단에 월 선택이 붙고 그 영역의 화면들이 한 달을 공유한다.
   * 영역마다 자기 축을 갖는다 - 축이 없는 영역에 월 선택이 떠 있으면 그것이
   * 무엇을 바꾸는 건지 알 수 없다.
   */
  axis: 'month' | 'none';
  /** 하단 네비. 둘에서 넷까지 */
  tabs: AreaTab[];
  /** 가운데 [+]가 여는 것의 이름. null이면 [+]를 두지 않는다 */
  quick: string | null;
};

export const WALLET: Area = {
  slug: 'wallet',
  name: '가계부',
  axis: 'month',
  // 달력을 왼쪽에 두는 것은 매일 쓰는 순서이기 때문이다 -
  // 계획은 한 달에 몇 번 열고, 달력은 기록할 때마다 연다
  tabs: [
    { seg: '', label: '홈', icon: 'home' },
    { seg: 'log', label: '달력', icon: 'calendar' },
    { seg: 'plan', label: '계획', icon: 'sheet' },
    { seg: 'loans', label: '대출', icon: 'card' },
  ],
  quick: '생활비 기록',
};

/** 순서가 곧 스위치 시트의 순서다 */
export const AREAS: Area[] = [WALLET];

/** 마지막으로 본 영역. `/`로 들어오면 여기로 보낸다 */
export const AREA_COOKIE = 'wa';

export const DEFAULT_AREA = AREAS[0];

export function areaBySlug(slug: string | undefined | null): Area | undefined {
  return AREAS.find((a) => a.slug === slug);
}

/** 경로가 속한 영역. 설정·로그인처럼 영역 밖이면 undefined */
export function areaOfPath(pathname: string): Area | undefined {
  return areaBySlug(pathname.split('/')[1]);
}

export function hrefOf(area: Area, tab: AreaTab): string {
  return tab.seg ? `/${area.slug}/${tab.seg}` : `/${area.slug}`;
}

/**
 * 서버가 다시 그려야 할 경로. 쓰기 액션이 끝나고 부른다.
 *
 * 영역을 늘려도 여기를 고칠 일이 없도록 표에서 만들어낸다 - 액션마다
 * 손으로 적어두면 새 화면을 붙였을 때 그 화면만 옛 데이터를 보여준다.
 */
export function pathsOf(area: Area): string[] {
  return area.tabs.map((t) => hrefOf(area, t));
}
