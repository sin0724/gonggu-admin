-- 담당자 구분(영업/관리) + 캠페인 담당 배정.
--
-- 지금까지 담당자는 "거래처를 맡는 영업 담당자"만 있었다. 그런데 캠페인을
-- 실제로 굴리는 건 관리 담당자라서, 누가 어떤 캠페인을 맡고 있는지가
-- 어디에도 남지 않았다. 퇴사·인수인계 때 "이 사람이 맡던 캠페인"을 모을
-- 방법이 없었던 것이 문제.
--
--  - managers.role       : sales(영업) / ops(관리)
--  - managers.is_active  : 퇴사자는 지우지 않고 비활성으로 둔다.
--                          지우면 담당 이력이 끊기고 거래처·캠페인 담당이 NULL이 된다.
--  - campaigns.manager_id: 캠페인 관리 담당자. 담당자를 지워도 캠페인은 남아야 하므로
--                          ON DELETE SET NULL.

ALTER TABLE managers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'sales';

ALTER TABLE managers DROP CONSTRAINT IF EXISTS managers_role_check;
ALTER TABLE managers ADD CONSTRAINT managers_role_check
  CHECK (role IN ('sales', 'ops'));

ALTER TABLE managers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN managers.role IS 'sales = 영업 담당자(거래처), ops = 관리 담당자(캠페인 운영)';
COMMENT ON COLUMN managers.is_active IS 'FALSE = 퇴사. 이력 보존을 위해 삭제 대신 비활성 처리';

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES managers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_manager_id ON campaigns(manager_id);

COMMENT ON COLUMN campaigns.manager_id IS '캠페인 관리 담당자. 미배정이면 NULL';

-- 관리 담당자 등록: 임패유 (zoelin0804@gmail.com)
-- 이미 같은 이메일로 등록돼 있으면 관리 담당자로만 바꾼다.
UPDATE managers
  SET role = 'ops', is_active = TRUE
  WHERE lower(email) = 'zoelin0804@gmail.com';

INSERT INTO managers (name, email, role)
SELECT '임패유', 'zoelin0804@gmail.com', 'ops'
WHERE NOT EXISTS (
  SELECT 1 FROM managers WHERE lower(email) = 'zoelin0804@gmail.com'
);

-- ─────────────────────────────────────────────────────────────
-- 최종 관리자(어드민) — 담당자 명단을 바꿀 수 있는 사람.
--
-- 담당자 추가·수정·퇴사·삭제는 인수인계와 직결되므로 아무나 하면 안 된다.
-- 화면에서 버튼을 숨기는 것만으로는 브라우저에서 직접 API를 부르면 뚫리므로
-- managers 테이블 쓰기 권한 자체를 DB(RLS)에서 어드민으로 제한한다.
-- 캠페인 담당 배정(campaigns.manager_id)은 실무자도 해야 하므로 막지 않는다.

CREATE TABLE IF NOT EXISTS app_admins (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_admins (email) VALUES ('hyuun0724@gmail.com')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
-- 어드민 명단은 화면에서 보지도 고치지도 않는다 (SQL 에디터에서만 관리).
-- 정책이 없으면 RLS 기본 거부. 판정은 아래 SECURITY DEFINER 함수로만 한다.

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_admins
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

GRANT EXECUTE ON FUNCTION is_app_admin() TO authenticated;

-- managers 정책 재정의: 조회는 로그인 사용자 전원, 쓰기는 어드민만.
-- 기존 정책 이름을 알 수 없어(테이블이 마이그레이션 밖에서 만들어짐) 전부 지우고 새로 만든다.
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'managers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON managers', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can select managers"
  ON managers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert managers"
  ON managers FOR INSERT TO authenticated WITH CHECK (is_app_admin());
CREATE POLICY "Admins can update managers"
  ON managers FOR UPDATE TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "Admins can delete managers"
  ON managers FOR DELETE TO authenticated USING (is_app_admin());
