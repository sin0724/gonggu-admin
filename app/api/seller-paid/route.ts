import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSellerFinance } from "@/lib/seller-finance";

// 셀러 입금 완료 토글 — 체크 시 재무관리(tianxia-finance)의
// 공구 사업부 실적(gonggu_sales)에 셀러 공급액·마진을 자동 기록하고,
// 해제 시 해당 기록을 제거한다.
export async function POST(request: Request) {
  const { sellerId, paid } = await request.json();
  if (!sellerId || typeof paid !== "boolean") {
    return NextResponse.json({ error: "sellerId, paid 필수" }, { status: 400 });
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
    .select("paid_date")
    .eq("id", sellerId)
    .single();
  if (sellerError || !seller) {
    return NextResponse.json({ error: "셀러를 찾을 수 없습니다." }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error: updateError } = await supabase
    .from("campaign_sellers")
    .update({
      is_paid: paid,
      paid_date: paid ? seller.paid_date ?? today : null,
    })
    .eq("id", sellerId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const warning = await syncSellerFinance(supabase, sellerId, paid);
  return NextResponse.json({
    success: true,
    ...(warning ? { warning: `입금 상태는 저장되었으나 ${warning}` } : {}),
  });
}
