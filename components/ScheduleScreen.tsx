'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar, Nav, ToastHost } from './Shell';
import type { EventRow, SourceRow } from '@/lib/calendar';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export interface ScheduleData {
  ym: string;
  todayDay: number;
  isThisMonth: boolean;
  daysInMonth: number;
  firstDow: number;
  sources: SourceRow[];
  /** 날짜 → 그날 걸치는 일정. 서버에서 흩어 놓는다 */
  byDay: Record<number, EventRow[]>;
}

export function ScheduleScreen(props: ScheduleData) {
  return (
    <ToastHost>
      <Schedule {...props} />
    </ToastHost>
  );
}

/** 09:30:00 → 09:30. 초는 화면에 필요 없다 */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** 마지막으로 가져온 때. 몇 분 전인지가 궁금한 값이라 절대시각으로 두지 않는다 */
function ago(iso: string | null): string {
  if (!iso) return '아직 안 가져옴';
  const m = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function Schedule({
  ym,
  todayDay,
  isThisMonth,
  daysInMonth,
  firstDow,
  sources,
  byDay,
}: ScheduleData) {
  const router = useRouter();
  const [sel, setSel] = useState(isThisMonth ? todayDay : 1);
  const [busy, setBusy] = useState(false);
  /** null이면 전체. 둘을 합쳐 보는 것이 기본이다 - 같이 보려고 만든 화면이다 */
  const [only, setOnly] = useState<number | null>(null);

  const pad = Array.from({ length: firstDow }, (_, i) => i);
  const connected = sources.filter((s) => s.connected === 1);
  const failed = connected.filter((s) => s.sync_error);

  const keep = (list: EventRow[]) =>
    only === null ? list : list.filter((e) => e.source_id === only);
  const selList = keep(byDay[sel] ?? []);
  // 합쳐 볼 때만 이름을 붙인다. 한 사람만 보고 있으면 매 줄에 같은 이름이 반복될 뿐이다
  const showOwner = only === null && connected.length > 1;

  const refresh = async () => {
    setBusy(true);
    // 서버가 가져오고 다시 그린다. 낙관적 업데이트를 쓰지 않는다 -
    // 원본이 진실이라 미리 그릴 것이 없다
    await fetch('/api/calendar/sync', { method: 'POST' });
    router.refresh();
    setBusy(false);
  };

  return (
    <div className="app">
      <main>
        <TopBar ym={ym} />

        <section className="stack">
          <div className="cal">
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
                const list = keep(byDay[d] ?? []);
                const isToday = isThisMonth && d === todayDay;
                const cls = [
                  'cell',
                  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, d).getDay() === 0
                    ? 'sun'
                    : '',
                  isToday ? 'today' : '',
                  !isToday && d === sel ? 'on' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button key={d} className={cls} onClick={() => setSel(d)}>
                    <span className="dd n">{d}</span>
                    {/* 점 세 개까지만 찍는다. 그 이상은 세는 것이 아니라 '많다'는 뜻이다 */}
                    <span className="evdots">
                      {list.slice(0, 3).map((e) => (
                        <i key={e.id} style={{ background: e.color }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 범례가 곧 필터다. 색이 무엇을 뜻하는지 보여주면서 누르면 그 사람만 남는다.
                둘 이상일 때만 나온다 - 하나뿐이면 눌러도 아무 일이 없는 버튼이 된다 */}
            {connected.length > 1 ? (
              <div className="callegend pick">
                <button aria-pressed={only === null} onClick={() => setOnly(null)}>
                  전체
                </button>
                {connected.map((s) => (
                  <button
                    key={s.id}
                    aria-pressed={only === s.id}
                    onClick={() => setOnly(only === s.id ? null : s.id)}
                  >
                    <i className="evmark" style={{ background: s.color }} /> {s.owner}
                  </button>
                ))}
                {isThisMonth && (
                  <span>
                    <i className="todaymark" /> 오늘
                  </span>
                )}
              </div>
            ) : (
              <div className="callegend">
                {connected.map((s) => (
                  <span key={s.id}>
                    <i className="evmark" style={{ background: s.color }} /> {s.owner}
                  </span>
                ))}
                {isThisMonth && (
                  <span>
                    <i className="todaymark" /> 오늘
                  </span>
                )}
              </div>
            )}
          </div>

          {connected.length === 0 ? (
            <div className="empty">
              <p>연결한 캘린더가 없습니다.</p>
              <button className="linkbtn" onClick={() => router.push('/settings')}>
                설정에서 연결하기
              </button>
            </div>
          ) : (
            <>
              {failed.length > 0 && (
                <div className="warnbox">
                  {failed.map((s) => (
                    <div key={s.id}>
                      {s.owner} · {s.sync_error}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h2 className="h">
                  <span>
                    {Number(ym.slice(5, 7))}월 {sel}일 (
                    {
                      DOW[
                        new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, sel).getDay()
                      ]
                    }
                    )
                  </span>
                  <span>{selList.length ? `${selList.length}건` : ''}</span>
                </h2>

                {selList.length === 0 ? (
                  <div className="none">일정 없음</div>
                ) : (
                  <ul className="evlist">
                    {selList.map((e) => (
                      <li key={e.id}>
                        <i className="bar" style={{ background: e.color }} />
                        <span className="tm n">{hhmm(e.starts_at) ?? '종일'}</span>
                        {showOwner && <span className="who">{e.owner}</span>}
                        <span className="ti">{e.title}</span>
                        {e.location && <span className="lo">{e.location}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="syncbar">
                <span>
                  {connected.map((s) => `${s.owner} ${ago(s.synced_at)}`).join(' · ')}
                </span>
                <button className="txtbtn" onClick={refresh} disabled={busy}>
                  {busy ? '가져오는 중' : '새로고침'}
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      <Nav onQuick={() => {}} />
    </div>
  );
}
