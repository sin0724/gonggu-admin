import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createFinanceClient } from "@/lib/supabase/finance";
import {
  resolveTierPrice,
  supplyNetCost,
  SupplyVatMode,
} from "@/lib/economics";
import { PriceTier } from "@/types/database";

// 셀러 입금 완료 토글 — 체크 시 재무관리(tianxia-finance)의
// 공구 사업부 실적(gonggu_sales)에 셀러 공급액·마진을 자동 기록하고,
// 해제 시 해당 기록을 제거한다. 마커: memo가 "[seller:<id>]"로 시작하는 행.
export async function POST(request: Request) {
  const { sellerId, paid } = await request.json();
  if (!sellerId || typeof paid !== "boolean") {
    return NextResponse.json(
      { error: "sellerId, paid 필수" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { data: seller, error: sellerError } = await supabase
    .from("campaign_sellers")
    .select("*, campaign:campaigns(*)")
    .eq("id", sellerId)
    .single();
  if (sellerError || !seller) {
    return NextResponse.json(
      { error: "셀러를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const paidDate = paid ? seller.paid_date ?? today : null;

  const { error: updateError } = await supabase
    .from("campaign_sellers")
    .update({ is_paid: paid, paid_date: paidDate })
    .eq("id", sellerId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const finance = createFinanceClient();
  if (!finance) {
    return NextResponse.json({
      success: true,
      warning:
        "재무 연동 키(FINANCE_SUPABASE_URL/SERVICE_ROLE_KEY)가 없어 입금 상태만 저장되었습니다. 공구 사업부 실적에는 반영되지 않았습니다.",
    });
  }

  const marker = `[seller:${sellerId}]`;
  // 재기록에 안전하도록 기존 자동 기록은 항상 먼저 제거
  const { error: delError } = await finance
    .from("gonggu_sales")
    .delete()
    .like("memo", `${marker}%`);
  if (delError) {
    return NextResponse.json({
      success: true,
      warning: `입금 상태는 저장되었으나 재무 실적 반영에 실패했습니다: ${delError.message}`,
    });
  }

  if (paid) {
    const campaign = seller.campaign;
    const qty: number = seller.quantity || 0;
    const quoteTiers = (campaign?.seller_quote_tiers ?? []) as PriceTier[];
    const supplyTiers = (campaign?.supply_price_tiers ?? []) as PriceTier[];
    const vatMode: SupplyVatMode =
      campaign?.supply_vat_mode === "zero" ? "zero" : "taxed";
    // 셀러 개별 단가 우선, 없으면 캠페인 구간 단가 (이 셀러 수량 기준)
    const quote: number =
      seller.quote_price ??
      resolveTierPrice(campaign?.seller_quote_price ?? 0, quoteTiers, qty);
    const supply = resolveTierPrice(campaign?.supply_price ?? 0, supplyTiers, qty);
    const grossSales = qty * quote;
    const margin =
      supply > 0 ? qty * (quote - supplyNetCost(supply, vatMode)) : 0;

    const [year, month] = (paidDate ?? today).split("-").map(Number);
    // campaign_id는 비워서 재무팀의 월별 연동 행(캠페인당 월 1건 제한)과 충돌하지 않게 한다
    const { error: insError } = await finance.from("gonggu_sales").insert({
      campaign_id: null,
      campaign_name: `${campaign?.campaign_name ?? "캠페인"} — ${seller.name} 셀러 입금`,
      client_name: campaign?.client_name ?? null,
      year,
      month,
      gross_sales: Math.round(grossSales),
      margin: Math.round(margin),
      memo: `${marker} 공구 어드민 자동 기록 · 수량 ${qty} × 견적 ${Math.round(quote)}원`,
    });
    if (insError) {
      return NextResponse.json({
        success: true,
        warning: `입금 상태는 저장되었으나 재무 실적 반영에 실패했습니다: ${insError.message}`,
      });
    }
  }

  return NextResponse.json({ success: true });
}
