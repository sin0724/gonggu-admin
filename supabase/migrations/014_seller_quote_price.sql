-- 공급가형 프로세스 개선: 브랜드가 우리에게 공급가를 주고,
-- 우리가 마진을 붙여 대만 총판/셀러에게 견적가로 공급한다.
-- 벤더사 마진 = 셀러 견적가 − 공급가 − KOL RS.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS seller_quote_price NUMERIC;

COMMENT ON COLUMN campaigns.seller_quote_price IS '공급가형: 대만 총판/셀러에게 견적(공급)한 개당 단가(원). NULL이면 공구가에 직접 판매하는 것으로 간주';
