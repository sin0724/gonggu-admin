import { createClient } from "@supabase/supabase-js";

// tianxia-finance(재무관리)의 Supabase — 별도 프로젝트.
// 셀러 입금 확정 시 공구 사업부 실적(gonggu_sales)에 기록하는 용도.
// service role 키는 서버(API 라우트)에서만 사용한다.
export function createFinanceClient() {
  const url = process.env.FINANCE_SUPABASE_URL;
  const key = process.env.FINANCE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
