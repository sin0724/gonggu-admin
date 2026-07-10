import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resyncCampaignSellerFinance } from "@/lib/seller-finance";

// 캠페인 가격 조건(공급가·과세 구분·구간·견적가·공구가)이 바뀌면
// 이미 입금 처리된 셀러의 재무 기록을 현재 조건으로 다시 쓴다.
// 이렇게 해야 재무 공구 사업부 실적의 마진이 캠페인 화면과 항상 일치한다.
export async function POST(request: Request) {
  const { campaignId } = await request.json();
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId 필수" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { synced, warnings } = await resyncCampaignSellerFinance(
    supabase,
    campaignId
  );
  return NextResponse.json({
    success: true,
    synced,
    ...(warnings.length ? { warning: warnings[0] } : {}),
  });
}
