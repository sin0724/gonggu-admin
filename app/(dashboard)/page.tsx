import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate, formatCurrency, isCampaignActive } from "@/lib/utils";
import { getProgressStatus } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createClient();

  // 캠페인 데이터
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  // 캠페인 인플루언서 데이터
  const { data: campaignInfluencers } = await supabase
    .from("campaign_influencers")
    .select("*");

  // 인플루언서 수
  const { count: influencerCount } = await supabase
    .from("influencers")
    .select("*", { count: "exact", head: true });

  const totalCampaigns = campaigns?.length ?? 0;
  const activeCampaigns =
    campaigns?.filter((c) => isCampaignActive(c.start_date, c.end_date))
      .length ?? 0;
  const endedCampaigns = totalCampaigns - activeCampaigns;

  const pendingSettlement =
    campaignInfluencers?.filter((ci) => {
      const status = getProgressStatus(ci);
      return status === "정산대기";
    }).length ?? 0;

  const completedSettlement =
    campaignInfluencers?.filter((ci) => ci.is_settled).length ?? 0;

  const recentCampaigns = campaigns?.slice(0, 5) ?? [];

  const stats = [
    {
      label: "전체 캠페인",
      value: totalCampaigns,
      sub: `진행중 ${activeCampaigns} · 종료 ${endedCampaigns}`,
      color: "bg-blue-50 text-blue-600",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: "전체 인플루언서",
      value: influencerCount ?? 0,
      sub: "등록된 인플루언서",
      color: "bg-purple-50 text-purple-600",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: "정산 대기",
      value: pendingSettlement,
      sub: "건 처리 필요",
      color: "bg-orange-50 text-orange-600",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "정산 완료",
      value: completedSettlement,
      sub: "건 완료",
      color: "bg-green-50 text-green-600",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stat.value.toLocaleString("ko-KR")}
                </p>
                <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color}`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 최근 캠페인 */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">최근 캠페인</h2>
          <Link href="/campaigns" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            전체 보기 →
          </Link>
        </div>

        {recentCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">등록된 캠페인이 없습니다.</p>
            <Link href="/campaigns/new" className="btn-primary btn-sm mt-3">
              첫 캠페인 등록하기
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">캠페인명</th>
                  <th className="table-header">클라이언트</th>
                  <th className="table-header">기간</th>
                  <th className="table-header">상태</th>
                  <th className="table-header">등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentCampaigns.map((campaign) => {
                  const active = isCampaignActive(
                    campaign.start_date,
                    campaign.end_date
                  );
                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="font-medium text-primary-600 hover:text-primary-700"
                        >
                          {campaign.campaign_name}
                        </Link>
                      </td>
                      <td className="table-cell text-gray-600">
                        {campaign.client_name}
                      </td>
                      <td className="table-cell text-gray-500 text-xs">
                        {campaign.start_date && campaign.end_date
                          ? `${formatDate(campaign.start_date)} ~ ${formatDate(campaign.end_date)}`
                          : "-"}
                      </td>
                      <td className="table-cell">
                        <span
                          className={`badge ${
                            active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {active ? "진행중" : "종료"}
                        </span>
                      </td>
                      <td className="table-cell text-gray-500 text-xs">
                        {formatDate(campaign.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
