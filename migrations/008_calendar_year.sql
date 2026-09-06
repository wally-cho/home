-- 동기화 단위를 '해'로 바꾼다.
--
-- 처음에는 보는 달의 앞뒤 한 달만 가져왔다. 월을 넘길 때 빈 화면이 잠깐 보이지 않게
-- 하려던 것인데, 두 가지가 걸렸다.
--
--   1. 생일·기념일은 그 해 전체가 한눈에 보여야 쓸모가 있다
--   2. 네이버는 기간 필터를 무시하고 캘린더 전체를 준다. 어차피 다 받으므로
--      석 달만 남길 이유가 없다
--
-- 그래서 창을 **보는 해와 그다음 해** 두 해로 넓혔다. 한 해만 채우면 12월에 다음 달을
-- 볼 때 비고, 해가 바뀌는 순간 통째로 빈다.
--
-- `synced_year`에는 앞의 해를 적는다. 그 값이 곧 "여기부터 두 해를 채웠다"는 뜻이고,
-- 그 밖을 보면 다시 가져온다. `synced_at`(24시간 규칙)만으로는 해가 바뀐 것을 알 수 없어
-- 옛 해의 일정을 그대로 보여주게 된다.

ALTER TABLE calendar_source
  ADD COLUMN synced_year CHAR(4) NULL AFTER synced_at;

-- 지금 들어 있는 것은 석 달치라 그 해를 다 채운 것이 아니다. 비워서 다시 받게 한다
UPDATE calendar_source SET synced_at = NULL, synced_year = NULL;
DELETE FROM calendar_event;
