'use client';

import { useState } from 'react';
import { TopBar, Nav, ToastHost } from './Shell';
import type { EventRow, SourceRow } from '@/lib/calendar';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export interface ScheduleListData {
  ym: string;
  todayYmd: string;
  sources: SourceRow[];
  events: EventRow[];
}

export function ScheduleListScreen(props: ScheduleListData) {
  return (
    <ToastHost>
      <List {...props} />
    </ToastHost>
  );
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '종일');

function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

/**
 * 그 달 일정을 날짜순으로 쭉 편다.
 *
 * 격자는 "언제 뭐가 있나"를 훑는 화면이고 이쪽은 "다음에 뭐가 있나"를 읽는 화면이다.
 * 같은 데이터를 두 번 보여주는 것이 아니라 묻는 것이 다르다.
 */
function List({ ym, todayYmd, sources, events }: ScheduleListData) {
  const connected = sources.filter((s) => s.connected === 1);
  /** null이면 전체. 달력 화면과 같은 규칙이다 */
  const [only, setOnly] = useState<number | null>(null);
  const shown = only === null ? events : events.filter((e) => e.source_id === only);
  const showOwner = only === null && connected.length > 1;

  // 시작일 기준으로 묶는다. 여러 날짜에 걸친 일정은 시작한 날에 한 번만 나온다 -
  // 목록에서 같은 여행이 닷새 내내 반복되면 읽히지 않는다
  const days = [...new Set(shown.map((e) => e.starts_on))].sort();

  return (
    <div className="app">
      <main>
        <TopBar ym={ym} />
        <section className="stack">
          {connected.length > 1 && (
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
            </div>
          )}
          {connected.length === 0 ? (
            <div className="empty">
              <p>연결한 캘린더가 없습니다.</p>
            </div>
          ) : days.length === 0 ? (
            <div className="none">이 달에 일정이 없습니다</div>
          ) : (
            days.map((d) => (
              <div key={d}>
                <h2 className="h">
                  <span>{dayLabel(d)}</span>
                  <span>{d === todayYmd ? '오늘' : ''}</span>
                </h2>
                <ul className="evlist">
                  {shown
                    .filter((e) => e.starts_on === d)
                    .map((e) => (
                      <li key={e.id}>
                        <i className="bar" style={{ background: e.color }} />
                        <span className="tm n">{hhmm(e.starts_at)}</span>
                        {showOwner && <span className="who">{e.owner}</span>}
                        <span className="ti">{e.title}</span>
                        {e.ends_on !== e.starts_on && <span className="lo">~ {e.ends_on.slice(5)}</span>}
                        {e.location && <span className="lo">{e.location}</span>}
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </main>
      <Nav onQuick={() => {}} />
    </div>
  );
}
