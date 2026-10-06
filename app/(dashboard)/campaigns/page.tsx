import { createClient } from "@/lib/supabase/server";
import CampaignTable, {
  CampaignStats,
} from "@/components/campaigns/campaign-table";
import { computeCampaignStats } from "@/lib/campaign-stats";
import { Manager } from "@/types/database";
import { fetchIsAdmin } from "@/lib/admin";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ manager?: string }>;
}) {
  // 대시보드 담당자별 실적에서 넘어오면 ?manager=<id|none>
  const { manager: managerParam } = await searchParams;
  const supabase = await createClient();

  // 목록의 돈 컬럼(취급액·달성률·정산대기)을 위해 인플루언서/셀러 데이터를 함께 집계
  const [
    { data: campaigns, error },
    { data: cis },
    { data: sellers },
    { data: managers },
    {
      data: { user },
    },
    isAdmin,
  ] = await Promise.all([
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
      supabase.from("managers").select("*").order("name", { ascending: true }),
      supabase.auth.getUser(),
      fetchIsAdmin(supabase),
    ]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  const stats: Record<string, CampaignStats> = computeCampaignStats(
    campaigns ?? [],
    cis ?? [],
    sellers ?? []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">전체 캠페인</h1>
        <p className="text-sm text-gray-500 mt-1">
          모든 공구 캠페인을 진행 단계별로 관리합니다. 단계·담당자 배지를 눌러 바로
          바꿀 수 있고, 여러 개를 체크해 담당자를 한 번에 배정할 수 있습니다.
        </p>
      </div>

      <CampaignTable
        campaigns={campaigns ?? []}
        stats={stats}
        managers={(managers as Manager[]) ?? []}
        userEmail={user?.email ?? null}
        initialManagerFilter={managerParam}
        isAdmin={isAdmin === true}
      />
    </div>
  );
}
