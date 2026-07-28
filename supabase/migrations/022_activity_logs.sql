-- 활동 로그 — 삭제 안전장치.
--
-- 캠페인을 지우면 KOL·셀러·일정까지 캐스케이드로 사라지는데 되돌릴 방법도,
-- 누가 언제 지웠는지 확인할 방법도 없었다. 삭제 직전에 원본을 스냅샷으로
-- 남겨서 "누가 무엇을 지웠고, 그 내용이 무엇이었는지"를 보존한다.
--
-- 로그 자체는 수정·삭제할 수 없어야 감사 기록으로 의미가 있으므로
-- UPDATE/DELETE 정책을 아예 만들지 않는다 (RLS 기본 거부).

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 행위자 — 계정이 지워져도 남도록 이메일을 그대로 박아둔다
  actor_email TEXT,
  actor_id UUID,
  action TEXT NOT NULL DEFAULT 'delete',
  -- 대상 종류: campaign / campaign_influencer / campaign_seller /
  --            campaign_schedule / seller / seller_sale / prospect / manager
  entity_type TEXT NOT NULL,
  entity_id UUID,
  -- 삭제 후에도 사람이 알아볼 이름 (예: 캠페인명, 셀러명)
  entity_label TEXT NOT NULL,
  -- 어디에 속한 것인지 등 부가 설명 (예: "유이앤루이 · 에코픽 공구")
  context TEXT,
  -- 삭제된 행 원본. 복구는 수동이지만 데이터가 사라지지는 않는다
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_action_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_action_check
  CHECK (action IN ('delete', 'create', 'update'));

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type
  ON activity_logs(entity_type);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select activity_logs" ON activity_logs;
CREATE POLICY "Authenticated users can select activity_logs"
  ON activity_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert activity_logs" ON activity_logs;
CREATE POLICY "Authenticated users can insert activity_logs"
  ON activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE / DELETE 정책 없음 — 기록은 고쳐지거나 지워지지 않는다.
DROP POLICY IF EXISTS "Authenticated users can update activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "Authenticated users can delete activity_logs" ON activity_logs;
