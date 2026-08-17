# wallet

월 계획과 생활비를 한 곳에서 보는 가계부. 모바일 웹.

세 곳에 흩어져 있던 것을 합친다.

| 축 | 하는 일 |
|---|---|
| **월 계획** | 항목 → 세부항목 2단. 결제일·지급 수단·기간. 잔액은 계산값 |
| **생활비 기록** | 달력에 일별 지출. 유동 예산 대비 소진율 |
| **대출 상환표** | 은행이 준 표를 그대로 넣고 계획에 그 달 값을 제안 |

## 스택

TypeScript · Next.js 16 App Router (`output: 'standalone'`) · Tailwind v4 ·
MySQL(`mysql2` + 직접 쓴 SQL, ORM 없음) · Auth.js v5 카카오.
그래프는 차트 라이브러리 없이 서버에서 SVG로 그린다.

## 개발

```shell
npm run tunnel      # RDS로 SSH 터널 (13306)
npm run dev         # 3001 포트
npm run migrate     # migrations/*.sql 적용
npm run loans:import  # data/*.csv 상환표 넣기
npm run typecheck && npm run lint && npm run build
```

`.env.local`이 필요하다. 값은 AWS SSM `/wallet/prod/*`에 있다.

## 배포

master에 push하면 GitHub Actions가 이미지를 만들어 EC2에 올린다.
자세한 절차와 삭제 방법은 `infra/`.

## 규칙

작업 규칙과 깨뜨리면 안 되는 것은 [AGENTS.md](./AGENTS.md).
