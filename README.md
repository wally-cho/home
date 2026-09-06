# home

부부 둘이 쓰는 사이트. 모바일 웹.

**영역**을 여러 개 담는다. 영역은 상단 왼쪽 스위치로 고르고, 하단 칸은 지금 영역의
화면이 쓴다.

| 영역 | 무엇 | 경로 |
|---|---|---|
| **가계부** | 월 계획 · 생활비 기록 · 대출 상환표 | `/wallet` |
| **일정** | 부부 각자의 캘린더를 끌어와 한 곳에서 본다. 조회만 한다 | `/schedule` |

설정도 영역마다 따로다 - `/wallet/settings`, `/schedule/settings`. 상단 톱니가
지금 영역의 설정을 연다.

## 가계부

세 곳에 흩어져 있던 것을 합친다.

| 축 | 하는 일 | 경로 |
|---|---|---|
| **월 계획** | 항목 → 세부항목 2단. 결제일·지급 수단·기간. 잔액은 계산값 | `/wallet/plan` |
| **생활비 기록** | 달력에 일별 지출. 유동 예산 대비 소진율 | `/wallet/log` |
| **대출 상환표** | 은행이 준 표를 그대로 넣고 계획에 그 달 값을 제안 | `/wallet/loans` |

이번 달 결론은 홈(`/wallet`)에 있다. `/`로 들어오면 마지막으로 본 영역으로 간다.

## 일정

구글 캘린더를 설정에서 연결하면 읽어온다. **읽기만 하고 만들거나 고치지 않는다.**
화면을 열 때 마지막 동기화가 24시간을 넘었으면 그때 가져오고, 새로고침 버튼은 즉시
가져온다. 크론을 따로 두지 않는다.

네이버 캘린더도 설정에서 연결한다. 네이버에는 OAuth가 없어 CalDAV로 붙고,
2단계 인증 안에서 만드는 **앱 비밀번호**를 쓴다 - 캘린더에만 쓰이고 따로 폐기된다.

## 스택

TypeScript · Next.js 16 App Router (`output: 'standalone'`) · Tailwind v4 ·
MySQL(`mysql2` + 직접 쓴 SQL, ORM 없음) · Auth.js v5 카카오.
그래프는 차트 라이브러리 없이 서버에서 SVG로 그린다.

런타임 의존성은 `next`, `react`, `react-dom`, `mysql2`, `next-auth` 다섯 개다.

## 개발

```shell
npm run tunnel        # RDS로 SSH 터널 (13306)
npm run dev           # 3001 포트
npm run migrate       # migrations/*.sql 적용
npm run loans:import  # data/*.csv 상환표 넣기
npm run typecheck && npm run lint && npm run build
```

`.env.local`이 필요하다. 값은 AWS SSM `/home/prod/*`에 있다.

**로컬에서는 DB를 쓰지 않는다.** 개발 DB가 따로 없고 RDS의 같은 `home`
데이터베이스가 곧 서비스 데이터다. 터널은 마이그레이션과 임포트가 필요할 때만 연다.
푸시 전 검증은 `typecheck`·`lint`·`build`와 `docker build`로 한다 - 그 넷은 DB에 붙지 않는다.

## 배포

master에 push하면 GitHub Actions가 이미지를 만들어 EC2에 올린다.
자세한 절차와 삭제 방법은 `infra/`.

## 문서

| 파일 | 무엇 |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | 작업 규칙, 글쓰기 컨벤션, 설계에서 지키는 결정, 데이터 모델 |
| `CLAUDE.local.md` | 인프라 식별자와 실제 금액. 리포가 public이라 커밋하지 않는다 |
