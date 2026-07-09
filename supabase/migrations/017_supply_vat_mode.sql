-- 공급가 과세 구분:
--   'taxed' — 부가세 포함 10% (국내 일반 매입. 매입세액공제로 실질 원가 = 공급가 ÷ 1.1)
--   'zero'  — 영세율 0% (브랜드가 구매확인서로 영세 공급하는 경우. 공급가 = 실질 원가)
-- 셀러 견적가(우리 → 대만 셀러 수출)는 항상 영세율 0%이므로 별도 컬럼 없음.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS supply_vat_mode TEXT DEFAULT 'taxed';

COMMENT ON COLUMN campaigns.supply_vat_mode IS '공급가 과세 구분: taxed = 부가세 포함 10% (실질 원가 = ÷1.1), zero = 영세율 0% (구매확인서)';
