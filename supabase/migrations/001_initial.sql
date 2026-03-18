-- 공구 캠페인 관리 시스템 초기 스키마

-- campaigns 테이블
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  rs TEXT,
  start_date DATE,
  end_date DATE,
  purchase_form_url TEXT,
  drive_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- influencers 테이블
CREATE TABLE IF NOT EXISTS influencers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  account_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- campaign_influencers 테이블
CREATE TABLE IF NOT EXISTS campaign_influencers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  personal_code TEXT NOT NULL,
  is_product_sent BOOLEAN DEFAULT FALSE,
  sent_date DATE,
  content_url TEXT,
  is_uploaded BOOLEAN DEFAULT FALSE,
  sales_amount NUMERIC(12,2) DEFAULT 0,
  settlement_method TEXT,
  settlement_amount NUMERIC(12,2) DEFAULT 0,
  is_settled BOOLEAN DEFAULT FALSE,
  settled_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_campaign_influencers_campaign_id
  ON campaign_influencers(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_influencers_influencer_id
  ON campaign_influencers(influencer_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_start_date
  ON campaigns(start_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_end_date
  ON campaigns(end_date);

-- RLS (Row Level Security) 활성화
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_influencers ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자만 모든 작업 허용
CREATE POLICY "Authenticated users can select campaigns"
  ON campaigns FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert campaigns"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update campaigns"
  ON campaigns FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete campaigns"
  ON campaigns FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can select influencers"
  ON influencers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert influencers"
  ON influencers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update influencers"
  ON influencers FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete influencers"
  ON influencers FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can select campaign_influencers"
  ON campaign_influencers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert campaign_influencers"
  ON campaign_influencers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update campaign_influencers"
  ON campaign_influencers FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete campaign_influencers"
  ON campaign_influencers FOR DELETE
  TO authenticated
  USING (true);
