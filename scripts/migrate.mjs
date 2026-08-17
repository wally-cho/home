#!/usr/bin/env node
// migrations/*.sql 중 아직 적용 안 된 것을 순서대로 적용한다.
//
//   npm run migrate         적용
//   npm run migrate:status  적용 현황만 보기
//
// SSH 터널이 열려 있어야 한다:
//   ssh -L 13306:tium-mysql.cjw20gkywty8.ap-northeast-2.rds.amazonaws.com:3306 -N tium

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');
const statusOnly = process.argv.includes('--status');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 없습니다. .env.local을 확인하세요.');
  process.exit(1);
}

let conn;
try {
  conn = await mysql.createConnection({
    uri: url,
    multipleStatements: true, // 마이그레이션 파일은 여러 문장이다
    timezone: 'Z',
  });
} catch (e) {
  console.error('DB 접속 실패:', e.message);
  console.error('\nSSH 터널이 열려 있나요?');
  console.error(
    '  ssh -L 13306:tium-mysql.cjw20gkywty8.ap-northeast-2.rds.amazonaws.com:3306 -N tium',
  );
  process.exit(1);
}

await conn.query("SET time_zone = '+00:00'");
await conn.query(`
  CREATE TABLE IF NOT EXISTS schema_migration (
    version    VARCHAR(50) NOT NULL,
    applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
`);

const [applied] = await conn.query('SELECT version FROM schema_migration');
const appliedSet = new Set(applied.map((r) => r.version));

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

const pending = files.filter((f) => !appliedSet.has(f.replace(/\.sql$/, '')));

if (statusOnly) {
  for (const f of files) {
    const v = f.replace(/\.sql$/, '');
    console.log(`${appliedSet.has(v) ? '  적용됨' : '  대기중'}  ${f}`);
  }
  await conn.end();
  process.exit(0);
}

if (pending.length === 0) {
  console.log('적용할 마이그레이션이 없습니다.');
  await conn.end();
  process.exit(0);
}

for (const file of pending) {
  const version = file.replace(/\.sql$/, '');
  const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
  process.stdout.write(`적용 중  ${file} ... `);
  try {
    await conn.query(sql);
    await conn.query(
      'INSERT INTO schema_migration (version) VALUES (?) ON DUPLICATE KEY UPDATE version = version',
      [version],
    );
    console.log('완료');
  } catch (e) {
    console.log('실패');
    console.error(`\n${file} 적용 중 오류:\n  ${e.message}\n`);
    // 이후 마이그레이션은 건드리지 않는다. 고치고 다시 돌리면 이어서 간다.
    await conn.end();
    process.exit(1);
  }
}

const [tables] = await conn.query('SHOW TABLES');
console.log(`\n테이블 ${tables.length}개:`);
console.log(
  tables
    .map((t) => '  ' + Object.values(t)[0])
    .sort()
    .join('\n'),
);

await conn.end();
