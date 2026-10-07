'use client';

import { useState } from 'react';
import { man, manToWon, won } from '@/lib/money';
import { saveFlatLoan } from '@/lib/actions';
import { TopBar, Nav, Sheet, ToastHost, useToast } from './Shell';
import type { LoanView } from '@/lib/loans';

/**
 * 대출은 접어 둔다. 필요한 건 이번 달·다음 달·남은 원금 세 숫자이고,
 * 회차 표는 확인할 때만 편다. 표가 길어서 펼친 채로 두면 두 번째 대출이 안 보인다.
 */
export function LoansScreen({ ym, loans }: { ym: string; loans: LoanView[] }) {
  return (
    <ToastHost>
      <Loans ym={ym} loans={loans} />
    </ToastHost>
  );
}

function Loans({ ym, loans }: { ym: string; loans: LoanView[] }) {
  const [open, setOpen] = useState<number[]>([]);
  const [editing, setEditing] = useState<LoanView | null>(null);
  const toast = useToast();
  // 펼친 표 안에 예정일과 영업일이 다른 달이 있을 때만 범례를 둔다
  const shifted = loans.some(
    (l) => open.includes(l.id) && l.rows.some((r) => r.business_date && r.business_date !== r.due_date),
  );
  const toggle = (id: number) =>
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="app">
      <main>
        <TopBar ym={ym} />
        <section className="stack">
          <div>
            {loans.map((l) => {
              const isOpen = open.includes(l.id);
              return (
                <div key={l.id} className={'card lcard' + (isOpen ? ' open' : '')}>
                  {l.flat ? (
                    // 상환표가 없는 대출은 원금과 이자를 손으로 고친다. 중도상환하면 바뀐다
                    <button className="lhead" onClick={() => setEditing(l)}>
                      <span className="lt">
                        <b>{l.name}</b>
                        <span>{l.note}</span>
                      </span>
                      <svg className="chev" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <button className="lhead" onClick={() => toggle(l.id)} aria-expanded={isOpen}>
                      <span className="lt">
                        <b>{l.name}</b>
                        <span className="n">
                          {l.count}회차 · {l.endYm} 종료
                        </span>
                      </span>
                      <svg className="chev" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}

                  <div className="lrow">
                    <div>
                      <div className="lbl">{l.flat ? '매월 이자' : '이번 달'}</div>
                      <div className="v n">{l.thisMonth === null ? '-' : won(l.thisMonth)}</div>
                    </div>
                    {!l.flat && (
                      <div>
                        <div className="lbl">다음 달</div>
                        <div className="v n">{l.nextMonth === null ? '-' : won(l.nextMonth)}</div>
                      </div>
                    )}
                  </div>
                  <div className="lrow">
                    <div>
                      <div className="lbl">남은 원금</div>
                      <div className="v n">{l.balance === null ? '-' : won(l.balance)}</div>
                    </div>
                  </div>

                  {!l.flat && (
                    <div className="lbody">
                      <div className="twrap">
                        <table>
                          <thead>
                            <tr>
                              <th>회차</th>
                              <th>예정일</th>
                              <th>영업일</th>
                              <th>원리금</th>
                              <th>원금</th>
                              <th>이자</th>
                              <th>잔액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {l.rows.map((r) => (
                              <tr key={r.seq} className={r.ym === ym ? 'now' : ''}>
                                <td className="n">{r.seq}</td>
                                <td className="n">{r.due_date.slice(2)}</td>
                                <td className="n">
                                  {r.business_date === r.due_date || !r.business_date ? (
                                    (r.business_date ?? '-').slice(2)
                                  ) : (
                                    <span className="shift">{r.business_date.slice(2)}</span>
                                  )}
                                </td>
                                <td className="n">{won(Number(r.total))}</td>
                                <td className="n">{won(Number(r.principal))}</td>
                                <td className="n">{won(Number(r.interest))}</td>
                                <td className="n">{won(Number(r.balance))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {shifted && (
            // 문단으로 설명하지 않는다. 색이 무엇을 뜻하는지만 한 줄로 둔다
            <div className="callegend">
              <span>
                <i className="shiftmark" /> 예정일이 주말이라 밀린 영업일
              </span>
            </div>
          )}
        </section>
      </main>

      <Nav onQuick={() => {}} />

      {editing && <FlatLoanSheet loan={editing} onClose={() => setEditing(null)} toast={toast} />}
    </div>
  );
}

/** 만기일시상환 대출. 상환표가 없으니 남은 원금과 매월 이자가 전부다 */
function FlatLoanSheet({
  loan,
  onClose,
  toast,
}: {
  loan: LoanView;
  onClose: () => void;
  toast: (msg: string) => void;
}) {
  const [balance, setBalance] = useState(loan.balance === null ? '' : man(loan.balance));
  const [monthly, setMonthly] = useState(loan.thisMonth === null ? '' : man(loan.thisMonth));
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open onClose={onClose}>
      <div className="sh">
        <b>{loan.name}</b>
      </div>
      <div className="two">
        <div className="f">
          <span className="lbl">남은 원금 (만원)</span>
          <input
            className="inp n"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </div>
        <div className="f">
          <span className="lbl">매월 이자 (만원)</span>
          <input
            className="inp n"
            inputMode="decimal"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
          />
        </div>
      </div>
      <div className="btns">
        <button className="btn sub" style={{ flex: '0 0 96px' }} onClick={onClose}>
          취소
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await saveFlatLoan({
                id: loan.id,
                balance: manToWon(balance),
                monthly: manToWon(monthly),
              });
              onClose();
              toast('저장했습니다');
            } catch (e) {
              toast((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          저장
        </button>
      </div>
    </Sheet>
  );
}
