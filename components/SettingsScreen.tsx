'use client';

import { useState } from 'react';
import { man } from '@/lib/money';
import { deleteMethod, moveCategory, moveMethod, saveCategory, saveMethod } from '@/lib/actions';
import { Nav, SettingsBar, Sheet, ToastHost, useToast } from './Shell';
import type { CategoryRow } from '@/lib/types';

export interface MethodItem {
  id: number;
  name: string;
  /** 이 수단으로 빠져나가는 계획 그룹. 쓰는 곳이 있으면 지울 수 없다 */
  groups: string[];
}

export interface SettingsData {
  categories: CategoryRow[];
  usage: Record<number, number>;
  methods: MethodItem[];
  /** 설정은 영역 밖이다. 하단 네비는 들어오기 전에 보던 영역의 칸을 그대로 둔다 */
  area: string;
}

const face = (name: string) => name[0];

/**
 * 설정에는 내가 바꿀 수 있는 것만 둔다.
 *
 * 대출 상환표는 은행이 준 표를 스크립트로 넣는 것이라 여기서 바꿀 게 없다.
 * 회차 수는 대출 화면 헤더가 이미 말한다. 읽기만 하는 칸을 설정에 두면
 * 무엇을 눌러야 하는지 헷갈린다.
 */
export function SettingsScreen(props: SettingsData) {
  return (
    <ToastHost>
      <Settings {...props} />
    </ToastHost>
  );
}

function Settings({ categories, usage, methods, area }: SettingsData) {
  const toast = useToast();
  const [editCat, setEditCat] = useState<CategoryRow | 'new' | null>(null);
  const [editMethod, setEditMethod] = useState<MethodItem | 'new' | null>(null);
  const shown = categories.filter((c) => !c.hidden_at).length;
  const hidden = categories.length - shown;

  return (
    <div className="app">
      <main>
        <SettingsBar />

        <section className="stack">
          <div>
            <h2 className="h">
              <span>카테고리</span>
              <span>
                {shown}개 사용 중{hidden ? ` · ${hidden}개 숨김` : ''}
              </span>
            </h2>
            <div>
              {categories.map((c, i) => (
                <div key={c.id} className={'srow' + (c.hidden_at ? ' off' : '')}>
                  <span className={`cc h${i % 6}`}>{face(c.name)}</span>
                  <button className="nm" onClick={() => setEditCat(c)}>
                    {c.name}
                    <em>
                      {c.hidden_at
                        ? '숨김'
                        : usage[c.id]
                          ? `이번 달 ${man(usage[c.id])}만`
                          : '이번 달 기록 없음'}
                      {c.is_fallback ? ' · 숨길 수 없음' : ''}
                    </em>
                  </button>
                  {!c.is_fallback && (
                    <Order
                      onUp={() => void moveCategory(c.id, -1)}
                      onDown={() => void moveCategory(c.id, 1)}
                      upDisabled={i === 0}
                      downDisabled={i >= categories.length - 2}
                    />
                  )}
                </div>
              ))}
            </div>
            <button className="addgrp" style={{ marginTop: 8 }} onClick={() => setEditCat('new')}>
              ＋ 카테고리 추가
            </button>
            <p className="note kr" style={{ marginTop: 14 }}>
              <b>지우지 않고 숨깁니다.</b> 지난 기록이 그 카테고리를 참조하고 있어서, 숨기면 입력
              화면에서만 사라지고 과거 기록과 통계에는 남습니다. <b>기타</b>는 숨길 수 없습니다.
              카테고리는 달마다 다르지 않습니다.
            </p>
          </div>

          <div>
            <h2 className="h">
              <span>지급 수단</span>
              <span>{methods.length}개</span>
            </h2>
            <div>
              {methods.map((m, i) => (
                <div key={m.id} className="srow">
                  <button className="nm" onClick={() => setEditMethod(m)}>
                    {m.name}
                    <em>{m.groups.length ? m.groups.join(' · ') : '쓰는 그룹 없음'}</em>
                  </button>
                  <Order
                    onUp={() => void moveMethod(m.id, -1)}
                    onDown={() => void moveMethod(m.id, 1)}
                    upDisabled={i === 0}
                    downDisabled={i === methods.length - 1}
                  />
                </div>
              ))}
            </div>
            <button className="addgrp" style={{ marginTop: 8 }} onClick={() => setEditMethod('new')}>
              ＋ 지급 수단 추가
            </button>
          </div>
        </section>
      </main>

      <Nav onQuick={() => {}} area={area} />

      {editCat && (
        <CategorySheet
          category={editCat === 'new' ? null : editCat}
          onClose={() => setEditCat(null)}
          toast={toast}
        />
      )}
      {editMethod && (
        <MethodSheet
          method={editMethod === 'new' ? null : editMethod}
          onClose={() => setEditMethod(null)}
          toast={toast}
        />
      )}
    </div>
  );
}

function Order({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
}) {
  return (
    <span className="ord">
      <button onClick={onUp} disabled={upDisabled} aria-label="위로">
        <svg viewBox="0 0 24 24">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
      <button onClick={onDown} disabled={downDisabled} aria-label="아래로">
        <svg viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </span>
  );
}

function CategorySheet({
  category,
  onClose,
  toast,
}: {
  category: CategoryRow | null;
  onClose: () => void;
  toast: (msg: string) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [hidden, setHidden] = useState(!!category?.hidden_at);
  const [busy, setBusy] = useState(false);
  const isNew = category === null;

  return (
    <Sheet open onClose={onClose}>
      <div className="sh">
        <b>{isNew ? '카테고리 추가' : category!.name}</b>
      </div>
      <div className="f">
        <span className="lbl">이름</span>
        <input
          className="inp"
          value={name}
          maxLength={10}
          placeholder="예: 반려동물"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {!isNew && !category!.is_fallback && (
        <div className="toggle">
          <div>
            <div className="t">입력 화면에서 숨기기</div>
            <div className="s">과거 기록과 통계에는 그대로 남습니다</div>
          </div>
          <button className="sw" aria-pressed={hidden} onClick={() => setHidden(!hidden)} />
        </div>
      )}
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
              await saveCategory({ id: category?.id ?? null, name, hidden });
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

function MethodSheet({
  method,
  onClose,
  toast,
}: {
  method: MethodItem | null;
  onClose: () => void;
  toast: (msg: string) => void;
}) {
  const [name, setName] = useState(method?.name ?? '');
  const [busy, setBusy] = useState(false);
  const isNew = method === null;
  const inUse = (method?.groups.length ?? 0) > 0;

  return (
    <Sheet open onClose={onClose}>
      <div className="sh">
        <b>{isNew ? '지급 수단 추가' : method!.name}</b>
        {!isNew && !inUse && (
          <button
            onClick={async () => {
              try {
                await deleteMethod(method!.id);
                onClose();
                toast(`${method!.name}을 지웠습니다`);
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            삭제
          </button>
        )}
      </div>
      <div className="f">
        <span className="lbl">이름</span>
        <input
          className="inp"
          value={name}
          maxLength={12}
          placeholder="예: 신한 신용"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {!isNew && inUse && (
        <p className="note kr" style={{ margin: '0 2px 14px' }}>
          <b>{method!.groups.join(' · ')}</b>가 이 수단으로 빠져나갑니다. 쓰는 곳이 있으면 지울 수
          없습니다. 카드를 바꿨다면 이름만 고치면 됩니다.
        </p>
      )}
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
              await saveMethod({ id: method?.id ?? null, name });
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
