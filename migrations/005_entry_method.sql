-- 기록에 지급 수단을 붙인다.
--
-- 계획에는 수단이 붙어 있었는데(그룹마다 신한 신용·현금·수협) 기록에는 없었다.
-- 그래서 "유동 생활비 80만은 수협에서 나간다"는 계획과 "실제로 신한카드로 썼다"는
-- 기록이 서로 모른 채였다. 옮겨온 원본에도 자산 열이 있었다 -
-- 수협 621 · 신한카드 383 · 현금 86 · 신한은행 9 · 삼성카드 4.
--
-- NULL을 허용한다. 어느 카드로 썼는지 기억나지 않는 기록을 못 넣게 만들 이유가 없다.

ALTER TABLE entry
  ADD COLUMN method_id INT UNSIGNED NULL AFTER category_id,
  ADD CONSTRAINT fk_entry_method FOREIGN KEY (method_id) REFERENCES method (id);

-- 옮겨온 원본에 있던 카드·계좌를 지급 수단으로 넣는다.
-- 계획에 이미 있는 이름(신한 신용 · 현금 · 국민 · 기업 · 수협)과 겹치지 않는 것만 더한다.
INSERT INTO method (book_id, name, sort_order) VALUES
  (1, '신한은행', 60), (1, '삼성카드', 70)
  ON DUPLICATE KEY UPDATE name = name;
