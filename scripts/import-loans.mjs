#!/usr/bin/env node
// 은행 상환표 CSV를 loan_schedule에 넣는다.
//
//   npm run loans:import                     data/ 안의 매핑 전부
//   npm run loans:import -- 아낌e보금자리론=data/bogeumjari.csv
//
// 표는 주어진 것을 그대로 넣는다. 앱이 원리금을 계산하지 않는다 -
// 회차마다 조금씩 늘어나는 체증식이고 이자는 구간 일수에 따라 흔들려서,
// 계산기를 만들면 실제 은행 표와 몇 원씩 어긋난다.
//
// 병합된 3줄 헤더는 건너뛴다. 첫 칸이 정수인 줄만 읽는다 - 회차 컬럼이 앵커다.
// 같은 회차가 다시 들어오면 덮어쓴다(금리가 바뀌어 표를 다시 받는 경우가 정상 경로다).

import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

const DEFAULTS = [
  ['아낌e보금자리론', 'data/bogeumjari.csv'],
  ['내집마련디딤돌', 'data/didimdol.csv'],
];

const args = process.argv.slice(2).filter((a) => a.includes('='));
const targets = args.length ? args.map((a) => a.split('=')) : DEFAULTS;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 없습니다. .env.local을 확인하세요.');
  process.exit(1);
}

/** "1,234" "1 234원" → 1234. 빈 칸은 null */
function num(s) {
  const t = String(s ?? '').replace(/[^0-9-]/g, '');
  return t === '' ? null : Number(t);
}

/** 2023-09-08 / 2023.09.08 / 20230908 → '2023-09-08' */
function date(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const digits = t.replace(/[^0-9]/g, '');
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** 아주 단순한 CSV 파서. 따옴표 안의 콤마만 처리하면 충분하다 */
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

const conn = await mysql.createConnection({ uri: url, timezone: 'Z' });
await conn.query("SET time_zone = '+00:00'");

for (const [loanName, path] of targets) {
  const [[loan]] = await conn.query('SELECT id FROM loan WHERE name = ?', [loanName]);
  if (!loan) {
    console.error(`대출 '${loanName}' 이 없습니다. migrations/002_seed.sql 을 먼저 적용하세요.`);
    process.exitCode = 1;
    continue;
  }

  const rows = parseCsv(await readFile(path, 'utf8'))
    .filter((r) => /^\d+$/.test(String(r[0] ?? '').trim()))
    .map((r) => ({
      seq: Number(r[0]),
      due: date(r[1]),
      biz: date(r[2]),
      total: num(r[3]),
      principal: num(r[4]),
      interest: num(r[5]),
      balance: num(r[6]),
      from: date(r[7]),
      to: date(r[8]),
    }))
    .filter((r) => r.due && r.total !== null);

  if (rows.length === 0) {
    console.error(`${path}: 읽을 행이 없습니다.`);
    process.exitCode = 1;
    continue;
  }

  let n = 0;
  for (const r of rows) {
    await conn.query(
      `INSERT INTO loan_schedule
         (loan_id, seq, ym, due_date, business_date, total, principal, interest, balance,
          interest_from, interest_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ym = VALUES(ym), due_date = VALUES(due_date), business_date = VALUES(business_date),
         total = VALUES(total), principal = VALUES(principal), interest = VALUES(interest),
         balance = VALUES(balance), interest_from = VALUES(interest_from),
         interest_to = VALUES(interest_to)`,
      [
        loan.id,
        r.seq,
        r.due.slice(0, 7),
        r.due,
        r.biz,
        r.total,
        r.principal ?? 0,
        r.interest ?? 0,
        r.balance ?? 0,
        r.from,
        r.to,
      ],
    );
    n++;
  }
  console.log(
    `${loanName}: ${n}회차 (${rows[0].due} ~ ${rows[rows.length - 1].due})` +
      ` 최초 잔액 ${rows[0].balance?.toLocaleString('ko-KR')}원`,
  );
}

await conn.end();
