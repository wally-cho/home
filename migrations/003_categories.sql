-- 카테고리를 7개로 줄인다.
--
-- 임포트한 1,103건을 보니 식비 하나가 건수의 56%였다. 비중이 절반인 칸은
-- 카테고리가 아니라 그냥 '지출'이다. 반대로 아래쪽 넷(의료·건강 11건,
-- 경조사 4건, 의류·미용 3건, 주거 9건)은 2년 반 동안 36건뿐인데 입력 격자에서
-- 매번 자리를 차지했다. 하루 평균 2.4건을 넣는 작업이라 탭 하나가 부담이다.
--
-- 메모를 읽으면 이미 갈려 있었다. 그 근거로 다시 담는다(scripts/import-living.mjs).
--   식비 624 → 식비 389 + 카페·간식(커피 144 · 디저트 55 · 편의점 70)
--   생활용품 147 → 장보기(쿠팡·마트 95) + 생활·미용(올리브영·다이소 52)
--   마트·편의점 125 → 장보기 · 카페·간식
--
-- 편의점은 장보기가 아니다. 메모가 '편의점·요거트 / 곤약젤리 / 숙취젤리'라
-- 군것질이다. 그래서 카페·간식으로 보낸다.

-- 새로 필요한 둘
INSERT INTO category (book_id, name, sort_order)
  VALUES (1, '장보기', 30), (1, '생활·미용', 60)
  ON DUPLICATE KEY UPDATE name = name;

-- 입력 격자는 자주 쓰는 순서로 놓인다. 그 순서를 기본값에도 반영한다
UPDATE category SET sort_order = 10  WHERE book_id = 1 AND name = '식비';
UPDATE category SET sort_order = 20  WHERE book_id = 1 AND name = '카페·간식';
UPDATE category SET sort_order = 30  WHERE book_id = 1 AND name = '장보기';
UPDATE category SET sort_order = 40  WHERE book_id = 1 AND name = '교통';
UPDATE category SET sort_order = 50  WHERE book_id = 1 AND name = '문화·여가';
UPDATE category SET sort_order = 60  WHERE book_id = 1 AND name = '생활·미용';
UPDATE category SET sort_order = 999 WHERE book_id = 1 AND name = '기타';

-- 쓰지 않게 된 카테고리를 지운다. 기록이 붙어 있으면 남긴다 -
-- 그 경우 설정 화면에서 숨기면 되고, 지우면 지난 기록의 참조가 끊긴다.
DELETE FROM category
 WHERE book_id = 1
   AND name IN ('생활용품', '마트·편의점', '의료·건강', '의류·미용', '경조사')
   AND is_fallback = 0
   AND NOT EXISTS (SELECT 1 FROM entry e WHERE e.category_id = category.id);
