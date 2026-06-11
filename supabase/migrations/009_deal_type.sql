-- 딜 방식: RS형(수수료 % 합의) / 공급가형(개당 단가 합의)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS deal_type TEXT DEFAULT 'rs';

-- 기존에 공급가가 입력된 캠페인은 공급가형으로 분류
UPDATE campaigns
SET deal_type = 'supply'
WHERE supply_price IS NOT NULL AND supply_price > 0;

COMMENT ON COLUMN campaigns.deal_type IS '딜 방식: rs = 총 RS% 합의 (공급가는 파생값), supply = 공급가(원) 합의 (RS 재원은 파생값)';
