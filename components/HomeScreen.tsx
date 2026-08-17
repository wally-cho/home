'use client';

import { useState } from 'react';
import { man, won } from '@/lib/money';
import { EntrySheet, type EntryDraft } from './EntrySheet';
import { TopBar, Nav, ToastHost } from './Shell';
import type { CategoryRow, EntryRow } from '@/lib/types';
import type { Upcoming } from '@/lib/plan';

export interface HomeData {
  ym: string;
  todayYmd: string;
  isThisMonth: boolean;
  budget: number;
  spent: number;
  entries: EntryRow[];
  upcoming: Upcoming[];
  categories: CategoryRow[];
  methods: { id: number; name: string }[];
  /** 계획의 유동 예산 그룹이 쓰는 수단. 새 기록의 기본값이다 */
  defaultMethodId: number | null;
  order: number[];
  usage: Record<number, number>;
  chart: React.ReactNode;
}

export function HomeScreen(props: HomeData) {
  return (
    <ToastHost>
      <Home {...props} />
    </ToastHost>
  );
}

function Home({
  ym,
  todayYmd,
  isThisMonth,
  budget,
  spent,
  entries,
  upcoming,
  categories,
  methods,
  defaultMethodId,
  order,
  usage,
  chart,
}: HomeData) {
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const left = budget - spent;
  const pct = budget ? Math.round((spent / budget) * 100) : 0;
  const over = left < 0;

  // 날짜별로 묶고 헤더에 그날 합계를 붙인다. 최근 세 날짜만
  const days = [...new Set(entries.map((e) => e.occurred_on))].slice(0, 3);

  const openNew = () =>
    setDraft({
      id: null,
      amount: '',
      categoryId: order[0] ?? categories[0]?.id ?? 0,
      methodId: defaultMethodId,
      occurredOn: isThisMonth ? todayYmd : `${ym}-01`,
      memo: '',
    });

  return (
    <div className="app">
      <main>
        <TopBar ym={ym} />
        <section className="stack">
          {/* 결론 한 덩어리.
              칩 세 개로 나눠봤더니 탭할 것처럼 생겼는데 아무 일도 안 일어나고,
              하나의 사실(예산 대비)이 셋으로 쪼개져 읽는 데 더 걸렸다.
              쓴 값과 예산을 분수로 한 줄에 두고, 상태는 그 아래 한 줄로 둔다. */}
          <div className="panel">
            <div className="lbl">이번 달 생활비</div>
            <div className="headline">
              <span className={'big n' + (over ? ' neg' : '')}>{man(spent)}</span>
              <span className="unit">만</span>
              <span className="denom n">/ {man(budget)}만</span>
            </div>
            <div className={'state n' + (over ? ' neg' : '')}>
              {over ? `${man(-left)}만 초과` : `남은 ${man(left)}만`}
              <span className="dim"> · {pct}%</span>
            </div>

            <div className="chart">{chart}</div>
          </div>

          <div>
            <h2 className="h">
              <span>최근 생활비</span>
              <span>
                {entries.length}건 · {man(spent)}만
              </span>
            </h2>
            <div>
              {days.length === 0 && <div className="empty">첫 기록을 남겨보세요</div>}
              {days.map((d) => {
                const list = entries.filter((e) => e.occurred_on === d);
                const sum = list.reduce((a, e) => a + Number(e.amount), 0);
                return (
                  <div key={d}>
                    <div className="day">
                      <span>{dayLabel(d)}</span>
                      <span className="n">−{won(sum)}</span>
                    </div>
                    {list.map((e) => (
                      <button
                        key={e.id}
                        className="row"
                        onClick={() =>
                          setDraft({
                            id: e.id,
                            amount: String(e.amount),
                            categoryId: e.category_id,
                            methodId: e.method_id,
                            occurredOn: e.occurred_on,
                            memo: e.memo ?? '',
                            origAmount: Number(e.amount),
                          })
                        }
                      >
                        <span className="cat">{e.category_name}</span>
                        <span className="memo">{e.memo ?? ''}</span>
                        <span className="mth">{e.method_name ?? ''}</span>
                        <span className="a n">−{won(Number(e.amount))}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="h">
              <span>결제 예정</span>
              <span>오늘부터 7일</span>
            </h2>
            <div>
              {upcoming.length === 0 && <div className="empty">예정된 결제가 없습니다</div>}
              {upcoming.map((u, i) => (
                <div key={i} className={'up' + (u.past ? ' done' : '')}>
                  <span className="d n">
                    {Number(ym.slice(5, 7))}/{u.day}
                  </span>
                  <span className="nm">
                    {u.name}
                    {u.method && <span className="mt">{u.method}</span>}
                  </span>
                  <span className="a n">{man(u.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Nav onQuick={openNew} />
      <EntrySheet
        draft={draft}
        setDraft={setDraft}
        categories={categories}
        methods={methods}
        order={order}
        usage={usage}
        budgetLeft={left}
      />
    </div>
  );
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`;
}
