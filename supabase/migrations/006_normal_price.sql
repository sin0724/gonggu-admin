-- 캠페인에 정상가 추가 (공구가 대비 할인율 확인용)
ALTER TABLE campaigns
  ADD COLUMN normal_price NUMERIC;
