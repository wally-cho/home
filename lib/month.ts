/**
 * 월은 'YYYY-MM' 문자열로 다룬다. 문자열 비교가 곧 월 비교이고
 * ('2026-08' <= '2026-09') 타임존이 끼어들 여지가 없다.
 */

const KST = 'Asia/Seoul';

/** 오늘 (KST). 컨테이너 TZ가 Asia/Seoul이지만 로컬 개발도 있으니 명시한다 */
export function today(): { y: number; m: number; d: number; ymd: string; ym: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  return { y, m, d, ymd: parts, ym: parts.slice(0, 7) };
}

export function ymOf(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function parseYm(ym: string): { y: number; m: number } {
  const [y, m] = ym.split('-').map(Number);
  return { y, m };
}

/** 'YYYY-MM' 이 올바른 형식인가. 쿼리 파라미터를 그대로 믿지 않는다 */
export function isYm(v: string | undefined | null): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function daysInMonth(ym: string): number {
  const { y, m } = parseYm(ym);
  return new Date(y, m, 0).getDate();
}

/** 그 달 1일의 요일 (0 = 일요일) */
export function firstDow(ym: string): number {
  const { y, m } = parseYm(ym);
  return new Date(y, m - 1, 1).getDay();
}

/** 월 경계 [시작일, 종료일] - DATE 컬럼 BETWEEN에 그대로 쓴다 */
export function monthRange(ym: string): [string, string] {
  return [`${ym}-01`, `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`];
}

export function shiftYm(ym: string, delta: number): string {
  const { y, m } = parseYm(ym);
  const t = y * 12 + (m - 1) + delta;
  return ymOf(Math.floor(t / 12), (t % 12) + 1);
}

/** 두 달 사이의 개월 수 (같은 달이면 1) */
export function monthsBetween(fromYm: string, toYm: string): number {
  const a = parseYm(fromYm);
  const b = parseYm(toYm);
  return b.y * 12 + b.m - (a.y * 12 + a.m) + 1;
}

/** 결제일. 32는 말일을 뜻한다 */
export function payDayOf(ym: string, payDay: number): number {
  return payDay === 32 ? daysInMonth(ym) : Math.min(payDay, daysInMonth(ym));
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function dowOf(ym: string, day: number): string {
  const { y, m } = parseYm(ym);
  return DOW[new Date(y, m - 1, day).getDay()];
}

export function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

/**
 * 월은 화면 전체가 하나를 공유한다.
 *
 * 화면마다 따로 기억하게 해봤더니 홈은 8월, 계획은 6월처럼 갈려서 어느 달을
 * 보고 있는지 헷갈렸다. 하나만 두면 달을 바꾸고 네비로 옮겨다니며 같은 달의
 * 계획과 기록을 나란히 볼 수 있다.
 *
 * URL의 ?m= 이 우선이고, 없으면 쿠키, 그것도 없으면 이번 달이다.
 */
export const MONTH_COOKIE = 'wm';

export function pickYm(param: string | undefined, cookie: string | undefined) {
  if (isYm(param)) return param;
  if (isYm(cookie)) return cookie;
  return today().ym;
}
