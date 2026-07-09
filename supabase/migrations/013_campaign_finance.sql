-- 재무관리 시스템(tianxia-finance)에서 동기화되는 확정 취급액.
-- 취급액만 저장한다 — 벤더 수수료·마진은 재무 시스템에만 존재하며 이 DB로 전송되지 않는다.
-- 쓰기는 재무 시스템의 service role 키로만 수행 (authenticated 쓰기 정책 없음).

CREATE TABLE IF NOT EXISTS campaign_finance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  confirmed_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_campaign_finance_campaign_id
  ON campaign_finance(campaign_id);

COMMENT ON TABLE campaign_finance IS '재무관리 시스템에서 확정한 월별 취급액 (읽기 전용 동기화 데이터)';
COMMENT ON COLUMN campaign_finance.confirmed_sales IS '재무 확정 취급액(원). 마진·수수료 정보는 포함하지 않음';

ALTER TABLE campaign_finance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select campaign_finance"
  ON campaign_finance FOR SELECT
  TO authenticated
  USING (true);
