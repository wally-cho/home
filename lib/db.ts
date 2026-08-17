import mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// ORM 없음. 쿼리는 직접 쓰고, 행 타입은 lib/types.ts 한 곳에서 관리한다.

export type SqlParam = string | number | boolean | Date | null;

declare global {
  // 개발 중 HMR로 모듈이 다시 평가돼도 풀이 새로 생기지 않게 한다
  var __walletPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL이 없습니다. .env.local을 확인하고, SSH 터널이 열려 있는지 보세요:\n' +
        '  npm run tunnel',
    );
  }

  return mysql.createPool({
    uri: url,
    connectionLimit: 5,
    waitForConnections: true,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: false,
    // DATE는 문자열로 받는다. Date로 변환되면 timezone:'Z' 때문에 UTC 자정이 되고,
    // 어디선가 로컬로 포맷할 때 날짜가 하루 밀린다. occurred_on은 끝까지 문자열이다.
    dateStrings: ['DATE'],
    charset: 'utf8mb4_0900_ai_ci',
  });
}

function withUtcSession(p: mysql.Pool): mysql.Pool {
  // RDS 서버 타임존이 Asia/Seoul이라 NOW()가 KST를 준다.
  // 세션 타임존도 UTC로 맞춰야 CURRENT_TIMESTAMP 기본값과 읽기가 9시간 어긋나지 않는다.
  p.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return p;
}

/**
 * 풀은 첫 쿼리 때 만든다.
 *
 * 모듈 로드 시점에 만들면 `next build`가 라우트 설정을 수집하면서 이 파일을 평가할 때
 * DATABASE_URL이 없어 빌드가 깨진다. CI와 Docker 빌드에는 그 값이 없고, 있을 이유도 없다.
 */
export function getPool(): mysql.Pool {
  if (!global.__walletPool) {
    global.__walletPool = withUtcSession(createPool());
  }
  return global.__walletPool;
}

/** SELECT 전용. 호출부에서 행 타입을 명시한다 */
export async function query<T>(sql: string, params?: SqlParam[]): Promise<T[]> {
  const [rows] = await getPool().execute<RowDataPacket[]>(sql, params);
  return rows as T[];
}

/** 한 행만 기대할 때. 없으면 null */
export async function queryOne<T>(sql: string, params?: SqlParam[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT / UPDATE / DELETE */
export async function execute(sql: string, params?: SqlParam[]): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

/** 부부가 같은 가계부를 본다. 사용자별로 쪼개지 않는다 */
export const BOOK_ID = 1;
