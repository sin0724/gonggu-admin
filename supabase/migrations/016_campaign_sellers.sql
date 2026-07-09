-- 캠페인별 셀러 등록 — 대만 총판/개별 셀러/공동구매 업체를 "셀러"로 통일.
-- 셀러가 우리에게 견적 단가로 구매해가서 판매하는 채널.
-- 우리 매출 = 수량 × 견적 단가, 마진 = 수량 × (견적 단가 − 공급가).
CREATE TABLE IF NOT EXISTS campaign_sellers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  -- 구매(공급) 수량 (세트)
  quantity INTEGER DEFAULT 0,
  -- 이 셀러에게 적용한 개당 견적 단가 (부가세 포함, 원).
  -- NULL이면 캠페인의 구간별 견적 단가(seller_quote_tiers → seller_quote_price)를 수량에 맞춰 자동 적용
  quote_price NUMERIC,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sellers_campaign_id
  ON campaign_sellers(campaign_id);

ALTER TABLE campaign_sellers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select campaign_sellers"
  ON campaign_sellers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert campaign_sellers"
  ON campaign_sellers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update campaign_sellers"
  ON campaign_sellers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete campaign_sellers"
  ON campaign_sellers FOR DELETE TO authenticated USING (true);
