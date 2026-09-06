'use client';

import { Nav, SettingsBar, ToastHost, useToast } from './Shell';
import { disconnectCalendar } from '@/lib/actions';
import type { SourceRow } from '@/lib/calendar';

export interface ScheduleSettingsData {
  sources: SourceRow[];
}

export function ScheduleSettingsScreen(props: ScheduleSettingsData) {
  return (
    <ToastHost>
      <ScheduleSettings {...props} />
    </ToastHost>
  );
}

/**
 * 일정 영역의 설정. 가계부 설정과 한 화면에 섞지 않는다 -
 * 영역이 늘수록 설정이 잡동사니 서랍이 되고, 무엇이 어느 영역 것인지 알 수 없게 된다.
 *
 * 설정에는 바꿀 수 있는 것만 둔다. 마지막 동기화 시각은 읽기만 하는 값이라
 * 여기가 아니라 일정 화면 아래에 있다.
 */
function ScheduleSettings({ sources }: ScheduleSettingsData) {
  const toast = useToast();
  const connected = sources.filter((s) => s.connected === 1);

  return (
    <div className="app">
      <main>
        <SettingsBar title="일정 설정" />

        <section>
          <h2 className="h">
            <span>캘린더 연결</span>
            <span>읽기만 합니다</span>
          </h2>
          <div className="card">
            {connected.length === 0 ? (
              <p className="lbl" style={{ margin: '0 0 12px' }}>
                연결한 캘린더가 없습니다.
              </p>
            ) : (
              <ul className="evlist" style={{ marginBottom: 12 }}>
                {connected.map((s) => (
                  <li key={s.id}>
                    <i className="bar" style={{ background: s.color }} />
                    <span className="ti">
                      {s.owner}
                      {s.account ? ` · ${s.account}` : ''}
                    </span>
                    <button
                      className="txtbtn"
                      onClick={async () => {
                        await disconnectCalendar(s.id);
                        toast('연결을 끊었습니다');
                      }}
                    >
                      해제
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* 서버 액션이 아니라 링크다. 구글 동의 화면으로 나갔다 돌아온다 */}
            <a className="addgrp" href="/api/calendar/google/start">
              ＋ 구글 캘린더 연결
            </a>
          </div>
        </section>

        <section>
          <h2 className="h">
            <span>아직 안 되는 것</span>
          </h2>
          <div className="card">
            <p className="lbl" style={{ margin: 0 }}>
              네이버 캘린더는 아직 연결할 수 없습니다. 네이버가 구독 주소를 주지 않아
              계정 자격으로 붙는 방식(CalDAV)이 필요합니다.
            </p>
          </div>
        </section>
      </main>

      <Nav onQuick={() => {}} />
    </div>
  );
}
