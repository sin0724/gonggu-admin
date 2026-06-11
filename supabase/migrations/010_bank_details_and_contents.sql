-- 인플루언서 정산 계좌 정보 (해외 KOL 송금 대비 SWIFT 포함)
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_type TEXT,
  ADD COLUMN IF NOT EXISTS bank_swift_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_email TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_address TEXT;

-- 콘텐츠 다건 지원: [{ "type": "reels", "url": "https://..." }, ...]
ALTER TABLE campaign_influencers
  ADD COLUMN IF NOT EXISTS contents JSONB DEFAULT '[]'::jsonb;

-- 기존 단일 콘텐츠 URL을 contents 배열로 이전
UPDATE campaign_influencers
SET contents = jsonb_build_array(jsonb_build_object('type', 'other', 'url', content_url))
WHERE content_url IS NOT NULL
  AND content_url <> ''
  AND (contents IS NULL OR contents = '[]'::jsonb);

COMMENT ON COLUMN campaign_influencers.contents IS '업로드 콘텐츠 목록: [{type: reels|story|thread|feed|youtube|tiktok|blog|other, url}]';
