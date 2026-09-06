'use client';

import { useRouter, usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { MONTH_COOKIE, parseYm, today, ymOf } from '@/lib/month';
import {
  AREAS,
  DEFAULT_AREA,
  areaBySlug,
  areaOfPath,
  hrefOf,
  type Area,
  type AreaTab,
} from '@/lib/areas';
import { ICONS } from './icons';

/* ── 시트 ────────────────────────────────────────────────────
   입력과 편집은 전부 바텀시트다. 별도 화면으로 밀어내지 않는다 -
   화면 이동이 없으면 뒤로 가기와 월 이동이 헷갈릴 일도 없다. */

/**
 * 열려 있는 시트의 수. 한 화면에 시트가 여럿이라 세어야 한다 - 하나를 닫을 때
 * 다른 것이 아직 열려 있으면 네비를 도로 올리면 안 된다.
 */
let openSheets = 0;

/**
 * 시트가 열려 있는 동안 `body`에 표시를 남긴다. 하단 네비가 그것을 보고 내려간다.
 *
 * z-index로는 안 된다. 네비의 `backdrop-filter`가 iOS에서 그 요소를 합성
 * 레이어로 올려서, 시트가 더 위(41 > 30)인데도 네비가 위에 그려진다.
 * 월 격자의 마지막 줄이 가려지는 것이 그것이다.
 */
function useSheetOpen(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openSheets += 1;
    document.body.classList.add('sheet-open');
    return () => {
      openSheets -= 1;
      if (openSheets === 0) document.body.classList.remove('sheet-open');
    };
  }, [open]);
}

export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useSheetOpen(open);

  return (
    <>
      <div className={'scrim' + (open ? ' on' : '')} onClick={onClose} />
      <div className={'sheet' + (open ? ' on' : '')} role="dialog" aria-modal="true">
        <div className="grab" />
        {open && children}
      </div>
    </>
  );
}

/* ── 토스트 ──────────────────────────────────────────────────
   삭제는 확인 모달 없이 지우고 5초간 되돌리기를 띄운다. */

type ToastState = { msg: string; undo?: () => void } | null;
const ToastCtx = createContext<(msg: string, undo?: () => void) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ToastState>(null);

  const show = useCallback((msg: string, undo?: () => void) => {
    setState({ msg, undo });
    window.setTimeout(() => setState(null), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={'toast' + (state ? ' on' : '')}>
        <span>{state?.msg}</span>
        {state?.undo && (
          <button
            onClick={() => {
              state.undo?.();
              setState(null);
            }}
          >
            되돌리기
          </button>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

/* ── 헤더 ────────────────────────────────────────────────────
   왼쪽에 고르는 것들, 오른쪽에 설정. 한 줄이다.

   고르는 것은 두 가지다 - 어느 영역을 보는지, 그 영역이 달을 쓰면 어느 달인지.
   둘 다 이름을 탭해 시트에서 고른다. 좌우 화살표를 두지 않는다 - 화살표가
   뒤로 가기와 모양이 겹쳐서 헷갈린다.

   화면 이름은 여기 두지 않는다. 하단 네비가 이미 어느 화면인지 알려준다. */

/** 쿠키에 보고 있는 월을 적는다. 서버 컴포넌트가 다음 요청에 읽는다 */
function rememberMonth(ym: string) {
  document.cookie = `${MONTH_COOKIE}=${ym}; path=/; max-age=${90 * 86400}; samesite=lax`;
}

/**
 * 화면 맨 위 한 줄.
 *
 * 영역 스위치는 영역이 둘 이상일 때만 나온다. 고를 것이 하나뿐이면 눌러도
 * 아무 일이 없는 버튼이 하나 늘 뿐이다 - `lib/areas.ts`에 영역을 하나 더
 * 넣으면 그때 나타난다.
 *
 * 월은 한 영역 안에서 화면 전체가 하나를 공유한다. 여기서 고른 달로 네비를
 * 옮겨다니며 같은 달의 계획과 기록을 나란히 본다.
 */
export function TopBar({ ym }: { ym?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const area = areaOfPath(pathname) ?? DEFAULT_AREA;
  const [pickArea, setPickArea] = useState(false);

  // 영역 이름이 앞에 붙으면 월까지 '2026년 9월'로 길게 두면 한 줄을 넘는다.
  // 올해면 달만 적는다 - 시트를 열면 어차피 해가 보인다
  const many = AREAS.length > 1;

  return (
    <>
      <div className="topbar">
        {many && (
          <button className="mpill" onClick={() => setPickArea(true)}>
            <span>{area.name}</span>
            <Chevron />
          </button>
        )}
        {area.axis === 'month' && ym && <MonthPill ym={ym} short={many} />}
        <span className="sp" />
        <GearButton onClick={() => router.push('/settings')} />
      </div>

      <Sheet open={pickArea} onClose={() => setPickArea(false)}>
        <div className="apick">
          {AREAS.map((a) => (
            <button
              key={a.slug}
              aria-pressed={a.slug === area.slug}
              onClick={() => {
                // 마지막으로 본 영역은 proxy.ts가 쿠키에 적는다
                router.push(`/${a.slug}`);
                setPickArea(false);
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** 월 선택. 영역이 달을 쓰는 동안에만 헤더에 붙는다 */
function MonthPill({ ym, short }: { ym: string; short: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { y, m } = parseYm(ym);
  const [pick, setPick] = useState(false);
  const [pickYear, setPickYear] = useState(y);

  const goto = (nextYm: string) => {
    rememberMonth(nextYm);
    router.push(`${pathname}?m=${nextYm}`);
    setPick(false);
  };

  const label = short && y === today().y ? `${m}월` : `${y}년 ${m}월`;

  return (
    <>
      <button
        className={short ? 'mpill sub' : 'mpill'}
        onClick={() => {
          setPickYear(y);
          setPick(true);
        }}
      >
        <span>{label}</span>
        <Chevron />
      </button>

      <Sheet open={pick} onClose={() => setPick(false)}>
        <div className="ynav">
          <button onClick={() => setPickYear(pickYear - 1)} aria-label="이전 해">
            <svg viewBox="0 0 24 24">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <b className="n">{pickYear}</b>
          <button onClick={() => setPickYear(pickYear + 1)} aria-label="다음 해">
            <svg viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="mgrid">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
            <button
              key={mm}
              className="mcell n"
              aria-pressed={pickYear === y && mm === m}
              onClick={() => goto(ymOf(pickYear, mm))}
            >
              {mm}월
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** 설정 화면의 맨 위 줄. 영역 밖이라 고를 것이 없으므로 제목과 나가는 길만 둔다 */
export function SettingsBar() {
  const router = useRouter();
  return (
    <div className="topbar">
      <span className="where">설정</span>
      <span className="sp" />
      {/* '/'는 마지막으로 본 영역으로 보낸다. 어디서 설정에 들어왔든 그리로 돌아간다 */}
      <button className="txtbtn" onClick={() => router.push('/')}>
        완료
      </button>
    </div>
  );
}

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="iconbtn" aria-label="설정" onClick={onClick}>
      <svg viewBox="0 0 24 24">
        <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
        <circle cx="15" cy="8" r="2.2" />
        <circle cx="9" cy="16" r="2.2" />
      </svg>
    </button>
  );
}

/* ── 하단 네비 ───────────────────────────────────────────────
   지금 영역의 화면들이다. 영역 이름은 여기 오지 않는다 - 그것은 상단 스위치가
   맡는다. 칸은 `lib/areas.ts`의 표에서 오므로 영역을 붙여도 여기는 안 고친다. */

/**
 * @param area 영역 밖(설정)에서 쓸 때 어느 영역의 칸을 보여줄지. 서버가
 *   쿠키에서 읽어 넘긴다 - 클라이언트에서 읽으면 서버가 그린 것과 어긋난다
 */
export function Nav({ onQuick, area: slug }: { onQuick: () => void; area?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const area = areaOfPath(pathname) ?? areaBySlug(slug) ?? DEFAULT_AREA;

  // [+]는 가운데다. 왼쪽과 오른쪽에 반씩 나눠 놓는다
  const half = Math.ceil(area.tabs.length / 2);
  const cols = area.tabs.length + (area.quick ? 1 : 0);

  const button = (tab: AreaTab) => (
    <NavButton
      key={tab.seg}
      area={area}
      tab={tab}
      active={pathname === hrefOf(area, tab)}
      router={router}
    />
  );

  return (
    <nav>
      <div className="inner" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {area.tabs.slice(0, half).map(button)}
        {area.quick && (
          <span className="mid">
            <button onClick={onQuick} aria-label={area.quick}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </span>
        )}
        {area.tabs.slice(half).map(button)}
      </div>
    </nav>
  );
}

function NavButton({
  area,
  tab,
  active,
  router,
}: {
  area: Area;
  tab: AreaTab;
  active: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    // 월을 URL에 싣지 않는다. 그 화면이 기억하는 달로 열려야 한다
    <button aria-current={active ? 'page' : undefined} onClick={() => router.push(hrefOf(area, tab))}>
      <svg viewBox="0 0 24 24">{ICONS[tab.icon]}</svg>
      {tab.label}
    </button>
  );
}
