-- 캠페인 ↔ 가망건 연결.
-- 캠페인은 새로 만들기도 하지만 가망건 관리에 있는 업체가 캠페인으로 넘어오는
-- 경우가 많다. 상호명만 베껴 적으면 어느 가망건이 실제 매출로 이어졌는지
-- 추적할 수 없어서 출처를 남긴다.
--
-- 가망건을 지워도 캠페인은 남아야 하므로 ON DELETE SET NULL.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_prospect_id ON campaigns(prospect_id);

COMMENT ON COLUMN campaigns.prospect_id IS '이 캠페인이 시작된 가망건. 직접 등록한 캠페인은 NULL';
