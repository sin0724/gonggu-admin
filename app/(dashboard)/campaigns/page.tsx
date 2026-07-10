import { createClient } from "@/lib/supabase/server";
import CampaignTable, {
  CampaignStats,
} from "@/components/campaigns/campaign-table";
import { resolveTierPrice } from "@/lib/economics";
import { getProgressStatus, PriceTier } from "@/types/database";

export default async function CampaignsPage() {
  const supabase = await createClient();

  // 목록의 돈 컬럼(취급액·달성률·정산대기)을 위해 인플루언서/셀러 데이터를 함께 집계
  const [{ data: campaigns, error }, { data: cis }, { data: sellers }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("campaign_influencers")
        .select(
          "campaign_id, sales_amount, is_product_sent, is_uploaded, is_settled"
        ),
      supabase
        .from("campaign_sellers")
        .select("campaign_id, quantity, quote_price"),
    ]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  const stats: Record<string, CampaignStats> = {};
  for (const c of campaigns ?? []) {
    const rows = (cis ?? []).filter((r) => r.campaign_id === c.id);
    const kolSales = rows.reduce((sum, r) => sum + (r.sales_amount || 0), 0);
    // 셀러 공급액 — 개별 단가 우선, 없으면 캠페인 구간 단가 (상세 화면과 동일 기준)
    const quoteTiers = (c.seller_quote_tiers ?? []) as PriceTier[];
    const sellerRevenue = (sellers ?? [])
      .filter((s) => s.campaign_id === c.id)
      .reduce(
        (sum, s) =>
          sum +
          (s.quantity || 0) *
            (s.quote_price ??
              resolveTierPrice(
                c.seller_quote_price ?? 0,
                quoteTiers,
                s.quantity || 0
              )),
        0
      );
    const combinedSales = kolSales + sellerRevenue;
    stats[c.id] = {
      sales: combinedSales,
      pendingCount: rows.filter((r) => getProgressStatus(r) === "정산대기")
        .length,
      achievement:
        c.target_sales && c.target_sales > 0
          ? (combinedSales / c.target_sales) * 100
          : null,
    };
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">캠페인 관리</h1>
        <p className="text-sm text-gray-500 mt-1">공구 캠페인을 등록하고 관리합니다.</p>
      </div>

      <CampaignTable campaigns={campaigns ?? []} stats={stats} />
    </div>
  );
}
