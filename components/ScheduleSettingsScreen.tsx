'use client';

import { useState } from 'react';
import { Nav, SettingsBar, ToastHost, useToast } from './Shell';
import { connectNaver, disconnectCalendar, renameCalendar } from '@/lib/actions';
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
  const [naverOpen, setNaverOpen] = useState(false);
  const connected = sources.filter((s) => s.connected === 1);

  return (
    <div className="app">
      <main>
        <SettingsBar title="일정 설정" />

        {/* 연결은 한 상자에 모은다. 구글이든 네이버든 '어디서 끌어오는가'로는 같은
            것이라, 상자를 나누면 사람이 어느 상자에 있는지가 곧 제공자가 되어 헷갈린다.
            무엇으로 붙었는지는 각 줄이 말한다 */}
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
                  <Source key={s.id} s={s} toast={toast} />
                ))}
              </ul>
            )}

            {naverOpen ? (
              <NaverForm toast={toast} onDone={() => setNaverOpen(false)} />
            ) : (
              <div className="addrow">
                {/* 구글은 서버 액션이 아니라 링크다. 동의 화면으로 나갔다 돌아온다 */}
                <a className="addgrp" href="/api/calendar/google/start">
                  ＋ 구글
                </a>
                <button className="addgrp" onClick={() => setNaverOpen(true)}>
                  ＋ 네이버
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <Nav onQuick={() => {}} />
    </div>
  );
}

/**
 * 한 줄. 이름은 그 자리에서 고친다 - 시트를 열 만한 값이 아니다.
 * 계정 주소는 읽기만 하는 값이지만 여기 둔다. 어느 계정에 붙었는지 모르면
 * 잘못 연결했을 때 알아챌 방법이 없다.
 */
function Source({ s, toast }: { s: SourceRow; toast: (m: string) => void }) {
  const [name, setName] = useState(s.owner);

  return (
    <li>
      <i className="bar" style={{ background: s.color }} />
      <input
        className="ownername"
        value={name}
        maxLength={12}
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          const next = name.trim();
          if (!next || next === s.owner) {
            setName(s.owner);
            return;
          }
          await renameCalendar(s.id, next);
          toast(`${next}으로 바꿨습니다`);
        }}
      />
      {/* 무엇으로 붙었는지는 줄이 말한다. 상자를 나누지 않는 이유다 */}
      <span className="lo">
        {s.provider === 'google' ? '구글' : '네이버'} · {s.account ?? ''}
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
  );
}


/**
 * 네이버는 OAuth가 없다. CalDAV라 아이디와 비밀번호를 직접 받는다.
 *
 * **앱 비밀번호를 권한다.** 2단계 인증 안에서 만드는 값이고 캘린더에만 쓰이며 따로
 * 폐기할 수 있다. 계정 비밀번호를 넣으면 우리 DB에 든 값이 메일까지 여는 열쇠가 된다 -
 * 네이버의 앱 비밀번호는 IMAP·POP·SMTP에도 쓰이는 자리다.
 */
function NaverForm({ toast, onDone }: { toast: (m: string) => void; onDone: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await connectNaver(id, pw, owner);
      // 비밀번호를 화면에 남겨두지 않는다
      setId('');
      setPw('');
      setOwner('');
      onDone();
      toast('네이버 캘린더를 연결했습니다');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '연결하지 못했습니다');
    }
    setBusy(false);
  };

  return (
    <div className="form">
      <p className="lbl" style={{ margin: 0 }}>
        네이버 → 내 정보 → 보안설정 → 2단계 인증 [관리]에서 만든{' '}
        <b>애플리케이션 비밀번호</b>를 넣습니다.
      </p>
      <input
        placeholder="네이버 아이디 (@naver.com 빼고)"
        value={id}
        autoComplete="off"
        onChange={(e) => setId(e.target.value)}
      />
      <input
        placeholder="애플리케이션 비밀번호"
        type="password"
        value={pw}
        autoComplete="off"
        onChange={(e) => setPw(e.target.value)}
      />
      <input
        placeholder="화면에 뜰 이름"
        value={owner}
        maxLength={12}
        onChange={(e) => setOwner(e.target.value)}
      />
      {/* 실패는 그대로 보여준다. 무엇이 틀렸는지 말해주지 않으면 다시 넣을 수 없다 */}
      {err && <p className="errline">{err}</p>}
      <div className="formrow">
        <button className="txtbtn" onClick={onDone}>
          취소
        </button>
        <button className="gobtn" onClick={submit} disabled={busy || !id || !pw}>
          {busy ? '붙어보는 중' : '연결'}
        </button>
      </div>
    </div>
  );
}
