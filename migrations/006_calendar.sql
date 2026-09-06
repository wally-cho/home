-- 일정 영역. 부부 각자의 캘린더를 끌어와 한 곳에서 본다.
--
-- **조회만 한다.** 여기서 만들거나 고치지 않는다. 원본은 각자의 구글·네이버에 있고
-- 이 두 테이블은 그것을 비추는 거울일 뿐이다. 그래서 소프트 삭제도 updated_at도 없다 -
-- 다시 가져올 때 그 기간을 통째로 갈아끼운다.

-- 어디서 끌어오는가. 사람마다 한 줄이다.
CREATE TABLE calendar_source (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  book_id     INT UNSIGNED NOT NULL DEFAULT 1,
  owner       VARCHAR(12)  NOT NULL,      -- 화면에 뜨는 이름
  provider    ENUM('google','naver') NOT NULL,
  -- 무엇에 붙었는지 보여주는 용도. 계정을 잘못 연결했을 때 이것으로 안다
  account     VARCHAR(190) NULL,
  -- 구글은 refresh token, 네이버는 CalDAV 자격. 앱 밖으로 나가지 않는다.
  -- 연결을 끊으면 NULL로 지운다
  credential  TEXT         NULL,
  -- 사람을 색으로 구분한다. 격자의 점 색이다.
  -- 연두·빨강은 조작과 지출이 이미 쓰고 있어 여기서는 안 쓴다
  color       CHAR(7)      NOT NULL DEFAULT '#8b95a1',
  -- 마지막으로 가져온 시각. 화면을 열 때 24시간이 지났으면 다시 가져온다.
  -- 배치를 만들지 않기로 했으므로 이 값 하나가 '하루 한 번'을 만든다
  synced_at   DATETIME     NULL,
  -- 실패하면 화면에 그대로 보여준다. 조용히 옛 일정을 보여주는 것보다 낫다
  sync_error  VARCHAR(200) NULL,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  archived_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_source (book_id, owner, provider),
  KEY idx_source_list (book_id, archived_at, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 가져온 일정.
CREATE TABLE calendar_event (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id  INT UNSIGNED    NOT NULL,
  -- 제공자가 준 이벤트 id. 같은 것이 다시 오면 덮어쓴다
  uid        VARCHAR(190)    NOT NULL,
  title      VARCHAR(120)    NOT NULL,
  -- 격자에 놓는 키. DATE는 문자열로 읽는다(lib/db.ts의 dateStrings)
  starts_on  DATE            NOT NULL,
  -- 여러 날에 걸친 일정이 있다. 하루짜리면 starts_on과 같다.
  -- 구글의 종일 일정은 끝 날짜가 하루 뒤로 오므로 넣을 때 하루를 뺀다
  ends_on    DATE            NOT NULL,
  -- 종일 일정이면 NULL이다. 별도 플래그를 두지 않는다 -
  -- 값 하나로 끝나는 표현이 정렬에 편하고 두 곳이 어긋날 일이 없다
  starts_at  TIME            NULL,
  ends_at    TIME            NULL,
  location   VARCHAR(120)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_event (source_id, uid),
  -- 그 달에 걸치는 일정을 찾는다. 시작일로 범위를 훑고 끝일로 거른다
  KEY idx_event_range (source_id, starts_on, ends_on),
  CONSTRAINT fk_event_source FOREIGN KEY (source_id)
    REFERENCES calendar_source (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 반복 일정을 우리가 풀지 않는다. 구글에 singleEvents=true 로 물으면 이미 펼쳐서 준다.
-- RRULE을 직접 해석하면 예외 규칙(그 주만 옮김, 그 회만 취소)에서 원본과 어긋나고,
-- 그 차이를 설명할 방법이 없다. 상환표를 계산하지 않는 것과 같은 이유다.
