import { createClient } from "@/lib/supabase/server";
import PipelineBoard, {
  PipelineCampaign,
} from "@/components/campaigns/pipeline-board";
import { PIPELINE_STAGES, resolveStage } from "@/lib/campaign-stage";

export default async function PipelineCampaignsPage() {
  const supabase = await createClient();

  const { data: rawCampaigns, error } = await supabase
    .from("campaigns")
    .select(
      "id, campaign_name, client_name, status, start_date, end_date, gonggu_price, target_sales, exchange_rate, deal_type, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  const pipeline = (rawCampaigns ?? [])
    .map((c) => ({ ...c, stage: resolveStage(c) }) as PipelineCampaign)
    .filter((c) => PIPELINE_STAGES.includes(c.stage));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">대기중인 캠페인</h1>
        <p className="text-sm text-gray-500 mt-1">
          아직 공구가 열리지 않은 캠페인을 단계별로 관리합니다. 단계 배지를 눌러
          바로 바꿀 수 있습니다.
        </p>
      </div>

      <PipelineBoard campaigns={pipeline} />
    </div>
  );
}
