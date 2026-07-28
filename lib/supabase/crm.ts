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

/** KOL 리스트 화면에서 쓰는 확장 필드 (연락처·방문 예정·진행 이력 포함) */
export interface CrmKolDetail extends CrmKol {
  email: string | null;
  visit_note: string | null;
  visit_date: string | null;
  visit_end_date: string | null;
  history: string | null;
  created_at: string;
}

export const CRM_KOL_DETAIL_COLUMNS =
  "id, name, instagram_handle, email, followers, categories, rate, visit_note, visit_date, visit_end_date, history, created_at";

/**
 * KOL 아카이브 전체 조회 — 리스트 화면은 클라이언트에서 검색/필터하므로
 * 한 번에 받아온다. 아카이브 규모가 수천 건을 넘으면 서버 필터로 바꿔야 한다.
 */
export async function fetchCrmKols(limit = 2000): Promise<{
  kols: CrmKolDetail[];
  error: string | null;
}> {
  const crm = createCrmClient();
  if (!crm) {
    return {
      kols: [],
      error:
        "CRM 연동 키(CRM_SUPABASE_URL / CRM_SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.",
    };
  }

  const { data, error } = await crm
    .from("kols")
    .select(CRM_KOL_DETAIL_COLUMNS)
    .order("followers", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return { kols: [], error: error.message };
  return { kols: (data ?? []) as unknown as CrmKolDetail[], error: null };
}
