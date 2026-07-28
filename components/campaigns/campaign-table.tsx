"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types/database";
import {
  formatDate,
  formatMoney,
  formatWon,
  formatTwd,
  krwToTwd,
} from "@/lib/utils";
import {
  CAMPAIGN_STAGES,
  CampaignStage,
  resolveStage,
  STAGE_LABEL,
} from "@/lib/campaign-stage";
import StageSelect from "@/components/campaigns/stage-select";
import { useToast } from "@/components/ui/toast";
import ConfirmDialog from "@/components/ui/confirm-dialog";

/** 목록 페이지에서 서버 집계해 내려주는 캠페인별 지표 */
export interface CampaignStats {
  /** 총 취급액 = KOL 판매액 + 셀러 공급액 (원) */
  sales: number;
  /** 정산대기 KOL 수 */
  pendingCount: number;
  /** 목표 달성률(%) — 목표 미설정 시 null */
  achievement: number | null;
}

interface CampaignTableProps {
  campaigns: Campaign[];
  stats?: Record<string, CampaignStats>;
}

type SortKey = "name" | "sales" | "achievement" | "pending" | "start" | "created";
type SortDir = "asc" | "desc";

/** 상태 탭 — "전체" + 진행 단계 7종 */
type StageFilter = "all" | CampaignStage;

/** 금액 셀 — TWD 메인 · 원화 보조. 환율 없으면 원화만. */
function MoneyCell({ krw, rate }: { krw: number; rate: number | null }) {
  if (!(krw > 0)) return <span className="text-gray-300">-</span>;
  const twd = krwToTwd(krw, rate);
  if (twd === null)
    return <span className="font-medium text-gray-900">{formatWon(krw)}</span>;
  return (
    <span className="font-medium text-gray-900">
      {formatTwd(twd)}
      <span className="block text-xs font-normal text-gray-400">
        {formatWon(krw)}
      </span>
    </span>
  );
}

/** 달성률 셀 — % + 미니 프로그레스 바 */
function AchievementCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300 text-xs">목표 없음</span>;
  const pct = Math.min(100, value);
  return (
    <div className="min-w-[90px]">
      <p className="text-xs font-semibold text-gray-700 mb-1">
        {value.toFixed(1)}%
      </p>
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${value >= 100 ? "bg-green-500" : "bg-primary-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CampaignTable({ campaigns, stats = {} }: CampaignTableProps) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [statusFilter, setStatusFilter] = useState<StageFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ⋯ 관리 메뉴 — overflow 클리핑을 피하려고 버튼 좌표 기준 fixed 렌더링
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // 복사/삭제 다이얼로그 대상
  const [copyTarget, setCopyTarget] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("campaignViewMode");
    if (saved === "card" || saved === "table") setViewMode(saved);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const handleViewMode = (mode: "table" | "card") => {
    setViewMode(mode);
    localStorage.setItem("campaignViewMode", mode);
  };

  const stageOf = (c: Campaign): CampaignStage => resolveStage(c);

  const stageTabs: { key: StageFilter; label: string; count: number }[] = [
    { key: "all", label: "전체", count: campaigns.length },
    ...CAMPAIGN_STAGES.map((s) => ({
      key: s as StageFilter,
      label: STAGE_LABEL[s],
      count: campaigns.filter((c) => stageOf(c) === s).length,
    })),
  ];

  const statOf = (c: Campaign): CampaignStats =>
    stats[c.id] ?? { sales: 0, pendingCount: 0, achievement: null };

  const filtered = campaigns.filter((c) => {
    const matchSearch =
      c.campaign_name.toLowerCase().includes(search.toLowerCase()) ||
      c.client_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || stageOf(c) === statusFilter;
    return matchSearch && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "name":
        return a.campaign_name.localeCompare(b.campaign_name, "ko") * dir;
      case "sales":
        return (statOf(a).sales - statOf(b).sales) * dir;
      case "achievement":
        return ((statOf(a).achievement ?? -1) - (statOf(b).achievement ?? -1)) * dir;
      case "pending":
        return (statOf(a).pendingCount - statOf(b).pendingCount) * dir;
      case "start":
        return ((a.start_date ?? "").localeCompare(b.start_date ?? "")) * dir;
      case "created":
      default:
        return a.created_at.localeCompare(b.created_at) * dir;
    }
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 금액·건수는 큰 값부터, 텍스트·날짜는 취향대로 — 기본 내림차순
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortHeader = ({
    label,
    sortKey: key,
    className = "",
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) => (
    <th className={`table-header ${className}`}>
      <button
        onClick={() => handleSort(key)}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-800 transition-colors"
      >
        {label}
        <span className={`text-[10px] ${sortKey === key ? "text-primary-600" : "text-gray-300"}`}>
          {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </button>
    </th>
  );

  const openMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ id, x: rect.right, y: rect.bottom + 4 });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`"${deleteTarget.campaign_name}" 캠페인이 삭제되었습니다.`);
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async (withKols: boolean) => {
    if (!copyTarget) return;
    const campaign = copyTarget;
    setWorking(true);
    try {
      const supabase = createClient();
      const { data: newCampaign, error } = await supabase
        .from("campaigns")
        .insert({
          campaign_name: `${campaign.campaign_name} (복사)`,
          client_name: campaign.client_name,
          // 복사본은 아직 확정 전이므로 항상 가망 단계에서 시작한다
          status: "lead",
          // 같은 업체의 재진행이므로 가망건 출처는 그대로 이어받는다
          prospect_id: campaign.prospect_id,
          deal_type: campaign.deal_type,
          normal_price: campaign.normal_price,
          online_min_price: campaign.online_min_price,
          supply_price: campaign.supply_price,
          supply_vat_mode: campaign.supply_vat_mode,
          supply_price_tiers: campaign.supply_price_tiers,
          seller_quote_price: campaign.seller_quote_price,
          seller_quote_tiers: campaign.seller_quote_tiers,
          gonggu_price: campaign.gonggu_price,
          total_rs_rate: campaign.total_rs_rate,
          vendor_fee_rate: campaign.vendor_fee_rate,
          influencer_rs_rate: campaign.influencer_rs_rate,
          shipping_fee: campaign.shipping_fee,
          shipping_payer: campaign.shipping_payer,
          vat_included: campaign.vat_included,
          exchange_rate: campaign.exchange_rate,
          target_sales: campaign.target_sales,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          purchase_form_url: campaign.purchase_form_url,
          response_sheet_url: campaign.response_sheet_url,
          drive_url: campaign.drive_url,
        })
        .select()
        .single();
      if (error) throw error;

      // KOL 명단 복사 — 진행 상태(발송/업로드/정산)와 금액은 초기화하고 명단만 가져온다
      if (withKols) {
        const { data: srcKols, error: kolError } = await supabase
          .from("campaign_influencers")
          .select("influencer_id, purchase_url, settlement_method")
          .eq("campaign_id", campaign.id);
        if (kolError) throw kolError;
        if (srcKols && srcKols.length > 0) {
          const { error: insError } = await supabase
            .from("campaign_influencers")
            .insert(
              srcKols.map((k) => ({
                campaign_id: newCampaign.id,
                influencer_id: k.influencer_id,
                purchase_url: k.purchase_url,
                sheet_url: null,
                is_product_sent: false,
                sent_date: null,
                content_url: null,
                contents: [],
                is_uploaded: false,
                sales_amount: 0,
                quantity: 0,
                settlement_method: k.settlement_method,
                settlement_amount: 0,
                is_settled: false,
                settled_date: null,
                notes: null,
              }))
            );
          if (insError) throw insError;
        }
      }

      toast.success(
        withKols
          ? "캠페인과 KOL 명단이 복사되었습니다."
          : "캠페인 조건이 복사되었습니다."
      );
      setCopyTarget(null);
      router.push(`/campaigns/${newCampaign.id}`);
    } catch {
      toast.error("복사 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const menuCampaign = menu ? campaigns.find((c) => c.id === menu.id) : null;

  return (
    <div className="space-y-4">
      {/* 검색 + 뷰 토글 + 등록 버튼 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="캠페인명 또는 클라이언트명 검색"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 토글 버튼 */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewMode("table")}
              title="테이블뷰"
              className={`p-2 transition-colors ${viewMode === "table" ? "bg-primary-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
              </svg>
            </button>
            <button
              onClick={() => handleViewMode("card")}
              title="카드뷰"
              className={`p-2 transition-colors ${viewMode === "card" ? "bg-primary-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>
          <Link href="/campaigns/new" className="btn-primary whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            신규 캠페인 등록
          </Link>
        </div>
      </div>

      {/* 진행 단계 탭 필터 */}
      <div className="flex items-center gap-1 flex-wrap">
        {stageTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`btn btn-sm flex items-center gap-1.5 ${
              statusFilter === tab.key ? "btn-primary" : "btn-secondary"
            }`}
          >
            {tab.label}
            <span
              className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                statusFilter === tab.key
                  ? "bg-white/30 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 카드뷰 */}
      {viewMode === "card" ? (
        <>
          {sorted.length === 0 ? (
            <div className="card py-16 text-center text-gray-400 text-sm">
              {search ? "검색 결과가 없습니다." : "등록된 캠페인이 없습니다."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sorted.map((campaign) => {
                const stage = stageOf(campaign);
                const stat = statOf(campaign);
                return (
                  <div
                    key={campaign.id}
                    onClick={() => router.push(`/campaigns/${campaign.id}`)}
                    className="card p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{campaign.campaign_name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{campaign.client_name}</p>
                      </div>
                      <div className="ml-2 shrink-0">
                        <StageSelect campaignId={campaign.id} stage={stage} />
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>
                        공구 기간:{" "}
                        {campaign.start_date && campaign.end_date
                          ? `${formatDate(campaign.start_date)} ~ ${formatDate(campaign.end_date)}`
                          : campaign.start_date
                          ? `${formatDate(campaign.start_date)} ~`
                          : "-"}
                      </p>
                      <p>
                        취급액:{" "}
                        {stat.sales > 0
                          ? formatMoney(stat.sales, campaign.exchange_rate)
                          : "-"}
                        {stat.pendingCount > 0 && (
                          <span className="ml-1.5 text-orange-500 font-medium">
                            정산대기 {stat.pendingCount}
                          </span>
                        )}
                      </p>
                    </div>
                    {stat.achievement !== null && (
                      <AchievementCell value={stat.achievement} />
                    )}
                    <div
                      className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/campaigns/${campaign.id}`} className="btn-primary btn-sm flex-1 text-center">
                        상세보기
                      </Link>
                      <Link href={`/campaigns/${campaign.id}/edit`} className="btn-secondary btn-sm">
                        수정
                      </Link>
                      <button
                        onClick={() => setCopyTarget(campaign)}
                        className="btn-secondary btn-sm"
                        title="캠페인 복사"
                      >
                        복사
                      </button>
                      <button
                        onClick={() => setDeleteTarget(campaign)}
                        className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-xs text-gray-500 px-1">
            총 {sorted.length}개 캠페인{search && ` (전체 ${campaigns.length}개 중)`}
          </div>
        </>
      ) : (
        /* 테이블뷰 */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <SortHeader label="캠페인명" sortKey="name" />
                  <th className="table-header">클라이언트</th>
                  <th className="table-header">공구가</th>
                  <SortHeader label="취급액" sortKey="sales" />
                  <SortHeader label="달성률" sortKey="achievement" />
                  <SortHeader label="정산대기" sortKey="pending" />
                  <SortHeader label="기간" sortKey="start" />
                  <th className="table-header">단계</th>
                  <th className="table-header text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-gray-400 text-sm">
                      {search ? "검색 결과가 없습니다." : "등록된 캠페인이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  sorted.map((campaign) => {
                    const stage = stageOf(campaign);
                    const stat = statOf(campaign);
                    return (
                      <tr
                        key={campaign.id}
                        onClick={() => router.push(`/campaigns/${campaign.id}`)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="table-cell">
                          <span className="font-medium text-primary-600">
                            {campaign.campaign_name}
                          </span>
                        </td>
                        <td className="table-cell text-gray-600">{campaign.client_name}</td>
                        <td className="table-cell text-gray-500 text-xs whitespace-nowrap">
                          {campaign.gonggu_price
                            ? formatMoney(campaign.gonggu_price, campaign.exchange_rate)
                            : "-"}
                        </td>
                        <td className="table-cell whitespace-nowrap">
                          <MoneyCell krw={stat.sales} rate={campaign.exchange_rate} />
                        </td>
                        <td className="table-cell">
                          <AchievementCell value={stat.achievement} />
                        </td>
                        <td className="table-cell">
                          {stat.pendingCount > 0 ? (
                            <span className="badge bg-orange-100 text-orange-700">
                              {stat.pendingCount}건
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">-</span>
                          )}
                        </td>
                        <td className="table-cell text-gray-500 text-xs whitespace-nowrap">
                          {campaign.start_date || campaign.end_date
                            ? `${formatDate(campaign.start_date)} ~ ${formatDate(campaign.end_date)}`
                            : "-"}
                        </td>
                        <td className="table-cell">
                          <StageSelect campaignId={campaign.id} stage={stage} />
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center justify-end">
                            <button
                              onClick={(e) => openMenu(e, campaign.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                              title="관리 메뉴"
                            >
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 8a2 2 0 100-4 2 2 0 000 4zM12 14a2 2 0 100-4 2 2 0 000 4zM12 20a2 2 0 100-4 2 2 0 000 4z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 결과 카운트 */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              총 {sorted.length}개 캠페인
              {search && ` (전체 ${campaigns.length}개 중)`}
            </p>
          </div>
        </div>
      )}

      {/* ⋯ 관리 드롭다운 — fixed 좌표 렌더링 */}
      {menu && menuCampaign && (
        <div
          className="fixed z-[80] w-36 bg-white border border-gray-200 rounded-xl shadow-lg py-1"
          style={{ top: menu.y, left: menu.x, transform: "translateX(-100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/campaigns/${menuCampaign.id}/edit`}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setMenu(null)}
          >
            수정
          </Link>
          <button
            onClick={() => {
              setCopyTarget(menuCampaign);
              setMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            복사
          </button>
          <button
            onClick={() => {
              setDeleteTarget(menuCampaign);
              setMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      )}

      {/* 복사 다이얼로그 — 복사 범위 안내 + KOL 명단 복사 옵션 */}
      <ConfirmDialog
        open={copyTarget !== null}
        title="캠페인 복사"
        description={
          <>
            <b className="text-gray-800">
              &quot;{copyTarget?.campaign_name}&quot;
            </b>
            의 가격 조건·기간·링크가 새 캠페인으로 복사됩니다.
            <br />
            셀러 명단과 판매·정산 실적은 복사되지 않습니다.
          </>
        }
        confirmLabel="복사"
        checkboxLabel="KOL 명단도 함께 복사 (발송·업로드·정산 상태는 초기화)"
        loading={working}
        onConfirm={handleCopy}
        onClose={() => setCopyTarget(null)}
      />

      {/* 삭제 다이얼로그 — 캠페인명 입력 확인 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="캠페인 삭제"
        danger
        description={
          <>
            이 캠페인의 <b className="text-red-600">KOL·셀러 데이터가 모두 함께 삭제</b>
            되며 되돌릴 수 없습니다. 재무관리 시스템에 이미 기록된 확정 실적은
            삭제되지 않고 남습니다.
          </>
        }
        confirmLabel="영구 삭제"
        requireText={deleteTarget?.campaign_name}
        loading={working}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
