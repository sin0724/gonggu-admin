import { createClient } from "@/lib/supabase/server";
import { createFinanceClient } from "@/lib/supabase/finance";
import { fetchCrmKolCount } from "@/lib/supabase/crm";
import Link from "next/link";
import { formatDate, formatWon } from "@/lib/utils";
import {
  ACTIVE_STAGES,
  CampaignStage,
  CLOSED_STAGES,
  OPENED_STAGES,
  PIPELINE_STAGES,
  resolveStage,
  STAGE_COLOR,
  STAGE_LABEL,
} from "@/lib/campaign-stage";
import ConversionFunnel from "@/components/dashboard/conversion-funnel";
import TodayTasks, {
  TaskCampaign,
  TodaySchedule,
} from "@/components/dashboard/today-tasks";
import WelcomeBanner from "@/components/dashboard/welcome-banner";
import ManagerPerformance, {
  PerfCampaign,
  PerfProspectCount,
} from "@/components/dashboard/manager-performance";
import HelpTip from "@/components/ui/help-tip";
import { getProgressStatus, Manager, ScheduleKind } from "@/types/database";
import { computeCampaignStats } from "@/lib/campaign-stats";
import { findManagerByEmail, roleOf, ROLE_LABEL } from "@/lib/managers";
import {
  addDays,
  daysBetween,
  formatDayLabel,
  isoToKstDate,
  kstToIso,
  todayKey,
} from "@/lib/schedule";

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

/** "10월 6일 (월)" — KST */
function todayLabel(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const week = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 (${week})`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const finance = createFinanceClient();
  const today = todayKey();

  // 서로 의존하지 않는 조회는 한 번에 — 순서대로 기다리면 화면이 그만큼 늦게 뜬다
  const [
    { data: campaigns },
    { data: campaignInfluencers },
    { data: campaignSellers },
    { data: allProspects },
    { data: managersData },
    { data: weekSchedules },
    {
      data: { user },
    },
    crmKolCount,
    { data: gongguSales },
  ] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("campaign_influencers").select("*"),
    supabase.from("campaign_sellers").select("campaign_id, quantity, quote_price"),
    supabase.from("prospects").select("id, manager_id"),
    supabase.from("managers").select("*").order("name", { ascending: true }),
    // 이번 주 일정 — 오늘(KST)부터 7일
    supabase
      .from("campaign_schedules")
      .select("id, campaign_id, title, kind, start_at")
      .gte("start_at", kstToIso(today))
      .lt("start_at", kstToIso(addDays(today, 7)))
      .order("start_at"),
    supabase.auth.getUser(),
    // KOL 지표 — "우리 공구에 실제 투입된 KOL"을 지표로 삼고 CRM 풀 크기를 함께 표기한다
    fetchCrmKolCount(),
    // 재무 확정 취급액 — 재무관리(tianxia-finance)의 공구 사업부 실적을 직접 합산.
    // campaign_finance(동기화 사본)는 셀러 입금 자동 기록이 빠지므로 연동 키가 있으면
    // gonggu_sales 전체를 실시간으로 읽고 없을 때만 사본으로 폴백한다.
    finance
      ? finance.from("gonggu_sales").select("year, month, gross_sales")
      : Promise.resolve({ data: null }),
  ]);

  const managers = (managersData as Manager[]) ?? [];
  const me = findManagerByEmail(managers, user?.email);

  let totalConfirmedSales = 0;
  let confirmedSub = "재무관리 시스템 확정 기준 누적";
  let monthlyRows: { year: number; month: number; amount: number }[] = [];
  if (gongguSales) {
    totalConfirmedSales = gongguSales.reduce(
      (sum: number, r: { gross_sales: number | null }) => sum + (r.gross_sales || 0),
      0
    );
    confirmedSub = "재무 공구 사업부 실적 누적 (셀러 입금 포함)";
    monthlyRows = gongguSales.map(
      (r: { year: number; month: number; gross_sales: number | null }) => ({
        year: r.year,
        month: r.month,
        amount: r.gross_sales || 0,
      })
    );
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
  const thisMonth = monthly[monthly.length - 1];
  const lastMonth = monthly[monthly.length - 2];

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
    campaignInfluencers?.filter((ci) => getProgressStatus(ci) === "정산대기") ?? [];
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

  const settledList = campaignInfluencers?.filter((ci) => ci.is_settled) ?? [];
  const totalKolPaid = settledList.reduce((sum, ci) => sum + (ci.settlement_amount || 0), 0);

  // 실제 캠페인에 투입된 KOL 수 (같은 KOL이 여러 캠페인에 있어도 1명)
  const participatedKols = new Set(
    (campaignInfluencers ?? []).map((ci) => ci.influencer_id)
  ).size;

  const recentCampaigns = campaigns?.slice(0, 5) ?? [];
  const managerName = new Map(managers.map((m) => [m.id, m.name]));

  // ── 오늘 할 일 ─────────────────────────────────────────────
  // 종료·보류된 캠페인의 미처리 KOL은 이미 손 뗀 건이라 할 일에서 뺀다
  const stageById = new Map<string, CampaignStage>(
    (campaigns ?? []).map((c) => [c.id, resolveStage(c)])
  );
  const nameById = new Map<string, string>(
    (campaigns ?? []).map((c) => [c.id, c.campaign_name])
  );
  const groupByCampaign = (rows: { campaign_id: string }[]): TaskCampaign[] => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.campaign_id, (counts.get(r.campaign_id) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, name: nameById.get(id) ?? "(이름 없음)", count }))
      .sort((a, b) => b.count - a.count);
  };
  // 발송은 섭외가 끝난 뒤(모집중·진행중)부터 챙길 일이다
  const sendWaiting = groupByCampaign(
    (campaignInfluencers ?? []).filter((ci) => {
      const stage = stageById.get(ci.campaign_id);
      return (
        (stage === "recruiting" || stage === "live") &&
        getProgressStatus(ci) === "발송대기"
      );
    })
  );
  const uploadWaiting = groupByCampaign(
    (campaignInfluencers ?? []).filter((ci) => {
      const stage = stageById.get(ci.campaign_id);
      return (
        stage !== undefined &&
        !CLOSED_STAGES.includes(stage) &&
        getProgressStatus(ci) === "업로드대기"
      );
    })
  );

  const todaySchedules: TodaySchedule[] = (weekSchedules ?? [])
    .filter((s) => {
      const stage = stageById.get(s.campaign_id);
      return stage !== undefined && !CLOSED_STAGES.includes(stage);
    })
    .map((s) => {
      const date = isoToKstDate(s.start_at);
      const d = daysBetween(today, date);
      return {
        id: s.id,
        campaignId: s.campaign_id,
        campaignName: nameById.get(s.campaign_id) ?? "",
        title: s.title,
        kind: s.kind as ScheduleKind,
        when: d === 0 ? "오늘" : d === 1 ? "내일" : `D-${d}`,
        dateLabel: formatDayLabel(date),
      };
    });

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
    { label: "전체 거래처", count: totalAccounts, hint: "거래처 관리에 등록된 모든 업체" },
    { label: "캠페인 등록", count: withCampaign.size, hint: "캠페인이 하나 이상 연결된 업체" },
    {
      label: "공구 오픈",
      count: withOpened.size,
      hint: "실제로 공구를 연 적이 있는 업체 (보류·준비 단계 제외)",
    },
  ];

  // ── 담당자별 실적 ──────────────────────────────────────────
  const campaignStats = computeCampaignStats(
    campaigns ?? [],
    campaignInfluencers ?? [],
    campaignSellers ?? []
  );
  const prospectManager = new Map<string, string | null>(
    (allProspects ?? []).map((p) => [p.id, p.manager_id ?? null])
  );
  const perfCampaigns: PerfCampaign[] = (campaigns ?? []).map((c) => ({
    id: c.id,
    stage: resolveStage(c),
    date: c.start_date ?? c.created_at.slice(0, 10),
    managerId: c.manager_id ?? null,
    prospectId: c.prospect_id ?? null,
    sourceManagerId: c.prospect_id ? prospectManager.get(c.prospect_id) ?? null : null,
    sales: campaignStats[c.id]?.sales ?? 0,
    target: c.target_sales,
    pendingCount: campaignStats[c.id]?.pendingCount ?? 0,
  }));
  const prospectCountMap = new Map<string | null, number>();
  for (const p of allProspects ?? []) {
    const key = p.manager_id ?? null;
    prospectCountMap.set(key, (prospectCountMap.get(key) ?? 0) + 1);
  }
  const prospectCounts: PerfProspectCount[] = [...prospectCountMap.entries()].map(
    ([managerId, total]) => ({ managerId, total })
  );

  // 내 담당 요약 — 로그인 이메일이 담당자로 등록된 사람에게만
  const myCampaigns = me ? perfCampaigns.filter((c) => c.managerId === me.id) : [];
  const mySummary = me
    ? {
        live: myCampaigns.filter((c) => ACTIVE_STAGES.includes(c.stage)).length,
        waiting: myCampaigns.filter((c) => PIPELINE_STAGES.includes(c.stage)).length,
        pending: myCampaigns.reduce((s, c) => s + c.pendingCount, 0),
      }
    : null;

  const kpis = [
    {
      label: "확정 취급액",
      value: formatWon(totalConfirmedSales),
      sub: hasMonthlyData
        ? `이번 달 ${formatWonCompact(thisMonth.total)} · 지난달 ${formatWonCompact(lastMonth.total)}`
        : confirmedSub,
      help: `재무관리 시스템(tianxia-finance)에서 확정된 공구 매출 합계입니다 (${confirmedSub}). 이 시스템에서 입력한 판매액과는 확정 시점 차이로 다를 수 있습니다.`,
      href: "/campaigns",
      accent: "bg-purple-500",
    },
    {
      label: "캠페인",
      value: `진행 ${stageCounts.진행}`,
      sub: `대기 ${stageCounts.대기} · 종료 ${stageCounts.종료} · 전체 ${campaigns?.length ?? 0}`,
      help: "진행 = 진행중·정산중, 대기 = 가망·셋업·모집중, 종료 = 종료·보류 단계의 캠페인 수입니다.",
      href: "/campaigns/active",
      accent: "bg-green-500",
    },
    {
      label: "정산 대기",
      value: formatWon(pendingSettlementAmount),
      sub: `${pendingSettlement}건${pendingHasEstimate ? " (일부 RS율 추정)" : ""} · 누적 지급 ${formatWonCompact(totalKolPaid)}`,
      help: "업로드까지 끝나고 판매금액이 입력됐지만 아직 송금하지 않은 KOL 정산금 합계입니다. 정산금액이 비어 있으면 캠페인 RS율로 추정합니다. '누적 지급'은 정산 완료 처리된 금액 합계입니다.",
      href: "/settlements",
      accent: "bg-orange-500",
    },
    {
      label: "참여 KOL",
      value: `${participatedKols.toLocaleString("ko-KR")}명`,
      sub:
        crmKolCount !== null
          ? `CRM 아카이브 ${crmKolCount.toLocaleString("ko-KR")}명 중`
          : "공구에 투입된 KOL (중복 제외)",
      help: "캠페인에 한 번이라도 추가된 KOL 수(같은 KOL은 1명)입니다. CRM 아카이브는 섭외 가능한 전체 KOL 풀입니다.",
      href: "/kols",
      accent: "bg-blue-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 인사 + 내 담당 요약 — 들어오자마자 "나는 뭘 보면 되나"를 알 수 있게 */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-gray-400">{todayLabel()}</p>
          <h1 className="text-xl font-bold text-gray-900 mt-0.5">
            {me ? `${me.name}님, 안녕하세요` : "안녕하세요"}
          </h1>
          {me && mySummary && (
            <p className="text-sm text-gray-500 mt-1">
              {ROLE_LABEL[roleOf(me)]} 담당 · 내 캠페인 진행{" "}
              <b className="text-gray-800">{mySummary.live}</b> · 대기{" "}
              <b className="text-gray-800">{mySummary.waiting}</b>
              {mySummary.pending > 0 && (
                <>
                  {" "}· 정산 대기 <b className="text-orange-600">{mySummary.pending}건</b>
                </>
              )}
              <Link
                href={`/campaigns?manager=mine`}
                className="ml-2 text-primary-600 hover:text-primary-700 font-medium"
              >
                내 캠페인 보기 →
              </Link>
            </p>
          )}
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          신규 캠페인
        </Link>
      </div>

      {/* 처음 온 사람용 안내 — 닫으면 다시 안 뜬다 */}
      <WelcomeBanner />

      {/* 오늘 할 일 — 현황 숫자보다 지금 손댈 일을 먼저 */}
      <TodayTasks
        pendingSettlement={pendingSettlement}
        sendWaiting={sendWaiting}
        uploadWaiting={uploadWaiting}
        schedules={todaySchedules}
      />

      {/* 핵심 지표 4개 — 겹치던 건수/금액 카드를 하나로 합쳤다 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-2">한눈에 보기</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <Link
              key={k.label}
              href={k.href}
              className="card relative overflow-hidden p-5 hover:shadow-md transition-shadow"
            >
              <span className={`absolute left-0 top-0 h-full w-1 ${k.accent}`} />
              <p className="text-sm text-gray-500 flex items-center">
                {k.label}
                <HelpTip text={k.help} align="left" />
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{k.value}</p>
              <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 담당자별 실적 */}
      <ManagerPerformance
        managers={managers}
        campaigns={perfCampaigns}
        prospectCounts={prospectCounts}
        meId={me?.id ?? null}
      />

      {/* 추이 + 전환율 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className={`card p-5 ${hasMonthlyData ? "xl:col-span-2" : "xl:col-span-2 flex flex-col"}`}>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            월별 확정 취급액
            <span className="ml-2 text-xs font-normal text-gray-400">
              최근 12개월 · 재무 확정 기준
            </span>
          </h2>
          {!hasMonthlyData ? (
            <p className="flex-1 flex items-center justify-center py-12 text-sm text-gray-400">
              아직 재무 확정 실적이 없습니다.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-1.5 h-48">
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
                            ? isLast
                              ? "bg-purple-600 group-hover:bg-purple-700"
                              : "bg-purple-400 group-hover:bg-purple-500"
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
                    className={`flex-1 text-center text-[10px] whitespace-nowrap ${
                      i === monthly.length - 1 ? "text-gray-700 font-semibold" : "text-gray-400"
                    }`}
                  >
                    {m.month === 1 || i === 0 ? `${String(m.year).slice(2)}.${m.month}` : `${m.month}월`}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 거래처 전환율 — 영업 퍼널이 어디서 끊기는지 */}
        <ConversionFunnel stages={funnelStages} />
      </div>

      {/* 최근 캠페인 */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">최근 등록된 캠페인</h2>
          <Link href="/campaigns" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            전체 보기 →
          </Link>
        </div>

        {recentCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
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
                  <th className="table-header">담당자</th>
                  <th className="table-header">기간</th>
                  <th className="table-header">상태</th>
                  <th className="table-header">등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentCampaigns.map((campaign) => {
                  const stage = resolveStage(campaign);
                  const owner = campaign.manager_id ? managerName.get(campaign.manager_id) : null;
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
                      <td className="table-cell text-gray-600">{campaign.client_name}</td>
                      <td className="table-cell text-sm">
                        {owner ? (
                          <span className="text-gray-700">{owner}</span>
                        ) : (
                          <span className="badge bg-amber-50 text-amber-700">미배정</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 text-xs">
                        {campaign.start_date && campaign.end_date
                          ? `${formatDate(campaign.start_date)} ~ ${formatDate(campaign.end_date)}`
                          : "-"}
                      </td>
                      <td className="table-cell">
                        <span className={`badge ${STAGE_COLOR[stage]}`}>{STAGE_LABEL[stage]}</span>
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
