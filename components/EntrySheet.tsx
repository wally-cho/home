'use client';

import { useEffect, useState } from 'react';
import { man, won } from '@/lib/money';
import { daysInMonth, dowOf } from '@/lib/month';
import { addEntry, deleteEntry, restoreEntry, updateEntry } from '@/lib/actions';
import { Sheet, useToast } from './Shell';
import type { CategoryRow } from '@/lib/types';

export interface EntryDraft {
  id: number | null;
  amount: string;
  categoryId: number;
  /** 어느 카드·계좌에서 나갔나. 계획의 유동 예산 수단이 기본값이다 */
  methodId: number | null;
  occurredOn: string;
  memo: string;
  /** 수정일 때 그 기록의 원래 금액(원). 예산 잔여를 다시 계산할 때 쓴다 */
  origAmount?: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];

/** 카테고리 원 안의 한 글자. 한 글자면 아이콘처럼 읽힌다 - 이름은 아래 라벨이 맡는다 */
const face = (name: string) => name[0];

export function EntrySheet({
  draft,
  setDraft,
  categories,
  methods,
  order,
  usage,
  budgetLeft,
}: {
  draft: EntryDraft | null;
  setDraft: (d: EntryDraft | null) => void;
  categories: CategoryRow[];
  methods: { id: number; name: string }[];
  order: number[];
  usage: Record<number, number>;
  /** 이번 달 유동 예산 잔여(원). 넣으면 얼마가 되는지 보여준다 */
  budgetLeft: number;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // 목록 순서: 최근 쓴 것 먼저
  const sorted = [...categories].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  useEffect(() => {
    if (draft && !categories.some((c) => c.id === draft.categoryId) && sorted[0]) {
      setDraft({ ...draft, categoryId: sorted[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  if (!draft)
    return (
      <Sheet open={false} onClose={() => {}}>
        {null}
      </Sheet>
    );

  const amount = Number(draft.amount || 0);
  const ok = amount > 0;
  const cat = categories.find((c) => c.id === draft.categoryId);
  const used = usage[draft.categoryId] ?? 0;

  // 수정일 때는 그 기록의 원래 금액이 이미 소진액에 들어 있다. 빼고 다시 더한다
  const orig = draft.id ? (draft.origAmount ?? 0) : 0;
  const after = budgetLeft + orig - amount;

  const key = (k: string) => {
    if (k === 'del') return setDraft({ ...draft, amount: draft.amount.slice(0, -1) });
    if (draft.amount.length >= 8) return;
    setDraft({ ...draft, amount: (draft.amount + k).replace(/^0+(?=\d)/, '') });
  };

  const save = async (stay: boolean) => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      if (draft.id) {
        await updateEntry({
          id: draft.id,
          amount,
          categoryId: draft.categoryId,
          methodId: draft.methodId,
          occurredOn: draft.occurredOn,
          memo: draft.memo,
        });
      } else {
        await addEntry({
          amount,
          categoryId: draft.categoryId,
          methodId: draft.methodId,
          occurredOn: draft.occurredOn,
          memo: draft.memo,
        });
      }
      if (stay) {
        setDraft({ ...draft, id: null, amount: '', memo: '', origAmount: 0 });
        toast('저장했습니다. 이어서 넣으세요');
      } else {
        setDraft(null);
        toast('저장했습니다');
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft.id || busy) return;
    setBusy(true);
    const id = draft.id;
    const label = `${cat?.name ?? ''} ${won(amount)}원`;
    try {
      await deleteEntry(id);
      setDraft(null);
      toast(`${label}을 지웠습니다`, () => void restoreEntry(id));
    } finally {
      setBusy(false);
    }
  };

  const ym = draft.occurredOn.slice(0, 7);
  const day = Number(draft.occurredOn.slice(8, 10));
  const month = Number(draft.occurredOn.slice(5, 7));
  const last = daysInMonth(ym);

  // 며칠치를 몰아서 넣을 때 시트를 닫았다 다시 열지 않아도 되게 한다.
  // 그 달 안에서만 움직인다 - 화면이 보고 있는 달을 벗어나면 저장한 기록이
  // 목록에 나타나지 않아서 안 들어간 것처럼 보인다. 달을 넘기려면 위의 월을 바꾼다
  const shiftDay = (delta: number) => {
    const d = day + delta;
    if (d < 1 || d > last) return;
    setDraft({ ...draft, occurredOn: `${ym}-${String(d).padStart(2, '0')}` });
  };

  return (
    <Sheet open onClose={() => setDraft(null)}>
      <div className="sh dh">
        <div className="dnav">
          <button onClick={() => shiftDay(-1)} disabled={day <= 1} aria-label="이전 날">
            <svg viewBox="0 0 24 24">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <b>
            {month}월 {day}일 ({dowOf(ym, day)})
          </b>
          <button onClick={() => shiftDay(1)} disabled={day >= last} aria-label="다음 날">
            <svg viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <span className="lbl">{draft.id ? '기록 수정' : '생활비 기록'}</span>
      </div>

      <div className="amt">
        <span className={'v n' + (ok ? '' : ' off')}>{ok ? won(amount) : '0'}</span>
        <span className="u">원</span>
        <div className="hint">
          {ok
            ? after >= 0
              ? `유동 잔여 ${man(after)}만이 됩니다`
              : `예산 ${man(-after)}만 초과가 됩니다`
            : '유동 예산에서 빠집니다'}
        </div>
      </div>

      <div className="keys">
        {KEYS.map((k) => (
          <button key={k} className="key" onClick={() => key(k)} aria-label={k === 'del' ? '지우기' : k}>
            {k === 'del' ? '←' : k}
          </button>
        ))}
      </div>

      <div className="f">
        <div className="lblrow">
          <span className="lbl">카테고리</span>
          <span className="lbl n">
            {cat?.name} {used ? `이번 달 ${man(used)}만` : '첫 기록'}
          </span>
        </div>
        <div className="catgrid">
          {sorted.map((c, i) => (
            <button
              key={c.id}
              className="cattile"
              aria-pressed={c.id === draft.categoryId}
              onClick={() => setDraft({ ...draft, categoryId: c.id })}
            >
              <span className={`cc h${i % 6}`}>{face(c.name)}</span>
              <span className="cn">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 계획의 유동 예산이 어느 계좌에서 나가는지 정해져 있고, 실제로는 다른 카드로도
          쓴다. 그 차이를 여기서 남긴다 - 기본값은 계획의 수단이다 */}
      <div className="f">
        <span className="lbl">지출 수단</span>
        <div className="chips">
          {methods.map((m) => (
            <button
              key={m.id}
              className="chip"
              aria-pressed={m.id === draft.methodId}
              onClick={() => setDraft({ ...draft, methodId: m.id })}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <div className="f">
        <span className="lbl">메모</span>
        <input
          className="inp"
          value={draft.memo}
          maxLength={40}
          placeholder="선택"
          onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
        />
      </div>

      <div className="btns">
        {draft.id ? (
          <button className="btn sub" onClick={remove} disabled={busy}>
            삭제
          </button>
        ) : (
          <button className="btn sub" onClick={() => save(true)} disabled={!ok || busy}>
            저장하고 계속
          </button>
        )}
        <button className="btn" onClick={() => save(false)} disabled={!ok || busy}>
          저장
        </button>
      </div>
    </Sheet>
  );
}
