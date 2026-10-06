import { resolveTierPrice } from "@/lib/economics";
import { getProgressStatus, PriceTier } from "@/types/database";

/** 캠페인별 지표 — 목록·대시보드가 같은 기준으로 계산하도록 한 곳에 둔다 */
export interface CampaignSalesStat {
  /** 총 취급액 = KOL 판매액 + 셀러 공급액 (원) */
  sales: number;
  /** 정산대기 KOL 수 */
  pendingCount: number;
  /** 목표 달성률(%) — 목표 미설정 시 null */
  achievement: number | null;
}

interface CampaignLike {
  id: string;
  target_sales: number | null;
  seller_quote_price: number | null;
  seller_quote_tiers: PriceTier[] | null;
}

interface InfluencerLike {
  campaign_id: string;
  sales_amount: number;
  is_product_sent: boolean;
  is_uploaded: boolean;
  is_settled: boolean;
}

interface SellerLike {
  campaign_id: string;
  quantity: number;
  quote_price: number | null;
}

export function computeCampaignStats(
  campaigns: CampaignLike[],
  influencers: InfluencerLike[],
  sellers: SellerLike[]
): Record<string, CampaignSalesStat> {
  const kolsBy = new Map<string, InfluencerLike[]>();
  for (const r of influencers) {
    const list = kolsBy.get(r.campaign_id) ?? [];
    list.push(r);
    kolsBy.set(r.campaign_id, list);
  }
  const sellersBy = new Map<string, SellerLike[]>();
  for (const s of sellers) {
    const list = sellersBy.get(s.campaign_id) ?? [];
    list.push(s);
    sellersBy.set(s.campaign_id, list);
  }

  const stats: Record<string, CampaignSalesStat> = {};
  for (const c of campaigns) {
    const rows = kolsBy.get(c.id) ?? [];
    const kolSales = rows.reduce((sum, r) => sum + (r.sales_amount || 0), 0);
    // 셀러 공급액 — 개별 단가 우선, 없으면 캠페인 구간 단가 (상세 화면과 동일 기준)
    const quoteTiers = (c.seller_quote_tiers ?? []) as PriceTier[];
    const sellerRevenue = (sellersBy.get(c.id) ?? []).reduce(
      (sum, s) =>
        sum +
        (s.quantity || 0) *
          (s.quote_price ??
            resolveTierPrice(c.seller_quote_price ?? 0, quoteTiers, s.quantity || 0)),
      0
    );
    const sales = kolSales + sellerRevenue;
    stats[c.id] = {
      sales,
      pendingCount: rows.filter((r) => getProgressStatus(r) === "정산대기").length,
      achievement:
        c.target_sales && c.target_sales > 0 ? (sales / c.target_sales) * 100 : null,
    };
  }
  return stats;
}
