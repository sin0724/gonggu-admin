import { createClient } from "@/lib/supabase/server";
import ProspectTable, {
  LinkedCampaign,
} from "@/components/prospects/prospect-table";
import { Manager, ProspectWithManager } from "@/types/database";
import { resolveStage } from "@/lib/campaign-stage";

export default async function ProspectsPage() {
  const supabase = await createClient();

  const [{ data: prospects, error }, { data: managers }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("prospects")
        .select("*, manager:managers(*)")
        .order("created_at", { ascending: false }),
      supabase.from("managers").select("*").order("name", { ascending: true }),
      // 거래 단계는 연결된 캠페인에서 파생한다 (lib/account-stage.ts)
      supabase
        .from("campaigns")
        .select("id, campaign_name, status, start_date, end_date, prospect_id")
        .not("prospect_id", "is", null),
    ]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  // 가망건별 캠페인 목록 — 마이그레이션 021 적용 전이면 campaigns가 null이라 빈 맵
  const campaignsByProspect: Record<string, LinkedCampaign[]> = {};
  for (const c of campaigns ?? []) {
    if (!c.prospect_id) continue;
    (campaignsByProspect[c.prospect_id] ??= []).push({
      id: c.id,
      campaign_name: c.campaign_name,
      stage: resolveStage(c),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">거래처 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          컨택한 업체를 한곳에서 관리합니다. 캠페인을 등록하면 가망에서 거래처로
          자동 전환됩니다.
        </p>
      </div>
      <ProspectTable
        initialProspects={(prospects as ProspectWithManager[]) ?? []}
        managers={(managers as Manager[]) ?? []}
        campaignsByProspect={campaignsByProspect}
      />
    </div>
  );
}
