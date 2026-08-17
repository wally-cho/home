import { man } from '@/lib/money';

/**
 * 일별 누적 지출 곡선.
 *
 * 진행바 하나로는 "이 페이스가 빠른가"를 알 수 없다. 곡선에 두 기준선을 얹으면
 * 그게 보인다 - 예산선(가로 점선)과 균등 소비 기준선(1일 0원에서 말일 예산까지
 * 잇는 대각 점선). 곡선이 대각선 위에 있으면 빠른 것이다.
 * 예산을 넘긴 구간만 빨강으로 그려서 언제부터 넘었는지가 남는다.
 *
 * 차트 라이브러리를 넣지 않는다. 서버에서 SVG를 그리면 클라이언트 JS가 0이고,
 * 모바일 웹의 첫 화면 속도가 이 서비스의 체감 품질 대부분이다.
 */
export function SpendChart({
  byDay,
  budget,
  daysInMonth,
  lastDay,
}: {
  byDay: Map<number, number>;
  budget: number;
  daysInMonth: number;
  /** 이번 달이면 오늘, 지난 달이면 말일 */
  lastDay: number;
}) {
  const W = 320;
  const H = 116;
  const PL = 6;
  const PR = 34;
  const PT = 12;
  const PB = 16;

  const pts: { d: number; v: number }[] = [];
  let run = 0;
  for (let d = 1; d <= lastDay; d++) {
    run += byDay.get(d) ?? 0;
    pts.push({ d, v: run });
  }

  const b = budget || 1;
  const yMax = Math.max(b, run) * 1.15;
  const X = (d: number) => PL + ((d - 1) / Math.max(daysInMonth - 1, 1)) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - v / yMax) * (H - PT - PB);
  const base = Y(0);
  const ticks = [...new Set([1, 10, 20, daysInMonth])].filter((d) => d <= daysInMonth);

  if (pts.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="이번 달 일별 누적 지출">
        <line className="grid-l" x1={PL} y1={base} x2={W - PR} y2={base} />
        <line className="budget-l" x1={PL} y1={Y(b)} x2={W - PR} y2={Y(b)} />
        <text x={W - PR + 4} y={Y(b) + 3}>
          예산 {man(budget)}
        </text>
        <text x={PL} y={base + 12}>
          기록이 모이면 곡선이 그려집니다
        </text>
      </svg>
    );
  }

  // 예산을 넘는 지점에서 곡선을 둘로 나눈다
  const crossIdx = pts.findIndex((p) => p.v > b);
  let under = pts;
  let over: { d: number; v: number }[] = [];
  if (crossIdx > 0) {
    const a = pts[crossIdx - 1];
    const c = pts[crossIdx];
    const t = (b - a.v) / (c.v - a.v);
    const mid = { d: a.d + (c.d - a.d) * t, v: b };
    under = pts.slice(0, crossIdx).concat([mid]);
    over = [mid].concat(pts.slice(crossIdx));
  } else if (crossIdx === 0) {
    under = [];
    over = pts;
  }

  const seg = (arr: { d: number; v: number }[]) => arr.map((p) => `${X(p.d)},${Y(p.v)}`).join(' ');
  const last = pts[pts.length - 1];
  const isOver = last.v > b;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`이번 달 일별 누적 지출 ${man(last.v)}만, 예산 ${man(budget)}만`}
    >
      <line className="grid-l" x1={PL} y1={base} x2={W - PR} y2={base} />
      <line className="pace-l" x1={X(1)} y1={base} x2={X(daysInMonth)} y2={Y(b)} />
      <line className="budget-l" x1={PL} y1={Y(b)} x2={W - PR} y2={Y(b)} />
      <text x={W - PR + 4} y={Y(b) + 3}>
        예산 {man(budget)}
      </text>

      {under.length > 1 && (
        <>
          <polygon
            className="fill-a"
            points={`${X(under[0].d)},${base} ${seg(under)} ${X(under[under.length - 1].d)},${base}`}
          />
          <polyline className="line" points={seg(under)} />
        </>
      )}
      {over.length > 1 && (
        <>
          <polygon
            className="fill-a over"
            points={`${X(over[0].d)},${base} ${seg(over)} ${X(over[over.length - 1].d)},${base}`}
          />
          <polyline className="line over" points={seg(over)} />
        </>
      )}

      {/* 값은 화면 위쪽 큰 숫자가 말한다. 여기서는 어디까지 왔는지만 찍는다 */}
      <circle className={'dot' + (isOver ? ' over' : '')} cx={X(last.d)} cy={Y(last.v)} r={3.6} />

      {ticks.map((d) => (
        <text key={d} x={X(d)} y={H - 3} textAnchor="middle">
          {d}
        </text>
      ))}
    </svg>
  );
}
