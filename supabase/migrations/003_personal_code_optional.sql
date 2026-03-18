-- 개인코드 필수 → 선택 항목으로 변경
ALTER TABLE campaign_influencers
  ALTER COLUMN personal_code DROP NOT NULL;
