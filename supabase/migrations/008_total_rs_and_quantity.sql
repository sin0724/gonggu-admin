-- 클라이언트 승인 총 RS(%) + 판매 수량 추적
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS total_rs_rate NUMERIC;

ALTER TABLE campaign_influencers
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0;

COMMENT ON COLUMN campaigns.total_rs_rate IS '클라이언트가 승인한 총 RS(%). 인플루언서 RS + 벤더 수수료의 상한';
COMMENT ON COLUMN campaign_influencers.quantity IS '판매 수량 (개)';
