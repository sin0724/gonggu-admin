import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formatDate,
  getCampaignStatus,
  CAMPAIGN_STATUS_COLORS,
  formatWon,
  formatTwd,
  formatMoney,
  krwToTwd,
} from "@/lib/utils";
import InfluencerTable from "@/components/influencers/influencer-table";
import SellerTable from "@/components/sellers/seller-table";
import {
  distributeSales,
  resolveTierPrice,
  supplyNetCost,
  SupplyVatMode,
} from "@/lib/economics";
import {
  CampaignInfluencerWithDetails,
  CampaignSeller,
  PriceTier,
} from "@/types/database";

/** KPI 카드용 금액 — TWD를 메인으로, 원화를 보조로 표기. 환율 없으면 원화만. */
function MoneyKpi({
  krw,
  rate,
  className,
  unitClassName,
}: {
  krw: number;
  rate: number | null;
  className: string;
  unitClassName: string;
}) {
  const twd = krwToTwd(krw, rate);
  if (twd === null) {
    return (
      <p className={className}>
        {Math.round(krw).toLocaleString("ko-KR")}
        <span className={unitClassName}>원</span>
      </p>
    );
  }
  return (
    <>
      <p className={className}>{formatTwd(twd)}</p>
      <p className="text-xs text-gray-400 mt-0.5">{formatWon(krw)}</p>
    </>
  );
}

interface CampaignDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({
  params,
}: CampaignDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const { data: rawRecords } = await supabase
    .from("campaign_influencers")
    .select("*, influencer:influencers(*)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  // 캠페인 셀러 — 총판/개별 셀러/공동구매 업체 통합 채널
  const { data: rawSellers } = await supabase
    .from("campaign_sellers")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  // 재무 확정 취급액 — 재무관리 시스템에서 월별로 동기화 (읽기 전용)
  const { data: financeRows } = await supabase
    .from("campaign_finance")
    .select("year, month, confirmed_sales, synced_at")
    .eq("campaign_id", id)
    .order("year")
    .order("month");
  const confirmedTotal = (financeRows ?? []).reduce(
    (sum, r) => sum + (r.confirmed_sales || 0),
    0
  );

  const records = (rawRecords ?? []) as CampaignInfluencerWithDetails[];
  const campaignStatus = getCampaignStatus(campaign.start_date, campaign.end_date);

  const vendorFeeRate = campaign.vendor_fee_rate ?? 0;
  const influencerRsRate = campaign.influencer_rs_rate ?? 0;
  const supplyPrice = campaign.supply_price ?? 0;
  const sellerQuotePrice = campaign.seller_quote_price ?? 0;
  const rate = campaign.exchange_rate;

  const formatCurrency = (n: number) =>
    n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  // KPI 계산 — 돈 흐름 모델:
  //   클라이언트 정산액 = 수량 × 공급가 (클라이언트 몫)
  //   벤더사 마진 = 판매액 − 클라이언트 정산액 − KOL 지급액 (잔여분)
  const totalSales = records.reduce((sum, r) => sum + (r.sales_amount || 0), 0);
  const totalSettlement = records.reduce((sum, r) => sum + (r.settlement_amount || 0), 0);
  const totalKolRs = totalSettlement > 0 ? totalSettlement : totalSales * (influencerRsRate / 100);

  // 판매 수량 (직접 입력 합계, 없으면 공구가로 추정)
  const inputQuantity = records.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const estimatedQuantity =
    campaign.gonggu_price && campaign.gonggu_price > 0
      ? Math.round(totalSales / campaign.gonggu_price)
      : 0;
  const quantity = inputQuantity > 0 ? inputQuantity : estimatedQuantity;
  const isQuantityEstimated = inputQuantity === 0 && estimatedQuantity > 0;

  // 딜 방식별 분배: RS형 = 판매액 × (1−총RS%)가 클라이언트 몫,
  //                공급가형 = 수량 × 공급가가 클라이언트 몫. 벤더 마진은 잔여분.
  const dealType = campaign.deal_type === "supply" ? "supply" : "rs";
  const totalRsEff =
    campaign.total_rs_rate ?? influencerRsRate + vendorFeeRate;

  // ── 셀러 채널 (공급가형): 셀러가 견적 단가로 구매해가는 B2B 공급 ──
  const sellers = (rawSellers ?? []) as CampaignSeller[];
  const supplyTiers = (campaign.supply_price_tiers ?? []) as PriceTier[];
  const quoteTiers = (campaign.seller_quote_tiers ?? []) as PriceTier[];
  const sellerQty = sellers.reduce((sum, s) => sum + (s.quantity || 0), 0);
  // 셀러별 견적 단가: 개별 단가 우선, 없으면 캠페인 구간 단가를 그 셀러 수량으로 결정
  const effQuoteFor = (s: CampaignSeller) =>
    s.quote_price ?? resolveTierPrice(sellerQuotePrice, quoteTiers, s.quantity || 0);
  const sellerRevenue = sellers.reduce(
    (sum, s) => sum + (s.quantity || 0) * effQuoteFor(s),
    0
  );
  // 브랜드 공급가 구간은 우리 총 발주량(KOL 직접 + 셀러) 기준으로 결정
  const totalQty = quantity + sellerQty;
  const effSupplyPrice = resolveTierPrice(supplyPrice, supplyTiers, totalQty);
  // 마진은 공급가 실질 원가 기준 — 부가세 포함 매입이면 매입세액공제(÷1.1) 반영
  const supplyVatMode: SupplyVatMode =
    campaign.supply_vat_mode === "zero" ? "zero" : "taxed";
  const effSupplyCost = supplyNetCost(effSupplyPrice, supplyVatMode);
  const sellerMargin =
    supplyPrice > 0 ? sellerRevenue - sellerQty * effSupplyCost : 0;
  const hasSellerChannel = dealType === "supply" && sellers.length > 0;

  const isRsDeal = dealType === "rs" && totalRsEff > 0;
  const isSupplyDeal =
    dealType === "supply" && supplyPrice > 0 && (quantity > 0 || sellerQty > 0);

  let clientPayout: number;
  let totalVendorMargin: number;
  let payoutNote: string;
  let vendorNote: string;
  if (isRsDeal) {
    clientPayout = totalSales * (1 - totalRsEff / 100);
    totalVendorMargin = totalSales - clientPayout - totalKolRs;
    payoutNote = `판매액 × ${100 - totalRsEff}% (RS형)`;
    vendorNote = `판매액 × 총 RS ${totalRsEff}% − KOL 지급액`;
  } else if (isSupplyDeal) {
    // 브랜드 정산은 공급가 그대로, 마진은 실질 원가(effSupplyCost) 기준
    clientPayout = totalQty * effSupplyPrice;
    const vatNote = supplyVatMode === "taxed" ? " · 실질 원가(÷1.1) 기준" : "";
    if (hasSellerChannel) {
      // 셀러 등록됨: KOL 직접 판매 채널 + 셀러 공급 채널을 합산
      const kolChannelMargin =
        totalSales - quantity * effSupplyCost - totalKolRs;
      totalVendorMargin = kolChannelMargin + sellerMargin;
      vendorNote = `KOL 직접(판매액 − 수량×원가 − RS) + 셀러(수량×(견적가 − 원가))${vatNote}${isQuantityEstimated ? " · KOL 수량 추정" : ""}`;
    } else if (sellerQuotePrice > 0) {
      // 셀러 미등록 + 견적가만 있음: 전량 셀러 경유로 추정 (기존 로직)
      totalVendorMargin = quantity * (sellerQuotePrice - effSupplyCost) - totalKolRs;
      vendorNote = `수량 × (견적가 ${formatMoney(sellerQuotePrice, rate)} − 원가) − KOL${vatNote}${isQuantityEstimated ? " · 수량 추정" : ""}`;
    } else {
      totalVendorMargin = totalSales - quantity * effSupplyCost - totalKolRs;
      vendorNote = `판매액 − 공급 원가 − KOL${vatNote}${isQuantityEstimated ? " · 수량 추정" : ""}`;
    }
    payoutNote = `총수량 ${formatCurrency(totalQty)} × 공급가 ${formatMoney(effSupplyPrice, rate)}${supplyTiers.length > 0 ? " (구간 적용)" : ""}${isQuantityEstimated ? " · 수량 추정" : ""}`;
  } else {
    totalVendorMargin = totalSales * (vendorFeeRate / 100);
    clientPayout = totalSales - totalVendorMargin - totalKolRs;
    payoutNote = "판매액 − 총 RS (조건 미입력 시 추정)";
    vendorNote = `판매액 × ${vendorFeeRate}% (추정)`;
  }

  // 전체 취급액 = KOL 판매액(소비자 판매) + 셀러 공급액(B2B)
  const combinedSales = totalSales + sellerRevenue;

  const notUploadedCount = records.filter((r) => r.is_product_sent && !r.is_uploaded).length;
  const notSettledCount = records.filter((r) => r.is_uploaded && !r.is_settled).length;

  // 목표 KPI — 목표 판매액 분배 + 달성률
  const targetSales = campaign.target_sales ?? 0;
  const targetDist =
    targetSales > 0
      ? distributeSales({
          dealType,
          sales: targetSales,
          gongguPrice: campaign.gonggu_price ?? 0,
          supplyPrice,
          sellerQuotePrice,
          supplyVatMode,
          influencerRsRate,
          vendorFeeRate,
          totalRsRate: campaign.total_rs_rate ?? null,
        })
      : null;
  // 달성률은 KOL 판매 + 셀러 공급을 합친 취급액 기준
  const achievementRate =
    targetSales > 0 ? Math.min(100, (combinedSales / targetSales) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/campaigns" className="hover:text-gray-700">캠페인 관리</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{campaign.campaign_name}</span>
      </nav>

      {/* ① 캠페인 헤더 */}
      <div className="card p-5">
        {/* 타이틀 행 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-lg font-bold text-gray-900">{campaign.campaign_name}</h1>
              <span className={`badge ${CAMPAIGN_STATUS_COLORS[campaignStatus]}`}>
                {campaignStatus}
              </span>
            </div>
            <p className="text-sm text-gray-500">{campaign.client_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/campaigns/${id}/proposal`} className="btn-secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              클라이언트 제안서
            </Link>
            <Link href={`/campaigns/${id}/edit`} className="btn-secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              수정
            </Link>
          </div>
        </div>

        {/* 메타 정보 행 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm border-t border-gray-100 pt-4">
          {/* 공구 기간 */}
          <div className="flex items-center gap-1.5 text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {campaign.start_date && campaign.end_date
              ? `${formatDate(campaign.start_date)} ~ ${formatDate(campaign.end_date)}`
              : campaign.start_date ? `${formatDate(campaign.start_date)} ~` : "기간 미설정"}
          </div>

          {/* RS 구조 */}
          {campaign.gonggu_price && (
            <div className="flex items-center gap-1.5 text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {campaign.normal_price && (
                <>
                  <span className="text-gray-400 line-through text-xs">
                    {krwToTwd(campaign.normal_price, rate) !== null
                      ? formatTwd(krwToTwd(campaign.normal_price, rate)!)
                      : formatWon(campaign.normal_price)}
                  </span>
                  <span className="text-red-500 text-xs font-medium">
                    {(((campaign.normal_price - campaign.gonggu_price) / campaign.normal_price) * 100).toFixed(0)}%↓
                  </span>
                  <span className="text-gray-300">|</span>
                </>
              )}
              공구가 {formatMoney(campaign.gonggu_price, rate)}
              {dealType === "supply" && supplyPrice > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>공급가 {formatMoney(supplyPrice, rate)}</span>
                </>
              )}
              {dealType === "supply" && sellerQuotePrice > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-teal-600 font-medium">
                    셀러 견적가 {formatMoney(sellerQuotePrice, rate)}
                  </span>
                </>
              )}
              <span className="text-gray-300">|</span>
              <span className="text-blue-600 font-medium">벤더 {vendorFeeRate}%</span>
              <span className="text-gray-300">|</span>
              <span>KOL RS {influencerRsRate}%</span>
              {campaign.total_rs_rate && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">승인 총 RS {campaign.total_rs_rate}%</span>
                </>
              )}
            </div>
          )}

          {/* 링크들 */}
          {campaign.purchase_form_url && (
            <a href={campaign.purchase_form_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              공통 구매 링크
            </a>
          )}
          {campaign.drive_url && (
            <a href={campaign.drive_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              KOL 가이드
            </a>
          )}
        </div>
      </div>

      {/* 재무 확정 취급액 — 재무관리 시스템 동기화 데이터 */}
      {financeRows && financeRows.length > 0 && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              확정 취급액
              <span className="ml-2 badge bg-purple-100 text-purple-700">재무 확정</span>
            </h2>
            <span className="text-sm text-gray-500">
              누적 <b className="text-gray-900">{formatMoney(confirmedTotal, rate)}</b>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {financeRows.map((r) => (
              <div
                key={`${r.year}-${r.month}`}
                className="rounded-lg bg-purple-50 px-3 py-2 text-sm"
              >
                <span className="text-purple-500 text-xs mr-2">{r.year}년 {r.month}월</span>
                <span className="font-semibold text-purple-900">
                  {formatMoney(r.confirmed_sales, rate)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            재무관리 시스템에서 확정된 월별 취급액입니다.
          </p>
        </div>
      )}

      {/* 목표 KPI · 재원 분배 */}
      {targetDist && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              목표 KPI · 재원 분배
            </h2>
            <span className="text-sm text-gray-500">
              목표 판매액{" "}
              <b className="text-gray-900">{formatMoney(targetSales, rate)}</b>
              {targetDist.quantity !== null &&
                ` · 추정 ${targetDist.quantity.toLocaleString("ko-KR")}개`}
            </span>
          </div>

          {/* 달성률 */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">
                목표 달성률 ·{" "}
                <span className="font-semibold text-gray-700">
                  {(targetSales > 0 ? (combinedSales / targetSales) * 100 : 0).toFixed(1)}%
                </span>
              </span>
              <span className="text-gray-400">
                {formatMoney(combinedSales, rate)} / {formatMoney(targetSales, rate)}
                {hasSellerChannel && " · KOL+셀러 합산"}
              </span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full"
                style={{ width: `${achievementRate}%` }}
              />
            </div>
          </div>

          {/* 목표 달성 시 분배 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="card p-4 border-green-200 bg-green-50">
              <p className="text-xs text-green-600 font-medium mb-1">
                클라이언트 정산액 (목표)
              </p>
              <MoneyKpi
                krw={targetDist.clientTake}
                rate={rate}
                className="text-xl font-bold text-green-700"
                unitClassName="text-xs font-normal text-green-400 ml-0.5"
              />
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-400 mb-1">KOL RS 지급액 (목표)</p>
              <MoneyKpi
                krw={targetDist.kolPayout}
                rate={rate}
                className="text-xl font-bold text-purple-600"
                unitClassName="text-xs font-normal text-gray-400 ml-0.5"
              />
            </div>
            <div className="card p-4 border-blue-200 bg-blue-50">
              <p className="text-xs text-blue-600 font-medium mb-1">
                벤더사 마진 (목표 · 우리)
              </p>
              <MoneyKpi
                krw={targetDist.vendorMargin}
                rate={rate}
                className={`text-xl font-bold ${targetDist.vendorMargin >= 0 ? "text-blue-700" : "text-red-600"}`}
                unitClassName="text-xs font-normal text-blue-400 ml-0.5"
              />
            </div>
          </div>
        </div>
      )}

      {/* ② KPI 한 줄 */}
      {(records.length > 0 || sellers.length > 0) && (
        <div
          className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${
            hasSellerChannel ? "lg:grid-cols-8" : "lg:grid-cols-7"
          }`}
        >
          {/* 참여 인원 */}
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">참여 KOL · 셀러</p>
            <p className="text-2xl font-bold text-gray-900">
              {records.length}
              <span className="text-sm font-normal text-gray-400 ml-0.5">명</span>
              {sellers.length > 0 && (
                <span className="text-sm font-normal text-gray-500 ml-1.5">
                  +{sellers.length}
                  <span className="text-xs text-gray-400">셀러</span>
                </span>
              )}
            </p>
          </div>

          {/* 총 취급액 = KOL 판매 + 셀러 공급 */}
          <div className="card p-4 col-span-1 md:col-span-1">
            <p className="text-xs text-gray-400 mb-1">
              {hasSellerChannel ? "총 취급액 (KOL+셀러)" : "총 판매액"}
            </p>
            <MoneyKpi
              krw={combinedSales}
              rate={rate}
              className="text-xl font-bold text-gray-900"
              unitClassName="text-xs font-normal text-gray-400 ml-0.5"
            />
            {hasSellerChannel ? (
              <p className="text-xs text-gray-400 mt-0.5">
                KOL {formatMoney(totalSales, rate)} · 셀러{" "}
                {formatMoney(sellerRevenue, rate)}
              </p>
            ) : (
              quantity > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatCurrency(quantity)}개{isQuantityEstimated && " (추정)"}
                </p>
              )
            )}
          </div>

          {/* 셀러 공급액 (B2B 채널) */}
          {hasSellerChannel && (
            <div className="card p-4 border-teal-200 bg-teal-50">
              <p className="text-xs text-teal-600 font-medium mb-1">
                셀러 공급액 (우리 매출)
              </p>
              <MoneyKpi
                krw={sellerRevenue}
                rate={rate}
                className="text-xl font-bold text-teal-700"
                unitClassName="text-xs font-normal text-teal-400 ml-0.5"
              />
              <p className="text-xs text-teal-500 mt-0.5">
                {formatCurrency(sellerQty)}세트 · 마진{" "}
                {formatMoney(sellerMargin, rate)}
              </p>
            </div>
          )}

          {/* 벤더사 마진 - 가장 중요 */}
          <div className="card p-4 border-blue-200 bg-blue-50 col-span-1">
            <p className="text-xs text-blue-500 font-medium mb-1">벤더사 마진 (우리)</p>
            <MoneyKpi
              krw={totalVendorMargin}
              rate={rate}
              className={`text-xl font-bold ${totalVendorMargin >= 0 ? "text-blue-700" : "text-red-600"}`}
              unitClassName="text-xs font-normal text-blue-400 ml-0.5"
            />
            <p className="text-xs text-blue-400 mt-0.5">{vendorNote}</p>
          </div>

          {/* KOL RS 지급액 */}
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">KOL RS 지급액</p>
            <MoneyKpi
              krw={totalKolRs}
              rate={rate}
              className="text-xl font-bold text-purple-600"
              unitClassName="text-xs font-normal text-gray-400 ml-0.5"
            />
            <p className="text-xs text-gray-400 mt-0.5">
              {totalSettlement > 0 ? "실제 정산액 기준" : `판매액 × ${influencerRsRate}%`}
            </p>
          </div>

          {/* 클라이언트 정산액 */}
          <div className="card p-4 border-green-200 bg-green-50">
            <p className="text-xs text-green-500 font-medium mb-1">클라이언트 정산액</p>
            <MoneyKpi
              krw={clientPayout}
              rate={rate}
              className="text-xl font-bold text-green-700"
              unitClassName="text-xs font-normal text-green-400 ml-0.5"
            />
            <p className="text-xs text-green-400 mt-0.5">{payoutNote}</p>
          </div>

          {/* 미업로드 */}
          <div className={`card p-4 ${notUploadedCount > 0 ? "border-yellow-200 bg-yellow-50" : ""}`}>
            <p className={`text-xs mb-1 ${notUploadedCount > 0 ? "text-yellow-500 font-medium" : "text-gray-400"}`}>미업로드</p>
            <p className={`text-2xl font-bold ${notUploadedCount > 0 ? "text-yellow-600" : "text-gray-300"}`}>
              {notUploadedCount}<span className="text-sm font-normal ml-0.5">명</span>
            </p>
          </div>

          {/* 미정산 */}
          <div className={`card p-4 ${notSettledCount > 0 ? "border-orange-200 bg-orange-50" : ""}`}>
            <p className={`text-xs mb-1 ${notSettledCount > 0 ? "text-orange-500 font-medium" : "text-gray-400"}`}>미정산</p>
            <p className={`text-2xl font-bold ${notSettledCount > 0 ? "text-orange-600" : "text-gray-300"}`}>
              {notSettledCount}<span className="text-sm font-normal ml-0.5">명</span>
            </p>
          </div>
        </div>
      )}

      {/* ③ 셀러 테이블 — 총판/개별 셀러/공동구매 업체 (공급가형 채널) */}
      {(dealType === "supply" || sellers.length > 0) && (
        <SellerTable
          campaignId={id}
          sellers={sellers}
          campaignQuotePrice={sellerQuotePrice}
          quoteTiers={quoteTiers}
          effectiveSupplyCost={effSupplyCost}
          exchangeRate={rate}
        />
      )}

      {/* ④ 인플루언서 테이블 */}
      <div>
        <InfluencerTable
          campaignId={id}
          records={records}
          campaignInfluencerRsRate={campaign.influencer_rs_rate ?? undefined}
          campaignPurchaseFormUrl={campaign.purchase_form_url ?? undefined}
          campaignExchangeRate={rate}
        />
      </div>
    </div>
  );
}
