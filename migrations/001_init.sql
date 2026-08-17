-- wallet 초기 스키마.
--
-- 일곱 테이블. 축 세 개가 나눠 쓴다 - 월 계획 / 생활비 기록 / 대출.
-- 모든 테이블에 book_id를 두고 전부 1이다. 부부가 같은 가계부를 보는 것이
-- 요구사항이라 사용자별로 쪼개지 않지만, 나중에 쪼개고 싶어지면 값만 채우면 된다.
--
-- 금액은 전부 원 단위 정수(BIGINT)다. 계획 화면만 만원으로 표시한다.
-- FK 때문에 생성 순서가 정해져 있다: method → loan → plan_group → plan_item
--                                  → plan_override → category → entry

-- ── 지급 수단 ────────────────────────────────────────────────
CREATE TABLE method (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id    INT UNSIGNED NOT NULL DEFAULT 1,
  name       VARCHAR(12)  NOT NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_method (book_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 대출 ─────────────────────────────────────────────────────
-- 상환표가 없는 대출도 있다(신용대출: 만기일시상환, 매월 이자만).
-- 그 경우 monthly에 월 이자를, balance에 원금을 직접 넣는다.
CREATE TABLE loan (
  id         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  book_id    INT UNSIGNED    NOT NULL DEFAULT 1,
  name       VARCHAR(20)     NOT NULL,
  note       VARCHAR(60)     NULL,
  monthly    BIGINT UNSIGNED NULL,     -- 상환표가 없을 때의 월 납입액
  balance    BIGINT UNSIGNED NULL,     -- 상환표가 없을 때의 남은 원금
  sort_order SMALLINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_loan (book_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 은행이 준 상환표를 그대로 넣는다. 앱이 원리금을 계산하지 않는다.
-- PK는 회차(은행 표에서 유일한 값), 계획 조회는 ym으로 한다.
-- ym에 UNIQUE를 걸어두면 월 2회 상환 상품이 들어올 때 조용히 틀린 값을
-- 제안하는 대신 여기서 먼저 깨진다.
CREATE TABLE loan_schedule (
  loan_id       INT UNSIGNED     NOT NULL,
  seq           SMALLINT UNSIGNED NOT NULL,  -- 회차
  ym            CHAR(7)          NOT NULL,   -- 상환예정일자에서 뽑는다
  due_date      DATE             NOT NULL,   -- 상환예정일자
  business_date DATE             NULL,       -- 영업일자 (주말이면 밀린다)
  total         BIGINT UNSIGNED  NOT NULL,   -- 원리금
  principal     BIGINT UNSIGNED  NOT NULL,   -- 원금
  interest      BIGINT UNSIGNED  NOT NULL,   -- 이자
  balance       BIGINT UNSIGNED  NOT NULL,   -- 상환후 예정잔액
  interest_from DATE             NULL,       -- 구간별 이자계산 시작일자
  interest_to   DATE             NULL,       -- 종료일자
  PRIMARY KEY (loan_id, seq),
  UNIQUE KEY uk_sched_ym (loan_id, ym),
  CONSTRAINT fk_sched_loan FOREIGN KEY (loan_id) REFERENCES loan (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 월 계획 ──────────────────────────────────────────────────
CREATE TABLE plan_group (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id     INT UNSIGNED NOT NULL DEFAULT 1,
  kind        ENUM('income','expense') NOT NULL,
  name        VARCHAR(12)  NOT NULL,
  method_id   INT UNSIGNED NULL,
  is_variable TINYINT(1)   NOT NULL DEFAULT 0,  -- 유동 생활비. 일 기록의 예산이 된다
  rail        VARCHAR(10)  NOT NULL DEFAULT 'save', -- 목록에서 쓰는 색 이름
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  archived_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_group_list (book_id, archived_at, sort_order),
  CONSTRAINT fk_group_method FOREIGN KEY (method_id) REFERENCES method (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 반복되는 계획의 '정의'다. 월별 인스턴스를 만들지 않는다.
-- 특정 달의 계획 = start_ym ≤ ym ≤ end_ym 인 항목 + 그 달 override
CREATE TABLE plan_item (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id     INT UNSIGNED NOT NULL DEFAULT 1,
  group_id    INT UNSIGNED NOT NULL,
  name        VARCHAR(12)  NULL,       -- 세부항목이 없는 그룹은 NULL
  amount      BIGINT       NOT NULL,   -- 원 단위. 0을 허용한다(자리만 남긴 항목)
  method_id   INT UNSIGNED NULL,       -- 그룹 값을 덮어쓰는 예외
  pay_day     TINYINT UNSIGNED NULL,   -- 1~31, 32 = 말일
  start_ym    CHAR(7)      NULL,
  end_ym      CHAR(7)      NULL,
  loan_id     INT UNSIGNED NULL,       -- 상환표 값을 제안할 대출
  accrues     TINYINT(1)   NOT NULL DEFAULT 0, -- 적립형. 시작월부터 누적액을 보여준다
  memo        VARCHAR(40)  NULL,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  archived_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_item_group (book_id, group_id, archived_at, sort_order),
  CONSTRAINT fk_item_group  FOREIGN KEY (group_id)  REFERENCES plan_group (id),
  CONSTRAINT fk_item_method FOREIGN KEY (method_id) REFERENCES method (id),
  CONSTRAINT fk_item_loan   FOREIGN KEY (loan_id)   REFERENCES loan (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 그 달만의 수정. 없으면 plan_item 값을 그대로 쓴다
CREATE TABLE plan_override (
  item_id INT UNSIGNED NOT NULL,
  ym      CHAR(7)      NOT NULL,
  amount  BIGINT       NULL,
  skipped TINYINT(1)   NOT NULL DEFAULT 0,
  memo    VARCHAR(40)  NULL,
  PRIMARY KEY (item_id, ym),
  CONSTRAINT fk_ovr_item FOREIGN KEY (item_id) REFERENCES plan_item (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 생활비 기록 ──────────────────────────────────────────────
-- kind가 없다. 유동 생활비 기록은 전부 지출이다. 수입은 계획의 몫이다.
CREATE TABLE category (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id     INT UNSIGNED NOT NULL DEFAULT 1,
  name        VARCHAR(10)  NOT NULL,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  is_fallback TINYINT(1)   NOT NULL DEFAULT 0,  -- '기타'. 숨길 수 없다
  hidden_at   DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_category (book_id, name),
  KEY idx_category_list (book_id, hidden_at, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- occurred_on은 DATE다. 시각을 넣지 않는다 - "8월 17일의 지출"은 달력 개념이고
-- 타임존이 끼면 자정 근처 기록이 다른 날로 밀린다.
-- 인덱스에서 deleted_at이 가운데 있는 것은 의도다. 모든 조회가 IS NULL을
-- 항등 조건처럼 달고 있어 앞쪽에 와야 범위 조건인 occurred_on이 인덱스를 탄다.
CREATE TABLE entry (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id     INT UNSIGNED    NOT NULL DEFAULT 1,
  category_id INT UNSIGNED    NOT NULL,
  amount      BIGINT UNSIGNED NOT NULL,
  occurred_on DATE            NOT NULL,
  memo        VARCHAR(40)     NULL,
  created_by  VARCHAR(32)     NULL,   -- 카카오 사용자 ID. 누가 넣었는지
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME        NULL,
  PRIMARY KEY (id),
  KEY idx_entry_month    (book_id, deleted_at, occurred_on, id),
  KEY idx_entry_category (book_id, category_id, deleted_at, occurred_on),
  CONSTRAINT fk_entry_category FOREIGN KEY (category_id) REFERENCES category (id),
  CONSTRAINT ck_entry_amount CHECK (amount > 0 AND amount <= 99999999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
