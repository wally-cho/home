#!/usr/bin/env node
// 다른 가계부 앱에서 받은 생활비 지출을 entry에 넣는다.
//
//   npm run living:import              # 넣기
//   npm run living:import -- --dry     # 무엇이 들어갈지만 보기
//
// 수입은 넣지 않는다. wallet의 entry는 유동 생활비 지출만 담는다 -
// 수입과 고정비는 월 계획의 몫이다(PRODUCT.md).
//
// 주의: 원본 CSV의 헤더에 '자산'이 두 번 나온다. 이름으로 읽으면 뒤의 열(금액)이
// 앞의 열(카드/계좌)을 덮어쓴다. 그래서 위치로 읽는다.
//   0 날짜 · 1 자산 · 2 분류 · 3 소분류 · 4 내용 · 5 KRW · 6 수입/지출
//   7 메모 · 8 금액 · 9 화폐 · 10 자산(중복, 금액)

import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

const PATH = process.argv.find((a) => a.endsWith('.csv')) ?? 'data/living.csv';
const DRY = process.argv.includes('--dry');

/**
 * 원본 분류 + 메모 → 우리 카테고리 7개.
 *
 * 분류만 보면 식비가 건수의 56%로 뭉쳐서 아무것도 알 수 없다. 메모를 읽으면
 * 이미 갈려 있다 - 커피 144 · 디저트 55 · 편의점 70건은 군것질이고, 생활용품
 * 147건 중 95건은 쿠팡·마트 장보기, 나머지 52건은 올리브영·다이소다.
 *
 * 그래서 분류를 먼저 보고, 먹는 것과 사는 것만 메모로 한 번 더 가른다.
 * 카테고리를 늘리지 않는다 - 하루 2.4건을 넣는 작업이라 탭 하나가 부담이다.
 */
/** 원본 '자산' 열 → 우리 지급 수단. 계획에 있는 이름과 맞춘다 */
const METHOD = {
  신한카드: '신한 신용',
  수협: '수협',
  현금: '현금',
  신한은행: '신한은행',
  삼성카드: '삼성카드',
};

const CAFE = /커피|카페|아메리카노|스타벅스|투썸|이디야|빽다방|디저트|빵|케이크|아이스크림|과자|간식|베이커리|편의점|씨유|GS25|세븐/;
const SHOP = /쿠팡|장보기|마트|이마트|홈플|코스트코|마켓컬리|트레이더/;

function classify(kind, content, memo) {
  const text = `${content ?? ''} ${memo ?? ''}`;

  // 성격이 분명한 것은 분류를 그대로 쓴다
  if (kind === '교통/차량') return '교통';
  if (kind === '문화생활') return '문화·여가';
  if (kind === '패션/미용') return '생활·미용';
  // 2년 반 동안 36건뿐인 것들은 기타로 접는다. 필요해지면 설정에서 되살린다
  if (['주거/통신', '교육', '건강', '경조사/회비', '기타'].includes(kind)) return '기타';

  // 먹는 것과 사는 것은 메모가 갈라준다
  if (CAFE.test(text)) return '카페·간식';
  if (SHOP.test(text)) return '장보기';
  if (kind === '마트/편의점') return '장보기';
  if (kind === '생활용품') return '생활·미용';
  return '식비';
}

/** 앞의 이모지와 공백을 떼어 '🍜 식비' → '식비' */
const plain = (s) =>
  String(s ?? '')
    .replace(/[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]/gu, '')
    .trim();

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const raw = parseCsv(await readFile(PATH, 'utf8')).slice(1); // 헤더 버림
const parsed = [];
const skipped = { 수입: 0, 금액없음: 0, 날짜없음: 0 };

for (const r of raw) {
  if (!r[0]?.trim()) continue;
  if (r[6]?.trim() !== '지출') {
    skipped.수입++;
    continue;
  }
  const m = r[0].match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (!m) {
    skipped.날짜없음++;
    continue;
  }
  const amount = Math.round(Number(String(r[8] ?? r[5]).replace(/[^0-9.]/g, '')));
  if (!(amount > 0)) {
    skipped.금액없음++;
    continue;
  }
  const cat = classify(plain(r[2]), r[4], r[7]);
  // 내용과 메모를 합쳐 메모 한 줄로. 40자 제한은 스키마에 맞춘다
  const memo = [r[4]?.trim(), r[7]?.trim()].filter(Boolean).join(' · ').slice(0, 40) || null;
  parsed.push({
    ymd: `${m[1]}-${m[2]}-${m[3]}`,
    amount,
    cat,
    memo,
    method: METHOD[String(r[1] ?? '').trim()] ?? null,
  });
}

const byCat = {};
const byMonth = {};
for (const p of parsed) {
  byCat[p.cat] = (byCat[p.cat] ?? 0) + 1;
  byMonth[p.ymd.slice(0, 7)] = (byMonth[p.ymd.slice(0, 7)] ?? 0) + p.amount;
}

console.log(`읽음 ${raw.length}줄 → 넣을 지출 ${parsed.length}건`);
console.log(`건너뜀: 수입 ${skipped.수입} · 금액없음 ${skipped.금액없음} · 날짜없음 ${skipped.날짜없음}`);
console.log('카테고리별:', Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' · '));
const byMethod = {};
for (const x of parsed) byMethod[x.method ?? '없음'] = (byMethod[x.method ?? '없음'] ?? 0) + 1;
console.log('지급 수단별:', Object.entries(byMethod).map(([k, v]) => `${k} ${v}`).join(' · '));
const months = Object.keys(byMonth).sort();
console.log(`기간 ${months[0]} ~ ${months.at(-1)} (${months.length}개월)`);

if (DRY) {
  console.log('\n--dry 이므로 넣지 않았습니다.');
  process.exit(0);
}

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z' });
await conn.query("SET time_zone = '+00:00'");

// 원본에만 있던 카테고리를 만든다('기타'는 항상 마지막에 둔다)
const needed = [...new Set(parsed.map((p) => p.cat))];
for (const name of needed) {
  await conn.query(
    `INSERT INTO category (book_id, name, sort_order)
     SELECT 1, ?, COALESCE(MAX(sort_order), 0) + 10 FROM category WHERE book_id = 1 AND is_fallback = 0
      ON DUPLICATE KEY UPDATE name = name`,
    [name],
  );
}
const [cats] = await conn.query('SELECT id, name FROM category WHERE book_id = 1');
const catId = new Map(cats.map((c) => [c.name, c.id]));
const [methods] = await conn.query('SELECT id, name FROM method WHERE book_id = 1');
const methodId = new Map(methods.map((m) => [m.name, m.id]));

// 다시 돌려도 같은 결과여야 한다. 같은 출처의 이전 임포트를 먼저 지운다
const [del] = await conn.query("DELETE FROM entry WHERE book_id = 1 AND created_by = 'import'");
if (del.affectedRows) console.log(`\n이전 임포트 ${del.affectedRows}건 지움`);

let n = 0;
for (const p of parsed) {
  await conn.query(
    `INSERT INTO entry (book_id, category_id, method_id, amount, occurred_on, memo, created_by)
     VALUES (1, ?, ?, ?, ?, ?, 'import')`,
    [catId.get(p.cat), p.method ? (methodId.get(p.method) ?? null) : null, p.amount, p.ymd, p.memo],
  );
  n++;
}

const [[sum]] = await conn.query(
  "SELECT COUNT(*) AS n, SUM(amount) AS s FROM entry WHERE book_id = 1 AND deleted_at IS NULL",
);
console.log(`\n넣음 ${n}건. entry 전체 ${sum.n}건 · ${Number(sum.s).toLocaleString()}원`);

const [recent] = await conn.query(
  `SELECT LEFT(occurred_on, 7) AS ym, COUNT(*) AS n, SUM(amount) AS s
     FROM entry WHERE book_id = 1 AND deleted_at IS NULL
    GROUP BY ym ORDER BY ym DESC LIMIT 6`,
);
console.log('최근 6개월:');
for (const r of recent) {
  console.log(`  ${r.ym}  ${String(r.n).padStart(3)}건  ${Number(r.s).toLocaleString().padStart(11)}원`);
}

await conn.end();
