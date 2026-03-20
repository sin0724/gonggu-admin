import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { isCampaignActive } from "@/lib/utils";
import InfluencerTable from "@/components/influencers/influencer-table";
import { CampaignInfluencerWithDetails } from "@/types/database";

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

  const records = (rawRecords ?? []) as CampaignInfluencerWithDetails[];
  const active = isCampaignActive(campaign.start_date, campaign.end_date);

  const vendorFeeRate = campaign.vendor_fee_rate ?? 0;
  const influencerRsRate = campaign.influencer_rs_rate ?? 0;

  const formatCurrency = (n: number) =>
    n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  // KPI 계산
  const totalSales = records.reduce((sum, r) => sum + (r.sales_amount || 0), 0);
  const totalSettlement = records.reduce((sum, r) => sum + (r.settlement_amount || 0), 0);
  const totalVendorFee = totalSales * (vendorFeeRate / 100);
  const totalInfluencerRs = totalSales * (influencerRsRate / 100);
  const totalBrandProfit = totalSales - totalVendorFee - totalInfluencerRs;
  const notUploadedCount = records.filter((r) => r.is_product_sent && !r.is_uploaded).length;
  const notSettledCount = records.filter((r) => r.is_uploaded && !r.is_settled).length;

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
              <span className={`badge ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {active ? "진행중" : "종료"}
              </span>
            </div>
            <p className="text-sm text-gray-500">{campaign.client_name}</p>
          </div>
          <Link href={`/campaigns/${id}/edit`} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            수정
          </Link>
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
                  <span className="text-gray-400 line-through text-xs">{formatCurrency(campaign.normal_price)}원</span>
                  <span className="text-red-500 text-xs font-medium">
                    {(((campaign.normal_price - campaign.gonggu_price) / campaign.normal_price) * 100).toFixed(0)}%↓
                  </span>
                  <span className="text-gray-300">|</span>
                </>
              )}
              공구가 {formatCurrency(campaign.gonggu_price)}원
              <span className="text-gray-300">|</span>
              <span className="text-blue-600 font-medium">밴더 {vendorFeeRate}%</span>
              <span className="text-gray-300">|</span>
              <span>RS {influencerRsRate}%</span>
            </div>
          )}

          {/* 링크들 */}
          {campaign.purchase_form_url && (
            <a href={campaign.purchase_form_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              구매 양식
            </a>
          )}
          {campaign.response_sheet_url && (
            <a href={campaign.response_sheet_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              응답 시트
            </a>
          )}
          {campaign.drive_url && (
            <a href={campaign.drive_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary-600 hover:text-primary-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              구글 드라이브
            </a>
          )}
        </div>
      </div>

      {/* ② KPI 한 줄 */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* 참여 인원 */}
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">참여 인원</p>
            <p className="text-2xl font-bold text-gray-900">{records.length}<span className="text-sm font-normal text-gray-400 ml-0.5">명</span></p>
          </div>

          {/* 총 판매액 */}
          <div className="card p-4 col-span-1 md:col-span-1">
            <p className="text-xs text-gray-400 mb-1">총 판매액</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalSales)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
          </div>

          {/* 밴더 수수료 - 가장 중요 */}
          <div className="card p-4 border-blue-200 bg-blue-50 col-span-1">
            <p className="text-xs text-blue-500 font-medium mb-1">밴더사 수수료</p>
            <p className="text-xl font-bold text-blue-700">{formatCurrency(totalVendorFee)}<span className="text-xs font-normal text-blue-400 ml-0.5">원</span></p>
            <p className="text-xs text-blue-400 mt-0.5">{vendorFeeRate}%</p>
          </div>

          {/* 인플루언서 RS */}
          <div className="card p-4">
            <p className="text-xs text-gray-400 mb-1">인플루언서 RS</p>
            <p className="text-xl font-bold text-gray-700">{formatCurrency(totalInfluencerRs)}<span className="text-xs font-normal text-gray-400 ml-0.5">원</span></p>
            <p className="text-xs text-gray-400 mt-0.5">{influencerRsRate}%</p>
          </div>

          {/* 브랜드 수익 */}
          <div className="card p-4 border-green-200 bg-green-50">
            <p className="text-xs text-green-500 font-medium mb-1">브랜드 수익</p>
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalBrandProfit)}<span className="text-xs font-normal text-green-400 ml-0.5">원</span></p>
            <p className="text-xs text-green-400 mt-0.5">{totalSales > 0 ? ((totalBrandProfit / totalSales) * 100).toFixed(1) : 0}%</p>
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

      {/* ③ 인플루언서 테이블 */}
      <div>
        <InfluencerTable
          campaignId={id}
          records={records}
          campaignInfluencerRsRate={campaign.influencer_rs_rate ?? undefined}
          campaignPurchaseFormUrl={campaign.purchase_form_url ?? undefined}
        />
      </div>
    </div>
  );
}
