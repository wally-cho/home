'use client';

import { useState } from 'react';
import { man, manToWon, won } from '@/lib/money';
import {
  archiveGroup,
  archiveItem,
  clearOverride,
  saveGroup,
  saveItem,
  setItemAmount,
} from '@/lib/actions';
import { TopBar, Nav, Sheet, ToastHost, useToast } from './Shell';
import { EntrySheet, type EntryDraft } from './EntrySheet';
import type { CategoryRow, LoanRow, MethodRow, PlanGroup, PlanItem } from '@/lib/types';

export interface PlanData {
  ym: string;
  todayYmd: string;
  isThisMonth: boolean;
  groups: PlanGroup[];
  income: number;
  expense: number;
  budget: number;
  spent: number;
  balance: number;
  methods: MethodRow[];
  loans: LoanRow[];
  categories: CategoryRow[];
  /** 계획의 유동 예산 그룹이 쓰는 수단. 새 기록의 기본값이다 */
  defaultMethodId: number | null;
  order: number[];
  usage: Record<number, number>;
}

export function PlanScreen(props: PlanData) {
  return (
    <ToastHost>
      <Plan {...props} />
    </ToastHost>
  );
}

function Plan(props: PlanData) {
  const { ym, groups, income, expense, budget, spent, balance, methods, loans } = props;
  const toast = useToast();
  // 모두 접은 채로 시작한다. 한 화면에 그룹 전체가 들어와야 무엇이 얼마인지 먼저 보인다
  const [open, setOpen] = useState<number[]>([]);
  const [editItem, setEditItem] = useState<{ group: PlanGroup; item: PlanItem | null } | null>(null);
  const [editGroup, setEditGroup] = useState<PlanGroup | 'new' | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);

  const toggle = (id: number) =>
    setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="app">
      <main>
        <TopBar ym={ym} />
        <section className="stack">
          {/* 홈과 같은 구성: 라벨 · 큰 숫자 하나 · 근거 한 줄.
              잔액은 뺄셈의 결과이므로 근거도 뺄셈으로 보여준다. 칩 세 개로
              나눠봤더니 서로 무관한 값 셋처럼 보여서 수식이 사라졌다.
              '유동은 예산 기준'이라는 말은 유동 그룹 아래 줄이 이미 하고 있다. */}
          <div className="panel">
            <div className="lbl">잔액</div>
            <div className="headline">
              <span className={'big n' + (balance >= 0 ? '' : ' neg')}>{man(balance)}</span>
              <span className="unit">만</span>
            </div>
            <div className="state n">
              수입 {man(income)} <span className="dim">−</span> 지출 {man(expense)}
            </div>
          </div>

          <div>
            <div id="groups">
              {groups.map((g) => {
                const solo = g.items.length === 1 && !g.items[0].name;
                return solo ? (
                  <StandaloneRow
                    key={g.id}
                    g={g}
                    budget={budget}
                    spent={spent}
                    onName={() => setEditItem({ group: g, item: g.items[0] })}
                  />
                ) : (
                  <GroupCard
                    key={g.id}
                    g={g}
                    ym={ym}
                    budget={budget}
                    spent={spent}
                    open={open.includes(g.id)}
                    onToggle={() => toggle(g.id)}
                    onItem={(it) => setEditItem({ group: g, item: it })}
                    onAdd={() => setEditItem({ group: g, item: null })}
                    onGroup={() => setEditGroup(g)}
                  />
                );
              })}
            </div>
            <button className="addgrp" onClick={() => setEditGroup('new')}>
              ＋ 그룹 추가
            </button>
          </div>

        </section>
      </main>

      <Nav
        onQuick={() =>
          setDraft({
            id: null,
            amount: '',
            categoryId: props.order[0] ?? props.categories[0]?.id ?? 0,
            methodId: props.defaultMethodId,
            occurredOn: props.isThisMonth ? props.todayYmd : `${ym}-01`,
            memo: '',
          })
        }
      />

      {editItem && (
        <ItemSheet
          ym={ym}
          group={editItem.group}
          item={editItem.item}
          loans={loans}
          onClose={() => setEditItem(null)}
          onAddSibling={(g) => setEditItem({ group: g, item: null })}
          onEditGroup={(g) => {
            setEditItem(null);
            setEditGroup(g);
          }}
          toast={toast}
        />
      )}

      {editGroup && (
        <GroupSheet
          group={editGroup === 'new' ? null : editGroup}
          methods={methods}
          onClose={() => setEditGroup(null)}
          toast={toast}
        />
      )}

      <EntrySheet
        draft={draft}
        setDraft={setDraft}
        categories={props.categories}
        methods={props.methods}
        order={props.order}
        usage={props.usage}
        budgetLeft={budget - spent}
      />
    </div>
  );
}

/* ── 두 종류의 줄 ────────────────────────────────────────────
   항목 줄 - 흰 바탕, ⌄ 없음. 이름 탭 = 상세, 금액칸 = 바로 고침
   그룹 줄 - 회색 카드, ⌄ 있음. 탭 = 펼치기. 금액은 합계(읽기 전용)
   한 종류 안에서는 동작이 언제나 같다. 예외를 두면 헷갈린다. */

/**
 * 항목 줄. 금액을 여기서 바로 고치지 않는다.
 *
 * 줄 전체가 상세 시트를 여는 버튼이고 금액은 읽기만 한다. 줄을 누르면 시트가
 * 열리는데 그 안에 입력칸이 또 있으면, 같은 줄에서 두 가지가 일어나 헷갈린다.
 * 인라인 편집은 그룹 안 세부항목에서만 쓴다 - 거기서는 이름과 금액의 탭 대상이
 * 눈으로 갈린다.
 */
function StandaloneRow({
  g,
  budget,
  spent,
  onName,
}: {
  g: PlanGroup;
  budget: number;
  spent: number;
  onName: () => void;
}) {
  const it = g.items[0];
  return (
    <>
      <button className="it top" onClick={onName}>
        <span className="dot" style={{ ['--rail' as string]: `var(--r-${g.rail})` }} />
        <ItemBody g={g} it={it} nameOverride={g.name} />
        <span className={'iv n' + (it.amount === 0 ? ' zero' : '')}>{man(it.amount)}</span>
      </button>
      {g.isVariable && <VarLine budget={budget} spent={spent} />}
    </>
  );
}

function GroupCard({
  g,
  ym,
  budget,
  spent,
  open,
  onToggle,
  onItem,
  onAdd,
  onGroup,
}: {
  g: PlanGroup;
  ym: string;
  budget: number;
  spent: number;
  open: boolean;
  onToggle: () => void;
  onItem: (it: PlanItem) => void;
  onAdd: () => void;
  onGroup: () => void;
}) {
  return (
    <div className={'grp' + (open ? ' open' : '')}>
      <button className="ghead" onClick={onToggle} aria-expanded={open}>
        <span className="dot" style={{ ['--rail' as string]: `var(--r-${g.rail})` }} />
        <span className="gn">
          <b>{g.name}</b>
          {(g.method || g.isVariable) && (
            <span>{[g.method, g.isVariable ? '예산' : ''].filter(Boolean).join(' · ')}</span>
          )}
        </span>
        <span className="gv n">{man(g.sum)}</span>
        <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div className="gbody">
        {g.items.map((it) => (
          <div className="it" key={it.id}>
            <ItemTap g={g} it={it} onClick={() => onItem(it)} />
            <AmountCell item={it} ym={ym} />
          </div>
        ))}
        <div className="addrow">
          <button className="add" onClick={onAdd}>
            ＋ 세부항목 추가
          </button>
          <button className="add ghost" onClick={onGroup}>
            그룹 편집
          </button>
        </div>
      </div>
      {g.isVariable && <VarLine budget={budget} spent={spent} />}
    </div>
  );
}

function ItemTap({
  g,
  it,
  onClick,
}: {
  g: PlanGroup;
  it: PlanItem;
  onClick: () => void;
}) {
  return (
    <button className="itap" onClick={onClick}>
      <ItemBody g={g} it={it} />
    </button>
  );
}

/** 이름과 그 아래 한 줄. 항목 줄과 세부항목 줄이 같은 내용을 쓴다 */
function ItemBody({
  g,
  it,
  nameOverride,
}: {
  g: PlanGroup;
  it: PlanItem;
  nameOverride?: string;
}) {
  const bits: string[] = [];
  if (nameOverride && g.method) bits.push(g.method);
  if (it.payDay) bits.push(`매월 ${it.payDay === 32 ? '말일' : it.payDay + '일'}`);
  if (it.memo) bits.push(it.memo);
  if (it.endYm) bits.push(`${it.startYm ?? ''}~${it.endYm}`);

  return (
    <span className="itap as-text">
      <b>{nameOverride ?? it.name}</b>
      <em>
        {bits.length > 0 ? <span>{bits.join(' · ')}</span> : null}
        {it.accrues && <span className="flag acc">적립 {man(it.accrued)}만</span>}
        {it.loanSuggestion !== null && (
          <span className="flag loan">상환표 {won(it.loanSuggestion)}원</span>
        )}
        {it.overridden && <span className="flag ovr">이 달만</span>}
        {bits.length === 0 && !it.accrues && it.loanSuggestion === null && !it.overridden && (
          <span>탭해서 결제일·비고 설정</span>
        )}
      </em>
    </span>
  );
}

/**
 * 금액칸. 타이핑하는 동안 서버에 보내지 않고, 칸을 떠날 때 한 번 저장한다.
 *
 * 값을 리액트 상태로 들고 있지 않는다. 서버가 새 값을 내려줄 때마다 상태를
 * 되맞추는 effect가 필요해지고, 그게 렌더를 연쇄시킨다. key로 다시 마운트하면
 * 그 과정이 사라진다 - 값이 바뀌는 시점은 이미 포커스를 떠난 뒤다.
 */
function AmountCell({ item, ym }: { item: PlanItem; ym: string }) {
  const [busy, setBusy] = useState(false);

  const commit = async (el: HTMLInputElement) => {
    const next = manToWon(el.value);
    if (next === item.amount) {
      el.value = man(item.amount);
      return;
    }
    setBusy(true);
    try {
      await setItemAmount(item.id, ym, next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <input
      key={item.amount}
      className="iv n amtin"
      inputMode="decimal"
      aria-label="금액 (만원)"
      defaultValue={man(item.amount)}
      disabled={busy}
      onBlur={(e) => void commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** 유동 그룹의 금액은 '쓸 계획'이 아니라 예산이다. 안 쓰면 남는다는 차이를 한 줄로 못 박는다 */
function VarLine({ budget, spent }: { budget: number; spent: number }) {
  const left = budget - spent;
  return (
    <div className="gvar">
      예산 <b className="n">{man(budget)}</b> · 이번 달 <b className="n">{man(spent)}</b> 씀 ·{' '}
      {left >= 0 ? (
        <>
          남은 <b className="n">{man(left)}</b>
        </>
      ) : (
        <>
          <b className="n neg">{man(-left)}</b> 초과
        </>
      )}
    </div>
  );
}

/* ── 항목 편집 시트 ──────────────────────────────────────── */

function ItemSheet({
  ym,
  group,
  item,
  loans,
  onClose,
  onAddSibling,
  onEditGroup,
  toast,
}: {
  ym: string;
  group: PlanGroup;
  item: PlanItem | null;
  loans: LoanRow[];
  onClose: () => void;
  onAddSibling: (g: PlanGroup) => void;
  onEditGroup: (g: PlanGroup) => void;
  toast: (msg: string, undo?: () => void) => void;
}) {
  const isNew = item === null;
  const solo = group.items.length === 1 && !group.items[0].name;
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(man(item?.amount ?? 0));
  const [payDay, setPayDay] = useState(String(item?.payDay ?? ''));
  const [startYm, setStartYm] = useState(item?.startYm ?? '');
  const [endYm, setEndYm] = useState(item?.endYm ?? '');
  const [memo, setMemo] = useState(item?.memo ?? '');
  const [accrues, setAccrues] = useState(item?.accrues ?? false);
  const [onlyThis, setOnlyThis] = useState(item?.overridden ?? false);
  const [busy, setBusy] = useState(false);

  const suggestion = item?.loanSuggestion ?? null;
  const loanName = loans.find((l) => l.id === item?.loanId)?.name;

  const save = async () => {
    setBusy(true);
    try {
      await saveItem({
        id: item?.id ?? null,
        groupId: group.id,
        name: name.trim() ? name.trim().slice(0, 12) : isNew ? '새 항목' : (item?.name ?? null),
        amount: manToWon(amount),
        payDay: payDay ? Number(payDay) : null,
        startYm: startYm.trim() || null,
        endYm: endYm.trim() || null,
        memo: memo.trim() || null,
        accrues,
        loanId: item?.loanId ?? null,
        onlyThisMonth: onlyThis && !isNew,
        ym,
      });
      onClose();
      toast(onlyThis && !isNew ? `${Number(ym.slice(5, 7))}월에만 반영했습니다` : '저장했습니다');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose}>
      <div className="sh">
        <b>{isNew ? '세부항목 추가' : (item?.name ?? group.name)}</b>
        {!isNew && group.items.length > 1 && (
          <button
            onClick={async () => {
              await archiveItem(item!.id);
              onClose();
              toast(`${item!.name ?? group.name} 항목을 지웠습니다`);
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
          placeholder={solo ? group.name : '예: 넷플릭스'}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="two">
        <div className="f">
          <span className="lbl">금액 (만원)</span>
          <input
            className="inp n"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="f">
          <span className="lbl">결제일</span>
          <select className="inp" value={payDay} onChange={(e) => setPayDay(e.target.value)}>
            <option value="">없음</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
            <option value="32">말일</option>
          </select>
        </div>
      </div>

      <div className="two">
        <div className="f">
          <span className="lbl">시작월</span>
          <input
            className="inp n"
            value={startYm}
            placeholder="2024-03"
            onChange={(e) => setStartYm(e.target.value)}
          />
        </div>
        <div className="f">
          <span className="lbl">종료월</span>
          <input
            className="inp n"
            value={endYm}
            placeholder="비우면 무기한"
            onChange={(e) => setEndYm(e.target.value)}
          />
        </div>
      </div>

      <div className="f">
        <span className="lbl">비고</span>
        <input
          className="inp"
          value={memo}
          maxLength={40}
          placeholder="예: 폰, 유튜브"
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <div className="toggle">
        <div>
          <div className="t">적립 표시</div>
          <div className="s">시작월부터 이번 달까지 자동 합산</div>
        </div>
        <button className="sw" aria-pressed={accrues} onClick={() => setAccrues(!accrues)} />
      </div>

      {!isNew && (
        <div className="toggle">
          <div>
            <div className="t">이 달만 수정</div>
            <div className="s">
              {Number(ym.slice(0, 4))}년 {Number(ym.slice(5, 7))}월에만 적용됩니다
            </div>
          </div>
          <button
            className="sw"
            aria-pressed={onlyThis}
            onClick={async () => {
              const next = !onlyThis;
              setOnlyThis(next);
              if (!next && item?.overridden) await clearOverride(item.id, ym);
            }}
          />
        </div>
      )}

      {suggestion !== null && (
        <button
          className="btn sub"
          style={{ marginBottom: 12 }}
          onClick={() => setAmount(man(suggestion))}
        >
          {loanName} 상환표 {won(suggestion)}원 넣기
        </button>
      )}

      {solo && !isNew && (
        <div className="btns" style={{ marginBottom: 12 }}>
          <button className="btn sub" onClick={() => onAddSibling(group)}>
            ＋ 세부항목 추가
          </button>
          <button className="btn sub" onClick={() => onEditGroup(group)}>
            그룹 편집
          </button>
        </div>
      )}

      <div className="btns">
        <button className="btn sub" style={{ flex: '0 0 96px' }} onClick={onClose}>
          취소
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          저장
        </button>
      </div>
    </Sheet>
  );
}

/* ── 그룹 편집 시트 ──────────────────────────────────────── */

function GroupSheet({
  group,
  methods,
  onClose,
  toast,
}: {
  group: PlanGroup | null;
  methods: MethodRow[];
  onClose: () => void;
  toast: (msg: string) => void;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [methodId, setMethodId] = useState(String(group?.methodId ?? ''));
  const [isVariable, setIsVariable] = useState(group?.isVariable ?? false);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open onClose={onClose}>
      <div className="sh">
        <b>{group ? group.name : '그룹 추가'}</b>
        {group && (
          <button
            onClick={async () => {
              await archiveGroup(group.id);
              onClose();
              toast(`${group.name} 그룹을 지웠습니다`);
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
          placeholder="예: 생활비 고정"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="f">
        <span className="lbl">지급 수단</span>
        <select className="inp" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
          <option value="">없음</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="toggle">
        <div>
          <div className="t">유동 예산 그룹</div>
          <div className="s">이 금액이 달력 기록의 예산이 됩니다</div>
        </div>
        <button
          className="sw"
          aria-pressed={isVariable}
          onClick={() => setIsVariable(!isVariable)}
        />
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
              await saveGroup({
                id: group?.id ?? null,
                name,
                methodId: methodId ? Number(methodId) : null,
                isVariable,
                kind: group?.kind ?? 'expense',
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
