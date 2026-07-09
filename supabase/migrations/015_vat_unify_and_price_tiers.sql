-- ① 모든 가격을 부가세 포함 기준으로 통일 (VAT 별도 옵션 폐기)
UPDATE campaigns SET vat_included = true WHERE vat_included IS DISTINCT FROM true;
COMMENT ON COLUMN campaigns.vat_included IS '항상 true — 모든 가격(정상가/최저가/공급가/견적가/공구가)은 부가세 포함 기준으로 통일 (레거시 컬럼)';

-- ② 수량 구간별 단가 — 브랜드 공급가·셀러 견적가 모두
--    "N세트 이상이면 개당 얼마" 식으로 구간별 단가가 다를 수 있다.
--    형식: [{"min_qty": 200, "price": 20500}, {"min_qty": 500, "price": 18500}]
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS supply_price_tiers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seller_quote_tiers JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN campaigns.supply_price_tiers IS '브랜드 공급가 수량 구간: [{min_qty, price}] (부가세 포함, 원). 빈 배열이면 supply_price 단일가';
COMMENT ON COLUMN campaigns.seller_quote_tiers IS '셀러 견적가 수량 구간: [{min_qty, price}] (부가세 포함, 원). 빈 배열이면 seller_quote_price 단일가';
