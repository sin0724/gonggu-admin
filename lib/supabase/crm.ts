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

/**
 * CRM이 제공하는 KOL 조회 소스.
 * kols.* 전체 + 공구매출 집계·환산 컬럼을 담은 뷰. 없으면 kols로 폴백한다.
 * (CRM 배포와 이 앱 배포 사이 시차에 화면이 죽지 않도록)
 */
const KOL_VIEW = "kols_with_gonggu";
const KOL_TABLE = "kols";

/**
 * KOL 한 명. CRM 스키마 변경에 견디기 위해 컬럼을 나열하지 않고 select("*")로
 * 받는다 — CRM에 컬럼이 추가돼도 깨지지 않고, 삭제돼도 undefined가 될 뿐이다.
 * 그래서 새로 생긴 필드는 전부 optional로 둔다.
 */
export interface CrmKol {
  id: string;
  name: string;
  instagram_handle: string | null;
  followers: number | null;
  categories: string[];
  /** @deprecated 레거시 진행 단가 자유 텍스트. 신규 KOL은 NULL — fee_amount를 쓴다 */
  rate: string | null;
  email?: string | null;
  visit_note?: string | null;
  visit_date?: string | null;
  visit_end_date?: string | null;
  history?: string | null;
  created_at?: string;

  // ── 진행 조건 (2026-07 CRM 추가) ──
  /** 고정비 금액. 통화는 fee_currency */
  fee_amount?: number | null;
  fee_currency?: CrmCurrency | null;
  /** 정렬·비교용 원화 환산 고정비 (CRM 뷰가 계산) */
  fee_amount_krw?: number | null;
  /** 제공 항목. 예: ["릴스 1개", "스토리 5개 이상"] */
  deliverables?: string[] | null;
  /** 제공 항목을 |로 이은 문자열 — 배열은 부분검색이 안 되므로 검색용 */
  deliverables_text?: string | null;
  /** RS 요율(%) */
  rs_rate?: number | null;
  /** 공구 품목 (types/database.ts GONGGU_CATEGORIES와 문자열 일치해야 함) */
  gonggu_categories?: string[] | null;
  /** 레거시 rate 파싱이 애매해 CRM 담당자 확인 대기 중 */
  rate_needs_review?: boolean | null;

  // ── 공구매출 집계 (CRM 뷰 계산) ──
  gonggu_sales_twd?: number | null;
  gonggu_sales_krw?: number | null;
  /** 정렬·비교용 원화 환산 합계 */
  gonggu_sales_krw_total?: number | null;
  gonggu_sales_count?: number | null;
  gonggu_sales_last_date?: string | null;
}

export type CrmCurrency = "TWD" | "KRW";

/** 화면 표기용 — 원문 통화 그대로 보여주는 것이 원칙 */
export function formatCrmMoney(
  amount: number | null | undefined,
  currency: CrmCurrency | null | undefined
): string | null {
  if (amount === null || amount === undefined) return null;
  return currency === "KRW"
    ? `${Math.round(amount).toLocaleString("ko-KR")}원`
    : `NT$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * 백필된 고정비를 그대로 믿어도 되는지 자체 판정.
 *
 * CRM의 rate_needs_review에만 의존하지 않는다. 실제 데이터를 보면 단위 표기가
 * 없는 원문("132", "264")이 전부 "만원"으로 해석됐고 확인 플래그는 꺼져 있었다.
 * 이 숫자는 예산 계산에 바로 들어가므로, 해석이 갈릴 수 있는 원문은 화면에서
 * 눈에 띄게 표시해 사람이 확인하게 만든다. 틀린 값을 조용히 보여주는 것보다 낫다.
 *
 * 판정 대상:
 *  - 단위 표기(만/천/원/NTD/NT$)가 아예 없음        예: "132"
 *  - 범위 표기 — 어느 쪽을 취해야 할지 알 수 없음    예: "66-99"
 *  - 괄호 안 %  — RS일 가능성이 있는데 누락됨        예: "99(10%)"
 *  - 숫자가 여러 개 — 항목별 단가를 하나로 뭉갬      예: "맛집220/뷰티330"
 */
export function needsRateReview(kol: CrmKol): boolean {
  if (kol.rate_needs_review) return true;
  const raw = kol.rate?.trim();
  // 원문이 없으면 새로 입력된 값이므로 신뢰한다
  if (!raw || kol.fee_amount == null) return false;

  if (!/(만|천|원|NTD|NT\$|TWD|KRW|₩|元)/i.test(raw)) return true;
  if (/\d\s*[-~]\s*\d/.test(raw)) return true;
  if (/\(\s*\d+\s*%/.test(raw)) return true;
  if ((raw.match(/\d[\d,]*/g) ?? []).length > 1) return true;
  return false;
}

/** CRM과 어긋나면 정렬·환산이 틀어지므로 값은 CRM DB에서 읽어온다 */
const FALLBACK_TWD_KRW = 44;

/**
 * 통화 혼합 값을 비교·환산할 때 쓰는 환율 (NT$1 당 원).
 * CRM의 twd_to_krw_rate()를 단일 소스로 삼아 상수 드리프트를 막는다.
 */
export async function fetchTwdKrwRate(): Promise<number> {
  const crm = createCrmClient();
  if (!crm) return FALLBACK_TWD_KRW;
  const { data, error } = await crm.rpc("twd_to_krw_rate");
  if (error || typeof data !== "number" || data <= 0) return FALLBACK_TWD_KRW;
  return data;
}

/**
 * KOL 아카이브 전체 조회 — 리스트 화면은 클라이언트에서 검색/필터하므로
 * 한 번에 받아온다. 아카이브 규모가 수천 건을 넘으면 서버 필터로 바꿔야 한다.
 */
export async function fetchCrmKols(limit = 2000): Promise<{
  kols: CrmKol[];
  error: string | null;
  /** 공구매출 집계 뷰를 못 써서 기본 테이블로 폴백했는지 */
  degraded: boolean;
}> {
  const crm = createCrmClient();
  if (!crm) {
    return {
      kols: [],
      degraded: false,
      error:
        "CRM 연동 키(CRM_SUPABASE_URL / CRM_SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.",
    };
  }

  const query = (source: string) =>
    crm
      .from(source)
      .select("*")
      .order("followers", { ascending: false, nullsFirst: false })
      .limit(limit);

  const view = await query(KOL_VIEW);
  if (!view.error) {
    return {
      kols: (view.data ?? []) as unknown as CrmKol[],
      error: null,
      degraded: false,
    };
  }

  // 뷰가 아직 없는 CRM 배포에서도 최소한 목록은 보이게 한다
  const table = await query(KOL_TABLE);
  if (table.error) {
    return { kols: [], error: table.error.message, degraded: false };
  }
  return {
    kols: (table.data ?? []) as unknown as CrmKol[],
    error: null,
    degraded: true,
  };
}

/** CRM KOL 아카이브 총 인원. 대시보드처럼 숫자만 필요한 곳에서 쓴다. */
export async function fetchCrmKolCount(): Promise<number | null> {
  const crm = createCrmClient();
  if (!crm) return null;
  const { count, error } = await crm
    .from(KOL_TABLE)
    .select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

/**
 * KOL 검색 — 캠페인에 인플루언서를 추가할 때 쓴다.
 * 목록 화면과 같은 소스를 봐야 조건(고정비·RS)이 어긋나지 않는다.
 */
export async function searchCrmKols(
  q: string,
  limit = 20
): Promise<{ kols: CrmKol[]; error: string | null }> {
  const crm = createCrmClient();
  if (!crm) {
    return {
      kols: [],
      error:
        "CRM 연동 키(CRM_SUPABASE_URL/SERVICE_ROLE_KEY)가 설정되지 않았습니다.",
    };
  }

  const run = (source: string) => {
    let query = crm
      .from(source)
      .select("*")
      .order("followers", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (q) query = query.or(`name.ilike.%${q}%,instagram_handle.ilike.%${q}%`);
    return query;
  };

  const view = await run(KOL_VIEW);
  if (!view.error) {
    return { kols: (view.data ?? []) as unknown as CrmKol[], error: null };
  }
  const table = await run(KOL_TABLE);
  if (table.error) return { kols: [], error: table.error.message };
  return { kols: (table.data ?? []) as unknown as CrmKol[], error: null };
}
