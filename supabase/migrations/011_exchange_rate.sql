-- 환율: 캠페인 금액은 원화(KRW)로 입력·저장하되, 메인 표기는 대만달러(TWD).
-- exchange_rate = 1 TWD 당 원화(KRW). 예: 43.5 → 30,000원 = NT$690.
-- TWD 환산 = 원화 ÷ exchange_rate. 미입력(NULL) 캠페인은 원화로 표기.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC;

COMMENT ON COLUMN campaigns.exchange_rate IS '환율 — 1 TWD 당 원화(KRW). TWD 환산 = 원화 ÷ exchange_rate. NULL이면 원화로만 표기.';
