-- personal_code → purchase_url 컬럼 변경, sheet_url 추가
ALTER TABLE campaign_influencers
  RENAME COLUMN personal_code TO purchase_url;

ALTER TABLE campaign_influencers
  ADD COLUMN sheet_url TEXT;
