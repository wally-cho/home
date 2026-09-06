'use client';

import { useState } from 'react';
import { man, won } from '@/lib/money';
import { EntrySheet, type EntryDraft } from './EntrySheet';
import { TopBar, Nav, ToastHost, useMonthSwipe } from './Shell';
import type { CategoryRow, EntryRow } from '@/lib/types';

export interface CalendarData {
  ym: string;
  isThisMonth: boolean;
  todayDay: number;
  daysInMonth: number;
  firstDow: number;
  budget: number;
  spent: number;
  byDay: Record<number, number>;
  payDays: number[];
  entries: EntryRow[];
  /** 그 날 계획된 결제 - 날짜를 탭하면 기록과 함께 보여준다 */
  plansByDay: Record<number, { name: string; method: string | null; amount: number }[]>;
  categories: CategoryRow[];
  methods: { id: number; name: string }[];
  /** 계획의 유동 예산 그룹이 쓰는 수단. 새 기록의 기본값이다 */
  defaultMethodId: number | null;
  order: number[];
  usage: Record<number, number>;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function CalendarScreen(props: CalendarData) {
  return (
    <ToastHost>
      <Calendar {...props} />
    </ToastHost>
  );
}

function Calendar({
  ym,
  isThisMonth,
  todayDay,
  daysInMonth,
  firstDow,
  budget,
  spent,
  byDay,
  payDays,
  entries,
  plansByDay,
  categories,
  methods,
  defaultMethodId,
  order,
  usage,
}: CalendarData) {
  const swipe = useMonthSwipe(ym);
  const [sel, setSel] = useState(isThisMonth ? todayDay : 1);
  const [draft, setDraft] = useState<EntryDraft | null>(null);

  // 시트에서 날짜를 옮기면 뒤의 달력과 목록도 따라간다. 저장하고 닫았을 때
  // 방금 넣은 기록이 보이는 날에 있어야 들어간 것이 확인된다
  const edit = (d: EntryDraft | null) => {
    if (d) setSel(Number(d.occurredOn.slice(8, 10)));
    setDraft(d);
  };

  const left = budget - spent;
  const daysLeft = isThisMonth ? daysInMonth - todayDay + 1 : 0;
  const pad = Array.from({ length: firstDow }, (_, i) => i);
  const dayStr = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
  const selList = entries.filter((e) => e.occurred_on === dayStr(sel));
  const selPlans = plansByDay[sel] ?? [];
  const selSum = selList.reduce((a, e) => a + Number(e.amount), 0);

  return (
    <div className="app">
      <main>
        <TopBar ym={ym} />
        <section className="stack">
          {/* 좌우로 밀면 옆 달. 화살표 버튼을 두지 않는 규칙은 그대로다 */}
          <div className="cal" {...swipe}>
            <div className="dow">
              {DOW.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid">
              {pad.map((i) => (
                <div key={'p' + i} className="cell void" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const amt = byDay[d] ?? 0;
                const isToday = isThisMonth && d === todayDay;
                const cls = [
                  'cell',
                  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, d).getDay() === 0
                    ? 'sun'
                    : '',
                  isToday ? 'today' : '',
                  !isToday && d === sel ? 'on' : '',
                  isThisMonth && d > todayDay ? 'future' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button key={d} className={cls} onClick={() => setSel(d)}>
                    <span className="dd n">{d}</span>
                    {amt > 0 && <span className="vv n">{Math.round((amt / 10000) * 10) / 10}</span>}
                    {payDays.includes(d) && <span className="plan" />}
                  </button>
                );
              })}
            </div>

            <div className="calstat">
              <div>
                <div className="k">이번 달 지출</div>
                <div className="v n">{man(spent)}만</div>
                <div className="s n">예산 {man(budget)}만</div>
              </div>
              <div>
                <div className="k">남은 예산</div>
                <div className={'v n' + (left < 0 ? ' neg' : '')}>{man(left)}만</div>
                <div className="s n">{daysLeft > 0 ? `${daysLeft}일 남음` : '지난 달'}</div>
              </div>
            </div>
            {/* 문장으로 설명하지 않고 그 모양을 그대로 보여준다 */}
            <div className="callegend">
              <span>
                <i className="sample n">4.2</i> 지출(만원)
              </span>
              <span>
                <i className="dotmark" /> 결제 예정
              </span>
              {isThisMonth && (
                <span>
                  <i className="todaymark" /> 오늘
                </span>
              )}
            </div>
          </div>

          <div>
            <h2 className="h">
              <span>
                {Number(ym.slice(5, 7))}월 {sel}일 (
                {DOW[new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, sel).getDay()]})
              </span>
              <span>{selList.length ? `${selList.length}건 · ${won(selSum)}원` : ''}</span>
            </h2>
            <div>
              {selPlans.map((p, i) => (
                <div key={'pl' + i} className="up">
                  <span className="d n">계획</span>
                  <span className="nm">
                    {p.name}
                    {p.method && <span className="mt">{p.method}</span>}
                  </span>
                  <span className="a n">{man(p.amount)}만</span>
                </div>
              ))}
              {selList.map((e) => (
                <button
                  key={e.id}
                  className="row"
                  onClick={() =>
                    edit({
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
              {selList.length === 0 && selPlans.length === 0 && (
                <div className="empty">기록이 없습니다</div>
              )}
            </div>
          </div>
        </section>
      </main>

      <Nav
        onQuick={() =>
          edit({
            id: null,
            amount: '',
            categoryId: order[0] ?? categories[0]?.id ?? 0,
            methodId: defaultMethodId,
            occurredOn: dayStr(sel),
            memo: '',
          })
        }
      />
      <EntrySheet
        draft={draft}
        setDraft={edit}
        categories={categories}
        methods={methods}
        order={order}
        usage={usage}
        budgetLeft={left}
      />
    </div>
  );
}
