-- 캠페인 진행 단계 세분화.
-- 기존에는 start_date/end_date로만 "예정/진행중/종료"를 추론했는데,
-- 실제 운영은 계약 전(가망) → 셋업 → KOL 모집 → 공구 오픈 → 정산 순으로 흐른다.
-- 날짜가 없어도 단계를 관리할 수 있도록 명시적 컬럼으로 승격한다.
--
--   lead       가망   — 제안/협의 중, 계약 전
--   setup      셋업   — 확정, 가격·물량·소재 준비
--   recruiting 모집중 — KOL/셀러 섭외 및 제품 발송
--   live       진행중 — 공구 오픈, 판매 중
--   settling   정산중 — 판매 종료, KOL 정산·입금 처리 중
--   done       종료   — 정산까지 완료
--   dropped    보류   — 드랍/무산

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'status'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN status TEXT NOT NULL DEFAULT 'lead';

    -- 기존 캠페인은 날짜 기준으로 한 번만 백필한다 (재실행 시 덮어쓰지 않음)
    UPDATE campaigns
    SET status = CASE
      WHEN end_date IS NOT NULL AND end_date < CURRENT_DATE THEN 'done'
      WHEN start_date IS NOT NULL AND start_date > CURRENT_DATE THEN 'setup'
      ELSE 'live'
    END;
  END IF;
END $$;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('lead', 'setup', 'recruiting', 'live', 'settling', 'done', 'dropped'));

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

COMMENT ON COLUMN campaigns.status IS '진행 단계: lead 가망 / setup 셋업 / recruiting 모집중 / live 진행중 / settling 정산중 / done 종료 / dropped 보류';
