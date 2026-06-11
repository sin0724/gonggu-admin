import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { computeUnitEconomics } from "@/lib/economics";
import PrintButton from "@/components/campaigns/print-button";

// 클라이언트 제안서 — 외부 공유용.
// 공급가, 벤더/KOL RS 분배, 벤더사 마진은 절대 노출하지 않는다. 총 RS만 표시.

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const gongguPrice = campaign.gonggu_price ?? 0;
  const normalPrice = campaign.normal_price ?? 0;
  const onlineMinPrice = campaign.online_min_price ?? 0;
  const supplyPrice = campaign.supply_price ?? 0;
  const vatIncluded = campaign.vat_included !== false;
  // 제안서에는 분배 내역 없이 총 RS만 노출
  const totalRsRate =
    campaign.total_rs_rate ??
    (campaign.influencer_rs_rate ?? 0) + (campaign.vendor_fee_rate ?? 0);

  const dealType = campaign.deal_type === "supply" ? "supply" : "rs";
  const econ = computeUnitEconomics({
    dealType,
    gongguPrice,
    supplyPrice,
    influencerRsRate: campaign.influencer_rs_rate ?? 0,
    vendorFeeRate: campaign.vendor_fee_rate ?? 0,
    totalRsRate,
    vatIncluded,
    normalPrice,
    onlineMinPrice,
  });

  const fmt = (n: number) =>
    n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  const totalRsAmount = gongguPrice * (totalRsRate / 100);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 상단 도구 (인쇄 시 숨김) */}
      <div className="flex items-center justify-between print:hidden">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/campaigns" className="hover:text-gray-700">캠페인 관리</Link>
          <span>/</span>
          <Link href={`/campaigns/${id}`} className="hover:text-gray-700">
            {campaign.campaign_name}
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">클라이언트 제안서</span>
        </nav>
        <PrintButton />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700 print:hidden">
        이 화면은 클라이언트 공유용입니다. 공급가, RS 분배 내역(KOL/벤더), 벤더사
        마진은 표시되지 않습니다. 우측 상단 버튼으로 인쇄하거나 PDF로 저장해
        전달하세요.
      </div>

      {/* ── 제안서 본문 ── */}
      <div className="card p-8 space-y-8 print:shadow-none print:border-0">
        {/* 헤더 */}
        <div className="border-b border-gray-200 pb-6">
          <p className="text-sm text-gray-500 mb-1">공동구매 캠페인 제안서</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {campaign.campaign_name}
          </h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-gray-600">
            <span>클라이언트: {campaign.client_name}</span>
            {campaign.start_date && (
              <span>
                공구 기간: {formatDate(campaign.start_date)}
                {campaign.end_date && ` ~ ${formatDate(campaign.end_date)}`}
              </span>
            )}
          </div>
        </div>

        {/* 가격 제안 */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            가격 제안
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {normalPrice > 0 && (
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">정상가</p>
                <p className="text-lg font-bold text-gray-500 line-through">
                  {fmt(normalPrice)}원
                </p>
              </div>
            )}
            {onlineMinPrice > 0 && (
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">온라인 최저가</p>
                <p className="text-lg font-bold text-gray-600">
                  {fmt(onlineMinPrice)}원
                </p>
              </div>
            )}
            <div className="rounded-xl border-2 border-primary-300 bg-primary-50 p-4">
              <p className="text-xs text-primary-600 font-medium mb-1">
                공구 제안가
              </p>
              <p className="text-lg font-bold text-primary-700">
                {fmt(gongguPrice)}원
              </p>
              {!vatIncluded && (
                <p className="text-xs text-primary-400 mt-0.5">VAT 별도</p>
              )}
            </div>
            {!vatIncluded && (
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">소비자 실결제가</p>
                <p className="text-lg font-bold text-gray-900">
                  {fmt(econ.consumerPrice)}원
                </p>
                <p className="text-xs text-gray-400 mt-0.5">VAT 포함</p>
              </div>
            )}
          </div>

          {/* 할인 메리트 */}
          {(normalPrice > 0 || onlineMinPrice > 0) && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              {normalPrice > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
                  <p className="text-xs text-red-400 mb-1">정상가 대비</p>
                  <p className="text-2xl font-bold text-red-500">
                    {econ.normalDiscountRate.toFixed(1)}% 할인
                  </p>
                </div>
              )}
              {onlineMinPrice > 0 && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-center">
                  <p className="text-xs text-blue-400 mb-1">온라인 최저가 대비</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {econ.onlineMinDiscountRate.toFixed(1)}% 추가 할인
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 캠페인 조건 */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            캠페인 조건
          </h2>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden text-sm">
            <div className="flex justify-between px-4 py-3">
              <span className="text-gray-500">마케팅 수수료 (총 RS)</span>
              <span className="font-semibold text-gray-900">
                판매액의 {totalRsRate}%
                {gongguPrice > 0 && ` (1건당 ${fmt(totalRsAmount)}원)`}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-gray-500">배송비</span>
              <span className="font-semibold text-gray-900">
                {campaign.shipping_payer === "seller"
                  ? `판매자 부담${campaign.shipping_fee ? ` (${fmt(campaign.shipping_fee)}원)` : ""}`
                  : `구매자 부담${campaign.shipping_fee ? ` (${fmt(campaign.shipping_fee)}원)` : ""}`}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-gray-500">부가세</span>
              <span className="font-semibold text-gray-900">
                {vatIncluded ? "공구가에 포함" : "별도 (소비자 결제 시 +10%)"}
              </span>
            </div>
            {campaign.start_date && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-500">진행 기간</span>
                <span className="font-semibold text-gray-900">
                  {formatDate(campaign.start_date)}
                  {campaign.end_date && ` ~ ${formatDate(campaign.end_date)}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 정산 조건 */}
        {econ.clientTakePerUnit !== null && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              정산 조건
            </h2>
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden text-sm">
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-500">귀사 정산 단가</span>
                <span className="font-semibold text-gray-900">
                  개당 {fmt(econ.clientTakePerUnit)}원
                </span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-gray-500">정산 방식</span>
                <span className="font-semibold text-gray-900">
                  {dealType === "rs"
                    ? `판매액 × ${100 - totalRsRate}% (총 RS ${totalRsRate}% 차감)`
                    : "판매 수량 × 공급가 기준 정산"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="border-t border-gray-200 pt-4 text-xs text-gray-400 text-center">
          본 제안서는 협의용 자료이며, 최종 조건은 계약서 기준으로 합니다.
        </div>
      </div>
    </div>
  );
}
