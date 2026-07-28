import { createClient } from "@/lib/supabase/server";
import { createFinanceClient } from "@/lib/supabase/finance";
import Link from "next/link";
import { formatDate, formatWon } from "@/lib/utils";
import {
  ACTIVE_STAGES,
  OPENED_STAGES,
  PIPELINE_STAGES,
  resolveStage,
  STAGE_COLOR,
  STAGE_LABEL,
} from "@/lib/campaign-stage";
import ConversionFunnel from "@/components/dashboard/conversion-funnel";
import { getProgressStatus } from "@/types/database";

// 재무 실적은 외부 프로젝트(tianxia-finance) DB에서 매번 읽어야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

/** 원화 축약 표기 — 차트 라벨용: 1.2억 / 3,400만 / 5,000원 */
function formatWonCompact(n: number): string {
  if (n >= 1e8) {
    const v = n / 1e8;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}억`;
  }
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

interface MonthlySale {
  year: number;
  month: number;
  total: number;
}

/** 최근 12개월(이번 달 포함) 버킷 — 데이터 없는 달은 0 */
function buildMonthlyBuckets(
  rows: { year: number; month: number; amount: number }[]
): MonthlySale[] {
  const now = new Date();
  const buckets: MonthlySale[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth() + 1, total: 0 });
  }
  for (const r of rows) {
    const b = buckets.find((x) => x.year === r.year && x.month === r.month);
    if (b) b.total += r.amount || 0;
  }
  return buckets;
}

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

  // 거래처 전환율 — 컨택한 업체 중 실제로 공구를 연 비율
  const { data: allProspects } = await supabase.from("prospects").select("id");

  // 재무 확정 취급액 — 재무관리(tianxia-finance)의 공구 사업부 실적을 직접 합산.
  // campaign_finance(동기화 사본)는 재무팀이 캠페인 연동 행을 저장할 때만 갱신되어
  // 셀러 입금 자동 기록(campaign_id 없는 행)이 빠지므로, 연동 키가 있으면
  // gonggu_sales 전체를 실시간으로 읽고 없을 때만 사본으로 폴백한다.
  let totalConfirmedSales = 0;
  let confirmedSub = "재무관리 시스템 확정 기준 누적";
  let monthlyRows: { year: number; month: number; amount: number }[] = [];
  const finance = createFinanceClient();
  const { data: gongguSales } = finance
    ? await finance.from("gonggu_sales").select("year, month, gross_sales")
    : { data: null };
  if (gongguSales) {
    totalConfirmedSales = gongguSales.reduce(
      (sum, r) => sum + (r.gross_sales || 0),
      0
    );
    confirmedSub = "재무 공구 사업부 실적 누적 (셀러 입금 포함)";
    monthlyRows = gongguSales.map((r) => ({
      year: r.year,
      month: r.month,
      amount: r.gross_sales || 0,
    }));
  } else {
    const { data: financeRows } = await supabase
      .from("campaign_finance")
      .select("year, month, confirmed_sales");
    totalConfirmedSales = (financeRows ?? []).reduce(
      (sum, r) => sum + (r.confirmed_sales || 0),
      0
    );
    monthlyRows = (financeRows ?? []).map((r) => ({
      year: r.year,
      month: r.month,
      amount: r.confirmed_sales || 0,
    }));
  }

  const monthly = buildMonthlyBuckets(monthlyRows);
  const monthlyMax = Math.max(...monthly.map((m) => m.total));
  const hasMonthlyData = monthlyMax > 0;
  const maxIndex = monthly.findIndex((m) => m.total === monthlyMax);

  const totalCampaigns = campaigns?.length ?? 0;
  // 진행 단계(campaigns.status) 기준 집계 — 날짜만으로는 가망/셋업을 구분할 수 없다
  const stageCounts = { 대기: 0, 진행: 0, 종료: 0 };
  for (const c of campaigns ?? []) {
    const stage = resolveStage(c);
    if (ACTIVE_STAGES.includes(stage)) stageCounts.진행++;
    else if (PIPELINE_STAGES.includes(stage)) stageCounts.대기++;
    else stageCounts.종료++;
  }

  // 정산 대기 금액 — 정산금액 미입력 건은 캠페인 RS율로 추정해 합산 (과소 표시 방지)
  const rsRateMap = new Map<string, number>(
    (campaigns ?? []).map((c) => [c.id, c.influencer_rs_rate ?? 0])
  );
  const pendingList =
    campaignInfluencers?.filter((ci) => getProgressStatus(ci) === "정산대기") ??
    [];
  const pendingSettlement = pendingList.length;
  let pendingHasEstimate = false;
  const pendingSettlementAmount = pendingList.reduce((sum, ci) => {
    if (ci.settlement_amount > 0) return sum + ci.settlement_amount;
    const rate = rsRateMap.get(ci.campaign_id) ?? 0;
    if (ci.sales_amount > 0 && rate > 0) {
      pendingHasEstimate = true;
      return sum + Math.round(ci.sales_amount * (rate / 100));
    }
    return sum;
  }, 0);

  const completedSettlement =
    campaignInfluencers?.filter((ci) => ci.is_settled).length ?? 0;

  // 돈 지표 — 대시보드에는 재무 확정 취급액만 노출.
  // 벤더사 마진은 캠페인 상세에서만 확인한다 (누적 마진 카드 제거).
  const totalKolPaid =
    campaignInfluencers
      ?.filter((ci) => ci.is_settled)
      .reduce((sum, ci) => sum + (ci.settlement_amount || 0), 0) ?? 0;

  const recentCampaigns = campaigns?.slice(0, 5) ?? [];

  // ── 거래처 전환 퍼널 ────────────────────────────────────────
  // 각 단계는 앞 단계의 부분집합이어야 한다(누적). 컨택 상태는 별개 축이라 섞지 않는다.
  const totalAccounts = allProspects?.length ?? 0;
  const withCampaign = new Set<string>();
  const withOpened = new Set<string>();
  for (const c of campaigns ?? []) {
    if (!c.prospect_id) continue;
    withCampaign.add(c.prospect_id);
    if (OPENED_STAGES.includes(resolveStage(c))) withOpened.add(c.prospect_id);
  }

  const funnelStages = [
    {
      label: "전체 거래처",
      count: totalAccounts,
      hint: "거래처 관리에 등록된 모든 업체",
    },
    {
      label: "캠페인 등록",
      count: withCampaign.size,
      hint: "캠페인이 하나 이상 연결된 업체",
    },
    {
      label: "공구 오픈",
      count: withOpened.size,
      hint: "실제로 공구를 연 적이 있는 업체 (보류·준비 단계 제외)",
    },
  ];

  const moneyStats = [
    {
      label: "확정 취급액",
      value: formatWon(totalConfirmedSales),
      sub: confirmedSub,
      color: "bg-purple-50 text-purple-600",
      href: "/campaigns",
    },
    {
      label: "정산 대기 금액",
      value: formatWon(pendingSettlementAmount),
      sub: `${pendingSettlement}건 — KOL 지급 예정${pendingHasEstimate ? " (미입력 건 RS율 추정 포함)" : ""}`,
      color: "bg-orange-50 text-orange-600",
      href: "/settlements",
    },
    {
      label: "KOL 지급 완료",
      value: formatWon(totalKolPaid),
      sub: `${completedSettlement}건 정산 완료`,
      color: "bg-green-50 text-green-600",
      href: "/settlements?tab=done",
    },
  ];

  const stats = [
    {
      label: "전체 캠페인",
      value: totalCampaigns,
      sub: `진행 ${stageCounts.진행} · 대기 ${stageCounts.대기} · 종료 ${stageCounts.종료}`,
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

      {/* 돈 지표 카드 — 마진은 캠페인 상세에서만 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {moneyStats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="card p-5 hover:shadow-md transition-shadow"
          >
            <div className={`inline-block text-xs font-medium px-2 py-1 rounded-md mb-2 ${stat.color}`}>
              {stat.label}
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
          </Link>
        ))}
      </div>

      {/* 거래처 전환율 — 영업 퍼널이 어디서 끊기는지 */}
      <ConversionFunnel stages={funnelStages} />

      {/* 월별 확정 취급액 추이 — 재무 실적 기준 최근 12개월 */}
      {hasMonthlyData && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              월별 확정 취급액
              <span className="ml-2 text-xs font-normal text-gray-400">
                최근 12개월 · 재무 확정 기준
              </span>
            </h2>
          </div>
          <div className="flex items-end gap-1.5 h-40">
            {monthly.map((m, i) => {
              const heightPct =
                monthlyMax > 0 ? Math.max(m.total > 0 ? 3 : 0, (m.total / monthlyMax) * 100) : 0;
              const isLast = i === monthly.length - 1;
              const showLabel = m.total > 0 && (i === maxIndex || isLast);
              return (
                <div
                  key={`${m.year}-${m.month}`}
                  className="group relative flex-1 flex flex-col items-center justify-end h-full"
                >
                  {/* 호버 툴팁 */}
                  {m.total > 0 && (
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 pointer-events-none">
                      {m.year}년 {m.month}월 · {formatWon(m.total)}
                    </div>
                  )}
                  {/* 상시 라벨은 최대·최신 달만 (선택적 직접 라벨) */}
                  {showLabel && (
                    <p className="text-[10px] font-semibold text-gray-600 mb-1 whitespace-nowrap">
                      {formatWonCompact(m.total)}
                    </p>
                  )}
                  <div
                    className={`w-full max-w-[36px] rounded-t transition-colors ${
                      m.total > 0
                        ? "bg-purple-400 group-hover:bg-purple-500"
                        : "bg-gray-100"
                    }`}
                    style={{ height: `${heightPct}%`, minHeight: m.total > 0 ? undefined : "2px" }}
                  />
                </div>
              );
            })}
          </div>
          {/* 월 라벨 */}
          <div className="flex gap-1.5 mt-2 border-t border-gray-100 pt-1.5">
            {monthly.map((m, i) => (
              <p
                key={`${m.year}-${m.month}`}
                className="flex-1 text-center text-[10px] text-gray-400 whitespace-nowrap"
              >
                {m.month === 1 || i === 0 ? `${String(m.year).slice(2)}.${m.month}` : `${m.month}월`}
              </p>
            ))}
          </div>
        </div>
      )}

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
                  const stage = resolveStage(campaign);
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
                        <span className={`badge ${STAGE_COLOR[stage]}`}>
                          {STAGE_LABEL[stage]}
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
