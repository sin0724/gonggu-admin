-- 목표 KPI: 목표 판매액(원). 설정하면 재원 분배(클라이언트/KOL/벤더)를 한눈에 시뮬레이션.
-- 금액은 항상 KRW로 저장 (표기는 환율 기반 TWD 변환).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS target_sales NUMERIC;

COMMENT ON COLUMN campaigns.target_sales IS '목표 판매액(원). 재원 분배 시뮬레이션·목표 달성률 계산용.';
