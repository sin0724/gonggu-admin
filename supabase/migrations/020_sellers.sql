-- 셀러 마스터 — 대만 총판/공구 셀러/공동구매 업체의 상시 명단.
-- campaign_sellers는 "이번 캠페인에 이 셀러가 몇 개를 얼마에 가져갔나"(거래),
-- 이 테이블은 "이 셀러는 누구고 조건이 어떻게 되나"(마스터)를 담는다.
--   fixed_fee — 고정비(원). 캠페인당 무조건 지급하는 금액.
--   rs_rate   — RS 요율(%). 판매액 대비 셀러 몫.
--   categories — 이 셀러가 주로 돌리는 공구 카테고리.

CREATE TABLE IF NOT EXISTS sellers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  -- 판매 채널: 쇼피 / 라인 / 인스타 / 자사몰 등
  channel TEXT,
  channel_url TEXT,
  region TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  fixed_fee NUMERIC,
  rs_rate NUMERIC,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sellers_name ON sellers(name);
CREATE INDEX IF NOT EXISTS idx_sellers_categories ON sellers USING GIN (categories);

-- 셀러의 과거 공구 실적 — 우리 시스템 밖에서 진행한 건도 직접 기입할 수 있게
-- campaign_id는 선택(연결 시 캠페인명 대신 링크로 표시).
CREATE TABLE IF NOT EXISTS seller_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  sale_date DATE,
  -- 매출액(원)
  amount NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_sales_seller_id ON seller_sales(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_sales_sale_date ON seller_sales(sale_date);

ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select sellers" ON sellers;
CREATE POLICY "Authenticated users can select sellers"
  ON sellers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert sellers" ON sellers;
CREATE POLICY "Authenticated users can insert sellers"
  ON sellers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update sellers" ON sellers;
CREATE POLICY "Authenticated users can update sellers"
  ON sellers FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete sellers" ON sellers;
CREATE POLICY "Authenticated users can delete sellers"
  ON sellers FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can select seller_sales" ON seller_sales;
CREATE POLICY "Authenticated users can select seller_sales"
  ON seller_sales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert seller_sales" ON seller_sales;
CREATE POLICY "Authenticated users can insert seller_sales"
  ON seller_sales FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update seller_sales" ON seller_sales;
CREATE POLICY "Authenticated users can update seller_sales"
  ON seller_sales FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete seller_sales" ON seller_sales;
CREATE POLICY "Authenticated users can delete seller_sales"
  ON seller_sales FOR DELETE TO authenticated USING (true);

-- 캠페인 셀러 → 셀러 마스터 연결 (선택). 마스터에서 실적을 역집계할 때 쓴다.
ALTER TABLE campaign_sellers ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_sellers_seller_id ON campaign_sellers(seller_id);
