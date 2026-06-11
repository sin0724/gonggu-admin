import { createClient } from "@/lib/supabase/server";
import SettlementTable, {
  SettlementRecord,
} from "@/components/settlements/settlement-table";

export default async function SettlementsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("campaign_influencers")
    .select(
      "*, influencer:influencers(*), campaign:campaigns(id, campaign_name, client_name, influencer_rs_rate)"
    )
    .order("created_at", { ascending: false });

  const records = (data ?? []) as SettlementRecord[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">정산 관리</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          전체 캠페인의 KOL 정산 현황을 한눈에 확인하고 내보낼 수 있습니다.
        </p>
      </div>
      <SettlementTable records={records} />
    </div>
  );
}
