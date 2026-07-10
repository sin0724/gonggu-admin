import type { SupabaseClient } from "@supabase/supabase-js";
import { createFinanceClient } from "@/lib/supabase/finance";
import { resolveTierPrice, supplyNetCost, SupplyVatMode } from "@/lib/economics";
import { PriceTier } from "@/types/database";

// 셀러 입금 실적을 재무관리(tianxia-finance)의 공구 사업부 실적(gonggu_sales)에
// 기록/제거하는 단일 소스. 입금 토글·셀러 수정뿐 아니라 캠페인의 가격 조건
// (공급가·과세 구분·구간·견적가)이 바뀔 때도 이 함수로 재기록해야 재무 금액이
// 화면과 어긋나지 않는다.
//
// 마커: memo가 "[seller:<id>]"로 시작하는 행이 이 시스템의 자동 기록이다.
// campaign_id는 비워서 재무팀의 월별 연동 행(캠페인당 월 1건 제한)과 충돌을 피한다.

const FINANCE_KEY_MISSING =
  "재무 연동 키(FINANCE_SUPABASE_URL/SERVICE_ROLE_KEY)가 없어 공구 사업부 실적에는 반영되지 않았습니다.";

export const sellerMarker = (sellerId: string) => `[seller:${sellerId}]`;

/**
 * 셀러 한 명의 재무 기록을 현재 조건으로 다시 씀 (paid=false면 제거만).
 * 반환값이 있으면 경고 메시지 — 호출부가 사용자에게 알린다.
 */
export async function syncSellerFinance(
  supabase: SupabaseClient,
  sellerId: string,
  paid: boolean
): Promise<string | null> {
  const finance = createFinanceClient();
  if (!finance) return FINANCE_KEY_MISSING;

  const { data: seller, error: sellerError } = await supabase
    .from("campaign_sellers")
    .select("*, campaign:campaigns(*)")
    .eq("id", sellerId)
    .single();
  if (sellerError || !seller) return "셀러를 찾을 수 없어 재무 실적을 반영하지 못했습니다.";

  const marker = sellerMarker(sellerId);
  // 재기록에 안전하도록 기존 자동 기록은 항상 먼저 제거 (중복 방지)
  const { error: delError } = await finance
    .from("gonggu_sales")
    .delete()
    .like("memo", `${marker}%`);
  if (delError) return `재무 실적 반영에 실패했습니다: ${delError.message}`;

  if (!paid) return null;

  const campaign = seller.campaign;
  const qty: number = seller.quantity || 0;
  const quoteTiers = (campaign?.seller_quote_tiers ?? []) as PriceTier[];
  const supplyTiers = (campaign?.supply_price_tiers ?? []) as PriceTier[];
  const vatMode: SupplyVatMode =
    campaign?.supply_vat_mode === "zero" ? "zero" : "taxed";
  // 셀러 견적 단가: 개별 단가 우선, 없으면 캠페인 구간 단가 (이 셀러 주문 수량 기준)
  const quote: number =
    seller.quote_price ??
    resolveTierPrice(campaign?.seller_quote_price ?? 0, quoteTiers, qty);

  // 브랜드 공급가 구간은 캠페인 총 발주량(KOL 직접 판매 + 전체 셀러) 기준 —
  // 캠페인 상세 화면의 마진 계산과 동일한 기준을 써야 재무 기록이 어긋나지 않는다.
  let totalQty = qty;
  if (supplyTiers.length > 0) {
    const [{ data: allSellers }, { data: cis }] = await Promise.all([
      supabase
        .from("campaign_sellers")
        .select("quantity")
        .eq("campaign_id", seller.campaign_id),
      supabase
        .from("campaign_influencers")
        .select("quantity, sales_amount")
        .eq("campaign_id", seller.campaign_id),
    ]);
    const sellerQty = (allSellers ?? []).reduce(
      (sum, s) => sum + (s.quantity || 0),
      0
    );
    const kolInput = (cis ?? []).reduce((sum, r) => sum + (r.quantity || 0), 0);
    const gongguPrice = campaign?.gonggu_price ?? 0;
    const kolQty =
      kolInput > 0
        ? kolInput
        : gongguPrice > 0
        ? Math.round(
            (cis ?? []).reduce((sum, r) => sum + (r.sales_amount || 0), 0) /
              gongguPrice
          )
        : 0;
    totalQty = sellerQty + kolQty;
  }
  const supply = resolveTierPrice(campaign?.supply_price ?? 0, supplyTiers, totalQty);
  const grossSales = qty * quote;
  const margin = supply > 0 ? qty * (quote - supplyNetCost(supply, vatMode)) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const [year, month] = (seller.paid_date ?? today).split("-").map(Number);

  const vatLabel = vatMode === "zero" ? "영세율" : "VAT 포함(÷1.1)";
  const { error: insError } = await finance.from("gonggu_sales").insert({
    campaign_id: null,
    campaign_name: `${campaign?.campaign_name ?? "캠페인"} — ${seller.name} 셀러 입금`,
    client_name: campaign?.client_name ?? null,
    year,
    month,
    gross_sales: Math.round(grossSales),
    margin: Math.round(margin),
    memo: `${marker} 공구 어드민 자동 기록 · 수량 ${qty} × 견적 ${Math.round(quote)}원 · 공급가 ${Math.round(supply)}원 ${vatLabel}`,
  });
  if (insError) return `재무 실적 반영에 실패했습니다: ${insError.message}`;
  return null;
}

/**
 * 캠페인의 입금 완료 셀러 전원을 현재 조건으로 재기록.
 * 공급가·과세 구분·구간·견적가 등 가격 조건이 바뀌었을 때 호출한다.
 */
export async function resyncCampaignSellerFinance(
  supabase: SupabaseClient,
  campaignId: string
): Promise<{ synced: number; warnings: string[] }> {
  const { data: paidSellers } = await supabase
    .from("campaign_sellers")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("is_paid", true);

  const warnings: string[] = [];
  for (const s of paidSellers ?? []) {
    const warning = await syncSellerFinance(supabase, s.id, true);
    if (warning) warnings.push(warning);
  }
  return { synced: paidSellers?.length ?? 0, warnings };
}
