-- 2026-08-17 엑셀 시트를 그대로 옮긴 초기 데이터.
-- 빈 화면에서 항목 스무 개를 손으로 만드는 것부터 시작하면 안 쓰게 된다.
--
-- 검산: 지출 127 + 71.42 + 124 + 2 + 30 + 40 + 40 + 80 = 514.42만
--       잔액 500 − 514.42 = -14.42만
-- 이 두 숫자가 화면에 나오는지로 계획 계산을 검증한다.

INSERT INTO method (name, sort_order) VALUES
  ('신한 신용', 10), ('현금', 20), ('국민', 30), ('기업', 40), ('수협', 50);

-- 대출. 상환표는 scripts/import-loans.mjs 가 넣는다.
-- 신용대출은 만기일시상환이라 상환표가 없다 - 월 이자와 원금을 직접 둔다.
INSERT INTO loan (name, note, monthly, balance, sort_order) VALUES
  ('신용대출', '만기일시상환 · 매월 이자만', 120000, 30000000, 10),
  ('아낌e보금자리론', NULL, NULL, NULL, 20),
  ('내집마련디딤돌', NULL, NULL, NULL, 30);

-- ── 계획 그룹 ────────────────────────────────────────────────
INSERT INTO plan_group (kind, name, method_id, is_variable, rail, sort_order) VALUES
  ('income',  '월급',        NULL,                                         0, 'income', 10),
  ('expense', '원리금',      NULL,                                         0, 'debt',   20),
  ('expense', '생활비 고정', (SELECT id FROM method WHERE name='신한 신용'), 0, 'fixed',  30),
  ('expense', '현금',        (SELECT id FROM method WHERE name='현금'),      0, 'cash',   40),
  ('expense', '주택청약',    NULL,                                         0, 'save',   50),
  ('expense', '여행적금',    (SELECT id FROM method WHERE name='국민'),      0, 'save',   60),
  ('expense', '경조사비',    (SELECT id FROM method WHERE name='기업'),      0, 'save',   70),
  ('expense', '용돈',        (SELECT id FROM method WHERE name='현금'),      0, 'allow',  80),
  ('expense', '생활비 유동', (SELECT id FROM method WHERE name='수협'),      1, 'var',    90);

-- ── 세부항목 ─────────────────────────────────────────────────
-- 이름이 NULL인 항목은 그룹 줄 하나로 그려진다(주택청약 같은 것)
INSERT INTO plan_item (group_id, name, amount, pay_day, loan_id, accrues, start_ym, memo, sort_order) VALUES
  ((SELECT id FROM plan_group WHERE name='월급'), NULL, 5000000, NULL, NULL, 0, NULL, NULL, 10),

  ((SELECT id FROM plan_group WHERE name='원리금'), '신용대출이자',    120000, 12,
     (SELECT id FROM loan WHERE name='신용대출'), 0, NULL, '3,000만 · 이자만', 10),
  ((SELECT id FROM plan_group WHERE name='원리금'), '아낌e보금자리론', 370000,  8,
     (SELECT id FROM loan WHERE name='아낌e보금자리론'), 0, NULL, NULL, 20),
  ((SELECT id FROM plan_group WHERE name='원리금'), '내집마련디딤돌',  780000,  8,
     (SELECT id FROM loan WHERE name='내집마련디딤돌'), 0, NULL, NULL, 30),

  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '운전자보험',  20100, 11, NULL, 0, NULL, NULL, 10),
  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '핸드폰',      56000, 11, NULL, 0, NULL, '폰, 유튜브', 20),
  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '넷플릭스',    27000, 29, NULL, 0, NULL, NULL, 30),
  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '인터넷',      44000, 21, NULL, 0, NULL, NULL, 40),
  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '공과금',     400000, 25, NULL, 0, NULL, NULL, 50),
  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '건강보험',   129100, 11, NULL, 0, NULL, NULL, 60),
  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '지피티',      30000, 17, NULL, 0, NULL, NULL, 70),
  ((SELECT id FROM plan_group WHERE name='생활비 고정'), '쿠팡',         8000, 22, NULL, 0, NULL, NULL, 80),

  ((SELECT id FROM plan_group WHERE name='현금'), '가족여행',      200000, 6, NULL, 0, NULL, NULL, 10),
  ((SELECT id FROM plan_group WHERE name='현금'), '사이드프로젝트', 40000, 1, NULL, 0, NULL, NULL, 20),
  -- 적립형: 시작월부터 이번 달까지 자동 합산해 "지금까지 300만"을 보여준다
  ((SELECT id FROM plan_group WHERE name='현금'), '대출상환',     1000000, 6, NULL, 1, '2026-06', NULL, 30),

  ((SELECT id FROM plan_group WHERE name='주택청약'), NULL,  20000, 6, NULL, 0, NULL, NULL, 10),
  ((SELECT id FROM plan_group WHERE name='여행적금'), NULL, 300000, 6, NULL, 0, NULL, NULL, 10),
  ((SELECT id FROM plan_group WHERE name='경조사비'), NULL, 400000, 6, NULL, 0, NULL, NULL, 10),

  ((SELECT id FROM plan_group WHERE name='용돈'), '굼니', 400000, NULL, NULL, 0, NULL, NULL, 10),
  -- 0원 항목을 허용한다. 자리를 남겨두는 용도다
  ((SELECT id FROM plan_group WHERE name='용돈'), '헤니',      0, NULL, NULL, 0, NULL, NULL, 20),

  ((SELECT id FROM plan_group WHERE name='생활비 유동'), NULL, 800000, NULL, NULL, 0, NULL, NULL, 10);

-- ── 생활비 카테고리 ──────────────────────────────────────────
-- 처음 쓰는 사람이 카테고리부터 만들어야 하면 그 자리에서 이탈한다
INSERT INTO category (name, sort_order, is_fallback) VALUES
  ('식비', 10, 0), ('카페·간식', 20, 0), ('교통', 30, 0), ('생활용품', 40, 0),
  ('의료·건강', 50, 0), ('문화·여가', 60, 0), ('의류·미용', 70, 0), ('경조사', 80, 0),
  ('기타', 999, 1);
