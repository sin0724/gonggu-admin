-- 공동구매 인센티브 (사내 보상안: 영업 4% · 관리 6%).
--
-- 인센티브 기준금액 = 회사에 실제 입금된 밴더사 순정산 수수료(VAT 제외) − 공구 건별 직접 실비
--   · 기준금액이 마이너스면 0
--   · 영업 담당 4%, 관리 담당 6% 고정 (같은 사람이 둘 다면 10%)
--   · 지급월 = max(캠페인 종료일, 입금일)이 속한 달의 다음 달 10일
--   · 확정 후 생긴 환불·실비는 이후 명세표에서 조정(차감)
--
-- 급여 정보이므로 정산·실비·명세표는 최종 관리자(is_app_admin())만 다룬다.
-- 직원은 확정된 본인 명세표 줄만 조회할 수 있다.

-- ── 1. 캠페인 담당 지정 ───────────────────────────────────────
-- 관리 담당 = campaigns.manager_id (024). 영업 담당을 캠페인에 명시적으로 둔다.
-- 지금까지는 거래처 담당자로 추정했지만, 인센티브 귀속은 사측이 확정해야 한다.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS sales_manager_id UUID REFERENCES managers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_sales_manager_id ON campaigns(sales_manager_id);
COMMENT ON COLUMN campaigns.sales_manager_id IS '영업 담당자 (인센티브 4%). 관리 담당은 manager_id (6%)';

-- 기존 캠페인: 거래처 담당자를 영업 담당으로 채운다
UPDATE campaigns c
  SET sales_manager_id = p.manager_id
  FROM prospects p
  WHERE c.prospect_id = p.id
    AND c.sales_manager_id IS NULL
    AND p.manager_id IS NOT NULL;

-- 담당 확정(잠금) — 확정 후에는 최종 관리자만 담당자를 바꿀 수 있다
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS assignment_confirmed_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS assignment_confirmed_by TEXT;

-- 유가시딩: 광고주에게 따로 받은 KOL 예산. 공구 인센티브 계산에서 제외(KOL 요율표로 별도 정산)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS paid_seeding_amount BIGINT;
COMMENT ON COLUMN campaigns.paid_seeding_amount IS '유가시딩 — 광고주 수취 KOL 예산(원). 공구 4%/6% 계산에 넣지 않는다';

CREATE OR REPLACE FUNCTION guard_campaign_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 확정 표시 자체를 붙이거나 떼는 것은 최종 관리자만
  IF (NEW.assignment_confirmed_at IS DISTINCT FROM OLD.assignment_confirmed_at)
     AND NOT is_app_admin() THEN
    RAISE EXCEPTION 'ASSIGNMENT_LOCKED: 담당 확정은 최종 관리자만 할 수 있습니다' USING ERRCODE = '42501';
  END IF;
  -- 확정된 캠페인의 담당자 변경은 최종 관리자만
  IF OLD.assignment_confirmed_at IS NOT NULL
     AND (NEW.manager_id IS DISTINCT FROM OLD.manager_id
          OR NEW.sales_manager_id IS DISTINCT FROM OLD.sales_manager_id)
     AND NOT is_app_admin() THEN
    RAISE EXCEPTION 'ASSIGNMENT_LOCKED: 담당이 확정된 캠페인입니다. 최종 관리자에게 변경을 요청하세요' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_campaign_assignment ON campaigns;
CREATE TRIGGER trg_guard_campaign_assignment
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION guard_campaign_assignment();

-- ── 2. 정산·입금 기록 ────────────────────────────────────────
-- 정산서 한 장(또는 입금 한 건)당 한 줄. 사후 환불은 vendor_fee를 음수로 입력한다.
-- 부분입금은 입금된 범위의 수수료만 한 줄로 넣고, 잔여분은 입금 후 새 줄로 넣는다.
-- 인센티브를 받는 사람이 연결된 캠페인을 실수로 지우지 않도록 ON DELETE RESTRICT.
CREATE TABLE IF NOT EXISTS campaign_settlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  -- 정산서 기준일 (참고용)
  statement_date DATE,
  -- 공동구매 주문금액 (참고용)
  order_amount BIGINT,
  -- 취소·환불·반품·차지백·할인 등 조정 합계 (참고용, 양수로 입력)
  adjustment_amount BIGINT,
  adjustment_note TEXT,
  -- 인센티브 기준: 회사 귀속 밴더 순수수료, VAT 제외 (공급가형은 셀러 마진)
  vendor_fee BIGINT NOT NULL,
  -- 실제 입금액·입금일. 입금일이 없으면 미수 → 인센티브 대상 아님
  deposit_amount BIGINT,
  deposited_on DATE,
  memo TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaign_settlements_campaign ON campaign_settlements(campaign_id);

-- ── 3. 직접 실비 ─────────────────────────────────────────────
-- "해당 공구 건이 없었다면 발생하지 않았을 비용"만. 고정비·일반 운영비는 넣지 않는다.
CREATE TABLE IF NOT EXISTS campaign_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN (
    'ads', 'samples', 'shipping', 'free_seeding', 'content', 'outsourcing',
    'shooting', 'promotion', 'live_event', 'travel', 'third_party_fee', 'remittance'
  )),
  -- VAT 제외 금액
  amount BIGINT NOT NULL,
  spent_on DATE,
  description TEXT,
  evidence_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaign_expenses_campaign ON campaign_expenses(campaign_id);

-- ── 4. 확정 명세 ─────────────────────────────────────────────
-- 월별 명세표를 확정하면 줄마다 스냅샷으로 저장한다. 확정 후에는 고치지 않고,
-- 이후 변동은 다음 달 계산에서 "이전 지급분 차감"으로 자동 조정된다.
CREATE TABLE IF NOT EXISTS incentive_payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 지급월 (해당 월 1일). 지급일은 그 달 10일
  pay_month DATE NOT NULL,
  manager_id UUID REFERENCES managers(id) ON DELETE SET NULL,
  -- 퇴사·삭제 후에도 명세가 읽히도록 이름을 박아둔다
  manager_name TEXT NOT NULL,
  manager_email TEXT,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('sales', 'ops')),
  -- 누적 기준
  fee_total BIGINT NOT NULL,
  expense_total BIGINT NOT NULL,
  base_amount BIGINT NOT NULL,
  rate NUMERIC NOT NULL,
  entitled_total BIGINT NOT NULL,
  previously_paid BIGINT NOT NULL,
  -- 이번 달 지급액 (음수 = 차감 조정)
  amount BIGINT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by TEXT,
  paid_at TIMESTAMPTZ,
  UNIQUE (pay_month, campaign_id, role)
);
CREATE INDEX IF NOT EXISTS idx_incentive_payouts_month ON incentive_payouts(pay_month);

-- ── 권한 ────────────────────────────────────────────────────
ALTER TABLE campaign_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentive_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage campaign_settlements" ON campaign_settlements;
CREATE POLICY "Admins manage campaign_settlements"
  ON campaign_settlements FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "Admins manage campaign_expenses" ON campaign_expenses;
CREATE POLICY "Admins manage campaign_expenses"
  ON campaign_expenses FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "Admins manage incentive_payouts" ON incentive_payouts;
CREATE POLICY "Admins manage incentive_payouts"
  ON incentive_payouts FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

-- 직원: 확정된 본인 명세만 조회
DROP POLICY IF EXISTS "Staff read own incentive_payouts" ON incentive_payouts;
CREATE POLICY "Staff read own incentive_payouts"
  ON incentive_payouts FOR SELECT TO authenticated
  USING (lower(manager_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
