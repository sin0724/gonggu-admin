import { createClient } from "@/lib/supabase/server";
import SettlementTable, {
  SettlementRecord,
} from "@/components/settlements/settlement-table";

// 정산 통합 뷰 — 전 캠페인의 정산대기/완료 KOL을 한 화면에서 처리한다.
// 캠페인별 관리(상세 페이지)와 데이터는 동일하고, 여기는 "송금 업무 큐" 역할.

export const dynamic = "force-dynamic";

interface SettlementsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettlementsPage({
  searchParams,
}: SettlementsPageProps) {
  const { tab } = await searchParams;
  const supabase = await createClient();

  const { data: records, error } = await supabase
    .from("campaign_influencers")
    .select(
      "*, influencer:influencers(*), campaign:campaigns(id, campaign_name, client_name, influencer_rs_rate, exchange_rate)"
    )
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
        <h1 className="text-xl font-bold text-gray-900">정산 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          전체 캠페인의 KOL 정산을 한 곳에서 처리합니다. 금액이 비어 있는 건은
          캠페인 RS율로 추정해 표시합니다.
        </p>
      </div>
      <SettlementTable
        records={(records ?? []) as SettlementRecord[]}
        initialTab={tab === "done" ? "정산완료" : "정산대기"}
      />
    </div>
  );
}
