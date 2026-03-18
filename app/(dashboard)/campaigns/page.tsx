import { createClient } from "@/lib/supabase/server";
import CampaignTable from "@/components/campaigns/campaign-table";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">캠페인 관리</h1>
        <p className="text-sm text-gray-500 mt-1">공구 캠페인을 등록하고 관리합니다.</p>
      </div>

      <CampaignTable campaigns={campaigns ?? []} />
    </div>
  );
}
