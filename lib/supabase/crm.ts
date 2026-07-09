import { createClient } from "@supabase/supabase-js";

// tianxia-crm의 Supabase — 별도 프로젝트. KOL 아카이브(kols) 조회 전용.
// service role 키는 서버(API 라우트)에서만 사용한다.
export function createCrmClient() {
  const url = process.env.CRM_SUPABASE_URL;
  const key = process.env.CRM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** tianxia-crm kols 테이블에서 쓰는 필드만 */
export interface CrmKol {
  id: string;
  name: string;
  instagram_handle: string | null;
  followers: number | null;
  categories: string[];
  rate: string | null;
}
