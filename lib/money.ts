/**
 * 금액은 전부 원 단위 정수로 저장한다. 표시만 갈린다.
 *   계획   만원 (소수 둘째 자리까지) - 71.42
 *   기록   원                        - 8,500
 *   상환표 원                        - 366,891
 *
 * 만원 입력은 100원 단위까지만 표현된다(2.01만원 = 20,100원). 엑셀도 그 정밀도였다.
 */

/** 원 → 만원 표시. 뒤의 0은 떼고 최대 두 자리 */
export function man(won: number): string {
  const v = won / 10000;
  const s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** 만원 표시 → 원. 소수 둘째 자리에서 반올림한다 */
export function manToWon(input: string | number): number {
  const v = typeof input === 'number' ? input : parseFloat(String(input).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10000);
}

/** 원 단위 콤마 표기 */
export function won(v: number): string {
  return v.toLocaleString('ko-KR');
}

/** 부호를 붙인 만원 표기. 음수는 −(U+2212)를 쓴다 */
export function signedMan(v: number): string {
  return (v >= 0 ? '' : '−') + man(Math.abs(v));
}
