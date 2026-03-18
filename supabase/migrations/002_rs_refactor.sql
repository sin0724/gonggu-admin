-- RS 필드 개선: 공구가 / 밴더 수수료 / 인플루언서 RS 분리
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS rs,
  ADD COLUMN gonggu_price NUMERIC(12,2),
  ADD COLUMN vendor_fee_rate NUMERIC(5,2),
  ADD COLUMN influencer_rs_rate NUMERIC(5,2);
