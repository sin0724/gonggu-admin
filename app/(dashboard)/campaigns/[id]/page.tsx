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

  const gonguPrice = campaign.gonggu_price ?? 0;
  const vendorFeeRate = campaign.vendor_fee_rate ?? 0;
  const influencerRsRate = campaign.influencer_rs_rate ?? 0;
  const vendorFeeAmount = gonguPrice * (vendorFeeRate / 100);
  const influencerRsAmount = gonguPrice * (influencerRsRate / 100);
  const brandAmount = gonguPrice - vendorFeeAmount - influencerRsAmount;
  const brandRate = gonguPrice > 0 ? (brandAmount / gonguPrice) * 100 : 0;
  const formatCurrency = (n: number) =>
    n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/campaigns" className="hover:text-gray-700">
          캠페인 관리
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{campaign.campaign_name}</span>
      </nav>

      {/* 캠페인 정보 카드 */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">
                {campaign.campaign_name}
              </h1>
              <span
                className={`badge ${
                  active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {active ? "진행중" : "종료"}
              </span>
            </div>
            <p className="text-gray-500 text-sm">{campaign.client_name}</p>
          </div>
          <Link
            href={`/campaigns/${id}/edit`}
            className="btn-secondary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            캠페인 수정
          </Link>
        </div>

        {/* RS 수익 구조 */}
        {gonguPrice > 0 && (
          <div className="mb-6 bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">RS 수익 구조</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">공구가</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(gonguPrice)}원</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">밴더 수수료</p>
                <p className="text-sm font-semibold text-red-600">-{formatCurrency(vendorFeeAmount)}원</p>
                <p className="text-xs text-gray-400">{vendorFeeRate}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">인플루언서 RS</p>
                <p className="text-sm font-semibold text-blue-600">-{formatCurrency(influencerRsAmount)}원</p>
                <p className="text-xs text-gray-400">{influencerRsRate}%</p>
              </div>
              <div className="text-center bg-white rounded-md p-2 border border-gray-200">
                <p className="text-xs text-gray-400 mb-1">브랜드 수익</p>
                <p className="text-sm font-bold text-green-600">{formatCurrency(brandAmount)}원</p>
                <p className="text-xs text-gray-400">{brandRate.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">공구 기간</p>
            <p className="text-sm text-gray-900">
              {campaign.start_date && campaign.end_date
                ? `${formatDate(campaign.start_date)} ~ ${formatDate(campaign.end_date)}`
                : campaign.start_date
                ? `${formatDate(campaign.start_date)} ~`
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">구매 양식</p>
            {campaign.purchase_form_url ? (
              <a
                href={campaign.purchase_form_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:underline"
              >
                링크 열기
              </a>
            ) : (
              <p className="text-sm text-gray-400">-</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">구글 드라이브</p>
            {campaign.drive_url ? (
              <a
                href={campaign.drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:underline"
              >
                드라이브 열기
              </a>
            ) : (
              <p className="text-sm text-gray-400">-</p>
            )}
          </div>
        </div>
      </div>

      {/* 인플루언서 섹션 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">참여 인플루언서</h2>
        <InfluencerTable campaignId={id} records={records} />
      </div>
    </div>
  );
}
