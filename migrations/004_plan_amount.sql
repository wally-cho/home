-- 계획 금액에 시점을 준다.
--
-- 그전에는 plan_item.amount 하나가 모든 달의 금액이었다. 8월을 보면서 금액을
-- 고치면 override가 없는 6월·7월 화면까지 조용히 따라 바뀌었다. 고치는 사람이
-- 의도한 적 없는 일이다.
--
-- 금액을 바꾸는 것은 "이 달부터 이렇게 낸다"는 뜻이다. 그래서 변경 시점을
-- 함께 저장한다. 어떤 달의 금액은 그 달 이하에서 가장 최근 변경값이고,
-- 그것도 없으면 plan_item.amount(최초 금액)다.
--
--   plan_amount   그 달부터 적용되는 금액   (인라인 편집과 시트 저장이 여기 쓴다)
--   plan_override 그 달만의 예외           (이 달만 수정 · 이번 달 건너뛰기)
--
-- 둘을 한 테이블에 섞지 않는다. "이 달부터"와 "이 달만"은 다른 뜻이고,
-- 섞으면 조회할 때 어느 쪽 의도였는지 알 수 없다.

CREATE TABLE plan_amount (
  item_id INT UNSIGNED NOT NULL,
  from_ym CHAR(7)      NOT NULL,  -- 이 달부터 적용된다
  amount  BIGINT       NOT NULL,
  PRIMARY KEY (item_id, from_ym),
  CONSTRAINT fk_amount_item FOREIGN KEY (item_id) REFERENCES plan_item (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
