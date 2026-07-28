-- 캠페인 일정 — 공동구매는 발송/업로드/오픈/마감 날짜 관리가 핵심이라
-- 캠페인 기간(start_date~end_date) 외에 세부 일정을 별도로 관리한다.
-- 등록한 일정은 /api/calendar/ics 피드로 구글 캘린더에 그대로 노출된다.
--
--   kind: shipping 제품발송 / content 콘텐츠업로드 / open 공구오픈 /
--         close 공구마감 / settlement 정산 / meeting 미팅 / other 기타

CREATE TABLE IF NOT EXISTS campaign_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  -- all_day = TRUE면 start_at/end_at의 시각 부분은 무시하고 날짜만 쓴다
  all_day BOOLEAN NOT NULL DEFAULT TRUE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE campaign_schedules DROP CONSTRAINT IF EXISTS campaign_schedules_kind_check;
ALTER TABLE campaign_schedules ADD CONSTRAINT campaign_schedules_kind_check
  CHECK (kind IN ('shipping', 'content', 'open', 'close', 'settlement', 'meeting', 'other'));

CREATE INDEX IF NOT EXISTS idx_campaign_schedules_campaign_id
  ON campaign_schedules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_schedules_start_at
  ON campaign_schedules(start_at);

ALTER TABLE campaign_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select campaign_schedules" ON campaign_schedules;
CREATE POLICY "Authenticated users can select campaign_schedules"
  ON campaign_schedules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert campaign_schedules" ON campaign_schedules;
CREATE POLICY "Authenticated users can insert campaign_schedules"
  ON campaign_schedules FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update campaign_schedules" ON campaign_schedules;
CREATE POLICY "Authenticated users can update campaign_schedules"
  ON campaign_schedules FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete campaign_schedules" ON campaign_schedules;
CREATE POLICY "Authenticated users can delete campaign_schedules"
  ON campaign_schedules FOR DELETE TO authenticated USING (true);
