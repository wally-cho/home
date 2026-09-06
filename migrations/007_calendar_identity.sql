-- 캘린더 소스의 신원을 이름이 아니라 계정으로 바꾼다.
--
-- 처음에는 `(book_id, owner, provider)`를 UNIQUE로 두고 재연결할 때 그것으로 찾았다.
-- 그런데 `owner`는 화면에 뜨는 **이름**이고 바꿀 수 있는 값이다. 이름을 고친 뒤
-- 같은 계정을 다시 연결하면 옛 줄을 못 찾고 두 줄이 생긴다.
--
-- 신원은 `(provider, account)`다 - 어느 서비스의 어느 계정인가. 이름은 표시일 뿐이다.

ALTER TABLE calendar_source
  DROP INDEX uk_source,
  ADD UNIQUE KEY uk_source_account (book_id, provider, account);

-- 카카오 닉네임이 그대로 들어와 있다. 화면의 필터 칩에 들어갈 길이로 줄인다
UPDATE calendar_source SET owner = '규민' WHERE owner = '조규민';
