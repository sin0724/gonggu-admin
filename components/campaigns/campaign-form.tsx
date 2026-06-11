"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign, CampaignInsert } from "@/types/database";
import {
  computeUnitEconomics,
  judgeFeasibility,
  recommendGongguPrice,
  minPriceForVendorTarget,
  buildPriceScenarios,
  FEASIBILITY,
  FEASIBILITY_LABEL,
  Feasibility,
  DealType,
} from "@/lib/economics";

interface CampaignFormProps {
  campaign?: Campaign;
  mode: "create" | "edit";
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={ok ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
        {ok ? "✓" : "✗"}
      </span>
      <span className={ok ? "text-gray-700" : "text-gray-400"}>{label}</span>
    </div>
  );
}

const fmt = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
const fmtRate = (n: number) => n.toFixed(1);

/** 가격 입력 아래 천단위 콤마 확인용 캡션 */
function PriceCaption({ value, suffix }: { value: number; suffix?: string }) {
  if (!(value > 0)) return null;
  return (
    <p className="text-xs text-gray-400 mt-1">
      = {fmt(value)}원{suffix ? ` ${suffix}` : ""}
    </p>
  );
}

export default function CampaignForm({ campaign, mode }: CampaignFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetMargin, setTargetMargin] = useState(2000);
  const [targetMarginUnit, setTargetMarginUnit] = useState<"won" | "pct">("won");
  const [vendorFeeAuto, setVendorFeeAuto] = useState(false);
  const [dealType, setDealType] = useState<DealType>(
    campaign?.deal_type === "supply" ? "supply" : "rs"
  );

  const [formData, setFormData] = useState({
    client_name: campaign?.client_name ?? "",
    campaign_name: campaign?.campaign_name ?? "",
    normal_price: campaign?.normal_price?.toString() ?? "",
    online_min_price: campaign?.online_min_price?.toString() ?? "",
    supply_price: campaign?.supply_price?.toString() ?? "",
    gonggu_price: campaign?.gonggu_price?.toString() ?? "",
    total_rs_rate: campaign?.total_rs_rate?.toString() ?? "",
    influencer_rs_rate: campaign?.influencer_rs_rate?.toString() ?? "",
    vendor_fee_rate: campaign?.vendor_fee_rate?.toString() ?? "",
    shipping_payer: campaign?.shipping_payer ?? "buyer",
    shipping_fee: campaign?.shipping_fee?.toString() ?? "",
    vat_included: campaign?.vat_included === false ? "false" : "true",
    start_date: campaign?.start_date ?? "",
    end_date: campaign?.end_date ?? "",
    purchase_form_url: campaign?.purchase_form_url ?? "",
    drive_url: campaign?.drive_url ?? "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    // 총 RS 한도 또는 KOL RS 변경 시 벤더 수수료 = 잔여분 자동 계산
    if (name === "total_rs_rate" || name === "influencer_rs_rate") {
      const next = { ...formData, [name]: value };
      const total = parseFloat(next.total_rs_rate);
      const kol = parseFloat(next.influencer_rs_rate) || 0;
      if (!isNaN(total) && total > 0) {
        const remainder = Math.max(0, Math.round((total - kol) * 10) / 10);
        next.vendor_fee_rate = remainder.toString();
        setVendorFeeAuto(true);
      }
      setFormData(next);
      return;
    }

    if (name === "vendor_fee_rate") {
      setVendorFeeAuto(false);
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ── 자동 계산 (lib/economics 단일 모델) ─────────────────────
  const normalPrice = parseFloat(formData.normal_price) || 0;
  const onlineMinPrice = parseFloat(formData.online_min_price) || 0;
  const supplyPrice = parseFloat(formData.supply_price) || 0;
  const gongguPrice = parseFloat(formData.gonggu_price) || 0;
  const totalRsRate = parseFloat(formData.total_rs_rate) || 0;
  const influencerRsRate = parseFloat(formData.influencer_rs_rate) || 0;
  const vendorFeeRate = parseFloat(formData.vendor_fee_rate) || 0;
  const vatIncluded = formData.vat_included === "true";
  const isSellerShipping = formData.shipping_payer === "seller";

  const econInput = {
    dealType,
    gongguPrice,
    supplyPrice,
    influencerRsRate,
    vendorFeeRate,
    totalRsRate: totalRsRate > 0 ? totalRsRate : null,
    vatIncluded,
    normalPrice,
    onlineMinPrice,
  };
  const econ = computeUnitEconomics(econInput);

  // [공급가형] 추천 공구가 (벤더 목표 마진 기준)
  const rec =
    dealType === "supply" && supplyPrice > 0
      ? recommendGongguPrice({
          supplyPrice,
          kolRsRatePct: influencerRsRate,
          targetVendorMargin: targetMargin,
          targetUnit: targetMarginUnit,
        })
      : null;
  const recommendedPrice = rec?.rounded ?? 0;
  const recommendedConsumerPrice = vatIncluded
    ? recommendedPrice
    : Math.round(recommendedPrice * 1.1);
  const recommendedExceedsOnlineMin =
    rec !== null &&
    onlineMinPrice > 0 &&
    recommendedConsumerPrice >= onlineMinPrice;

  // [공급가형] 수용 가능 최대 공급가 (클라이언트 협상용)
  const maxSupplyPrice =
    gongguPrice > 0
      ? targetMarginUnit === "won"
        ? gongguPrice * (1 - influencerRsRate / 100) - targetMargin
        : gongguPrice * (1 - influencerRsRate / 100 - targetMargin / 100)
      : 0;

  // [RS형] 목표 마진(원/건) 달성 최소 공구가 — 마진율은 벤더%로 고정이므로 원 기준만 의미 있음
  const rsMinPrice =
    dealType === "rs"
      ? minPriceForVendorTarget({
          targetVendorMarginWon: targetMargin,
          vendorFeeRatePct: vendorFeeRate,
        })
      : null;

  // 시나리오 테이블 (현재 공구가 또는 추천가 중심)
  const hasRsStructure =
    influencerRsRate > 0 || vendorFeeRate > 0 || totalRsRate > 0;
  const scenarioCenter = gongguPrice > 0 ? gongguPrice : recommendedPrice;
  const scenarios =
    scenarioCenter > 0 &&
    (dealType === "supply" ? supplyPrice > 0 : hasRsStructure)
      ? buildPriceScenarios(econInput, scenarioCenter)
      : [];

  // 최종 판정
  const showAnalysis = gongguPrice > 0;
  const canJudge =
    gongguPrice > 0 &&
    (dealType === "supply" ? supplyPrice > 0 || vendorFeeRate > 0 : vendorFeeRate > 0);
  const feasibility: Feasibility = canJudge
    ? judgeFeasibility(econ)
    : "possible";

  const feasibilityConfig: Record<
    Feasibility,
    { bg: string; border: string; text: string; icon: string }
  > = {
    possible: { bg: "bg-green-50", border: "border-green-300", text: "text-green-700", icon: "✓" },
    conditional: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-700", icon: "△" },
    not_recommended: { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", icon: "✗" },
  };

  // ── 저장 ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const payload: CampaignInsert = {
        client_name: formData.client_name,
        campaign_name: formData.campaign_name,
        deal_type: dealType,
        normal_price: formData.normal_price ? parseFloat(formData.normal_price) : null,
        online_min_price: formData.online_min_price ? parseFloat(formData.online_min_price) : null,
        // RS형은 공급가가 파생값이므로 저장하지 않음
        supply_price:
          dealType === "supply" && formData.supply_price
            ? parseFloat(formData.supply_price)
            : null,
        gonggu_price: formData.gonggu_price ? parseFloat(formData.gonggu_price) : null,
        total_rs_rate: formData.total_rs_rate ? parseFloat(formData.total_rs_rate) : null,
        vendor_fee_rate: formData.vendor_fee_rate ? parseFloat(formData.vendor_fee_rate) : null,
        influencer_rs_rate: formData.influencer_rs_rate ? parseFloat(formData.influencer_rs_rate) : null,
        shipping_fee: formData.shipping_fee ? parseFloat(formData.shipping_fee) : null,
        shipping_payer: formData.shipping_payer || null,
        vat_included: formData.vat_included === "true",
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        purchase_form_url: formData.purchase_form_url || null,
        // 응답 시트는 더 이상 사용하지 않음 — 기존 값만 보존
        response_sheet_url: campaign?.response_sheet_url ?? null,
        drive_url: formData.drive_url || null,
      };

      if (mode === "create") {
        const { data, error } = await supabase
          .from("campaigns")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        router.push(`/campaigns/${data.id}`);
      } else if (campaign) {
        const { error } = await supabase
          .from("campaigns")
          .update(payload)
          .eq("id", campaign.id);

        if (error) throw error;

        const newRsRate = payload.influencer_rs_rate ?? 0;
        const oldRsRate = campaign.influencer_rs_rate ?? 0;
        if (newRsRate !== oldRsRate && newRsRate > 0) {
          const { data: unsettled } = await supabase
            .from("campaign_influencers")
            .select("id, sales_amount")
            .eq("campaign_id", campaign.id)
            .eq("is_settled", false)
            .gt("sales_amount", 0);

          if (unsettled && unsettled.length > 0) {
            const results = await Promise.all(
              unsettled.map((ci) =>
                supabase
                  .from("campaign_influencers")
                  .update({
                    settlement_amount: Math.round(
                      (ci.sales_amount ?? 0) * (newRsRate / 100)
                    ),
                  })
                  .eq("id", ci.id)
              )
            );
            const failed = results.filter((r) => r.error).length;
            if (failed > 0) {
              alert(
                `RS율 변경에 따른 정산금액 재계산 중 ${failed}건이 실패했습니다. 해당 인플루언서의 정산금액을 직접 확인해주세요.`
              );
            }
          }
        }

        router.push(`/campaigns/${campaign.id}`);
      }

      router.refresh();
    } catch {
      setError("저장 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const f = feasibilityConfig[feasibility];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 기본 정보 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">기본 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label">
              클라이언트명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="client_name"
              value={formData.client_name}
              onChange={handleChange}
              className="input"
              placeholder="예: (주)브랜드명"
              required
            />
          </div>
          <div>
            <label className="label">
              캠페인명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="campaign_name"
              value={formData.campaign_name}
              onChange={handleChange}
              className="input"
              placeholder="예: 2024 봄 공구 캠페인"
              required
            />
          </div>
        </div>
      </div>

      {/* 가격 · RS 구조 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          가격 · RS 구조
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          {dealType === "rs"
            ? "공구가 × 총 RS% = 가용 재원. 그 재원을 KOL과 벤더사가 나누고, 클라이언트 몫은 공구가 × (1 − 총 RS%)로 자동 계산됩니다."
            : "공구가 − 공급가 = 가용 재원. 그 재원에서 KOL RS를 주고 남는 것이 벤더사(우리) 마진입니다."}
        </p>

        {/* 딜 방식 선택 */}
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={() => setDealType("rs")}
            className={`btn btn-sm ${dealType === "rs" ? "btn-primary" : "btn-secondary"}`}
          >
            RS형 — 총 RS%로 합의
          </button>
          <button
            type="button"
            onClick={() => setDealType("supply")}
            className={`btn btn-sm ${dealType === "supply" ? "btn-primary" : "btn-secondary"}`}
          >
            공급가형 — 개당 단가로 합의
          </button>
          <span className="text-xs text-gray-400 ml-1">
            {dealType === "rs"
              ? "대부분의 딜 · 공급가 입력 불필요"
              : "클라이언트가 원 단위 단가를 제시한 경우"}
          </span>
        </div>
        {mode === "edit" && (
          <p className="text-xs text-blue-500 mb-4">
            인플루언서 RS% 변경 시 미정산 인플루언서의 정산금액이 자동으로
            재계산됩니다.
          </p>
        )}

        {/* ── 기본 입력값 ── */}
        <div className="space-y-4 mb-6">
          {/* 가격 */}
          <div
            className={`grid grid-cols-2 gap-4 ${
              dealType === "supply" ? "md:grid-cols-4" : "md:grid-cols-3"
            }`}
          >
            <div>
              <label className="label">정상가 (원)</label>
              <input
                type="number"
                name="normal_price"
                value={formData.normal_price}
                onChange={handleChange}
                className="input"
                placeholder="예: 50,000"
                min="0"
              />
              <PriceCaption value={normalPrice} suffix="· 소비자 정상 판매가" />
            </div>
            <div>
              <label className="label">온라인 최저가 (원)</label>
              <input
                type="number"
                name="online_min_price"
                value={formData.online_min_price}
                onChange={handleChange}
                className="input"
                placeholder="예: 40,000"
                min="0"
              />
              <PriceCaption value={onlineMinPrice} suffix="· 공구가 상한선" />
            </div>
            {dealType === "supply" && (
              <div>
                <label className="label">공급가 (원)</label>
                <input
                  type="number"
                  name="supply_price"
                  value={formData.supply_price}
                  onChange={handleChange}
                  className="input"
                  placeholder="예: 18,000"
                  min="0"
                />
                <PriceCaption
                  value={supplyPrice}
                  suffix="· 클라이언트 몫 (개당 정산 단가)"
                />
              </div>
            )}
            <div>
              <label className="label">공구가 (원)</label>
              <input
                type="number"
                name="gonggu_price"
                value={formData.gonggu_price}
                onChange={handleChange}
                className="input"
                placeholder="예: 30,000"
                min="0"
              />
              {gongguPrice > 0 && (
                <p className="text-xs text-blue-500 mt-1">
                  = {fmt(gongguPrice)}원
                  {onlineMinPrice > 0 &&
                    ` · 최저가 대비 ↓${fmtRate(econ.onlineMinDiscountRate)}%`}
                </p>
              )}
            </div>
          </div>

          {/* RS형: 클라이언트 몫 자동 표시 */}
          {dealType === "rs" &&
            econ.clientTakePerUnit !== null &&
            gongguPrice > 0 && (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-600">
                클라이언트 몫 (자동 계산) ={" "}
                <b className="text-gray-900">
                  개당 {fmt(econ.clientTakePerUnit)}원
                </b>
                <span className="text-xs text-gray-400">
                  공구가 {fmt(gongguPrice)}원 × (100 −{" "}
                  {fmtRate(econ.maxRsRate ?? 0)})%
                </span>
              </div>
            )}

          {/* RS 구조 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">클라이언트 승인 총 RS (%)</label>
              <input
                type="number"
                name="total_rs_rate"
                value={formData.total_rs_rate}
                onChange={handleChange}
                className="input"
                placeholder="예: 40"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">
                클라이언트가 허용한 RS 상한 (KOL + 벤더 합산)
              </p>
            </div>
            <div>
              <label className="label">인플루언서(KOL) RS (%)</label>
              <input
                type="number"
                name="influencer_rs_rate"
                value={formData.influencer_rs_rate}
                onChange={handleChange}
                className="input"
                placeholder="예: 30"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">
                KOL에게 제안하는 몫 · 통상 20~35%
              </p>
            </div>
            <div>
              <label className="label flex items-center gap-2">
                벤더사 마진 (%)
                {vendorFeeAuto && (
                  <span className="text-xs font-normal bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    자동 = 총 RS − KOL
                  </span>
                )}
              </label>
              <input
                type="number"
                name="vendor_fee_rate"
                value={formData.vendor_fee_rate}
                onChange={handleChange}
                className="input"
                placeholder="예: 10"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">
                {dealType === "supply" && supplyPrice > 0
                  ? "공급가 입력 시 실제 마진은 잔여분으로 자동 계산"
                  : "우리 회사 몫 (클라이언트에게 비공개)"}
              </p>
            </div>
          </div>

          {/* 정합성 경고: 승인 총 RS vs 공급가 */}
          {econ.supplyRsConflict && econ.maxRsRate !== null && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <span className="text-red-500 text-base mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-semibold text-red-700">
                  공급가와 승인 총 RS가 모순됩니다
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  공급가 {fmt(supplyPrice)}원 기준으로 실제 줄 수 있는 RS는 최대{" "}
                  <b>{fmtRate(econ.maxRsRate)}%</b>인데, 승인 총 RS는{" "}
                  {fmtRate(totalRsRate)}%입니다. 공급가를 낮추거나 공구가를
                  올리거나 총 RS를 재확인해야 합니다.
                </p>
              </div>
            </div>
          )}

          {/* RS 한도 체크 */}
          {totalRsRate > 0 && (influencerRsRate > 0 || vendorFeeRate > 0) && (
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
                econ.rsBudgetOver
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-blue-50 border border-blue-100 text-blue-700"
              }`}
            >
              {econ.rsBudgetOver ? (
                <>
                  <span className="font-bold">⚠</span>
                  <span>
                    KOL {fmtRate(influencerRsRate)}% + 벤더{" "}
                    {fmtRate(vendorFeeRate)}% ={" "}
                    <b>{fmtRate(influencerRsRate + vendorFeeRate)}%</b> — 승인
                    한도 {fmtRate(totalRsRate)}%를 초과했습니다.
                  </span>
                </>
              ) : (
                <span>
                  총 RS {fmtRate(totalRsRate)}% 중 KOL{" "}
                  {fmtRate(influencerRsRate)}% + 벤더 {fmtRate(vendorFeeRate)}%
                  사용
                  {totalRsRate - influencerRsRate - vendorFeeRate > 0.05 && (
                    <>
                      {" "}· 잔여{" "}
                      <b>
                        {fmtRate(totalRsRate - influencerRsRate - vendorFeeRate)}%
                      </b>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          {/* 배송 · 부가세 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label">배송비 부담 주체</label>
              <select
                name="shipping_payer"
                value={formData.shipping_payer}
                onChange={handleChange}
                className="input"
              >
                <option value="buyer">구매자 부담</option>
                <option value="seller">판매자(클라이언트) 부담</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {isSellerShipping
                  ? "클라이언트 부담 — 우리 마진 계산에 미반영"
                  : "소비자 별도 부담"}
              </p>
            </div>
            <div>
              <label className="label">배송비 (원)</label>
              <input
                type="number"
                name="shipping_fee"
                value={formData.shipping_fee}
                onChange={handleChange}
                className="input"
                placeholder="예: 3,000"
                min="0"
              />
              <p className="text-xs text-gray-400 mt-1">조건 기록용</p>
            </div>
            <div className="col-span-2">
              <label className="label">부가세</label>
              <div className="flex gap-5 mt-2.5">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="vat_included"
                    value="true"
                    checked={formData.vat_included === "true"}
                    onChange={handleChange}
                    className="accent-primary-600"
                  />
                  포함 (VAT incl.)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="vat_included"
                    value="false"
                    checked={formData.vat_included === "false"}
                    onChange={handleChange}
                    className="accent-primary-600"
                  />
                  별도 (VAT excl.)
                </label>
              </div>
              {!vatIncluded && gongguPrice > 0 && (
                <p className="text-xs text-orange-600 mt-1.5">
                  소비자 실결제가 = {fmt(econ.consumerPrice)}원 (공구가 × 1.1) —
                  할인율·가격 메리트는 실결제가 기준으로 계산됩니다.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 딜 계산기 ── */}
        {dealType === "rs" && vendorFeeRate > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 space-y-3">
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="text-xs text-blue-600 font-medium block mb-1">
                  벤더사 목표 마진 (원/건)
                </label>
                <input
                  type="number"
                  value={targetMargin}
                  onChange={(e) =>
                    setTargetMargin(parseFloat(e.target.value) || 0)
                  }
                  className="w-32 px-3 py-2 text-sm border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  min="0"
                  step={500}
                />
              </div>
              {rsMinPrice !== null && (
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    목표 달성 최소 공구가
                  </p>
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-bold text-blue-700">
                      {fmt(rsMinPrice)}원
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          gonggu_price: rsMinPrice.toString(),
                        }))
                      }
                      className="btn-secondary btn-sm mb-0.5"
                    >
                      적용
                    </button>
                  </div>
                  <p className="text-xs text-blue-400 mt-0.5">
                    벤더 마진이 공구가 × {vendorFeeRate}%이므로, 1건당{" "}
                    {fmt(targetMargin)}원을 남기려면 공구가가 이 이상이어야
                    합니다.
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-blue-400 leading-relaxed">
              공식: 최소 공구가 = 목표마진 {fmt(targetMargin)}원 ÷ 벤더{" "}
              {vendorFeeRate}% · RS형은 마진율이 벤더 %로 고정되므로 공구가가
              높을수록 1건당 마진이 커집니다.
            </p>
          </div>
        )}

        {dealType === "supply" && (supplyPrice > 0 || gongguPrice > 0) && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 space-y-4">
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="text-xs text-blue-600 font-medium block mb-1">
                  벤더사 목표 마진 (1건당)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={targetMargin}
                    onChange={(e) =>
                      setTargetMargin(parseFloat(e.target.value) || 0)
                    }
                    className="w-32 px-3 py-2 text-sm border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    min="0"
                    step={targetMarginUnit === "won" ? 500 : 1}
                  />
                  <div className="flex border border-blue-300 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMarginUnit("won");
                        setTargetMargin(2000);
                      }}
                      className={`px-2.5 py-2 text-xs font-medium ${
                        targetMarginUnit === "won"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-blue-600"
                      }`}
                    >
                      원
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMarginUnit("pct");
                        setTargetMargin(10);
                      }}
                      className={`px-2.5 py-2 text-xs font-medium ${
                        targetMarginUnit === "pct"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-blue-600"
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>
              </div>

              {/* 방향 ①: 공급가 → 추천 공구가 */}
              {supplyPrice > 0 && (
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    추천 공구가 (공급가 기준)
                  </p>
                  {rec ? (
                    <div className="flex items-end gap-2">
                      <p className="text-2xl font-bold text-blue-700">
                        {fmt(recommendedPrice)}원
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            gonggu_price: recommendedPrice.toString(),
                          }))
                        }
                        className="btn-secondary btn-sm mb-0.5"
                      >
                        적용
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-red-500">
                      KOL%와 목표 마진율 합이 100% 이상이라 계산 불가
                    </p>
                  )}
                </div>
              )}

              {/* 방향 ②: 공구가 → 수용 가능 최대 공급가 (클라이언트 협상용) */}
              {gongguPrice > 0 && (
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    수용 가능 최대 공급가 (협상 카드)
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      maxSupplyPrice > 0 ? "text-blue-700" : "text-red-500"
                    }`}
                  >
                    {fmt(Math.max(0, Math.floor(maxSupplyPrice / 100) * 100))}원
                  </p>
                  <p className="text-xs text-blue-400 mt-0.5">
                    공구가 {fmt(gongguPrice)}원에서 KOL {influencerRsRate}%와
                    목표 마진을 확보하려면 공급가는 이 이하여야 합니다.
                  </p>
                </div>
              )}
            </div>

            {recommendedExceedsOnlineMin && (
              <p className="text-xs text-orange-600 font-medium">
                ⚠ 추천가 기준 소비자 실결제가({fmt(recommendedConsumerPrice)}원)가
                온라인 최저가({fmt(onlineMinPrice)}원) 이상입니다 — 이 조건으로는
                가격 메리트가 없습니다. 공급가를 더 낮춰 받아야 합니다.
              </p>
            )}
            <p className="text-xs text-blue-400 leading-relaxed">
              공식: 추천 공구가 = (공급가
              {targetMarginUnit === "won" && ` + 목표마진 ${fmt(targetMargin)}원`}
              ) ÷ (1 − KOL {influencerRsRate}%
              {targetMarginUnit === "pct" && ` − 목표마진율 ${targetMargin}%`}) ·
              최대 공급가 = 공구가 × (1 − KOL%
              {targetMarginUnit === "pct" ? " − 목표마진율" : ") − 목표마진"}
              {targetMarginUnit === "pct" && ")"}
            </p>
          </div>
        )}

        {/* ── 공구가 시나리오 비교 ── */}
        {scenarios.length > 0 && (
          <div className="mb-5 overflow-x-auto">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              공구가 시나리오 비교
            </p>
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">공구가</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">
                    최저가 대비
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">
                    가용 재원/건
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-purple-600">
                    KOL 수익/건
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-blue-600">
                    벤더 마진/건
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-gray-500">판정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scenarios.map((s) => (
                  <tr
                    key={s.econ.gongguPrice}
                    className={s.isCurrent ? "bg-blue-50 font-semibold" : "bg-white"}
                  >
                    <td className="px-3 py-2">
                      {fmt(s.econ.gongguPrice)}원
                      {s.isCurrent && (
                        <span className="ml-1 text-blue-500 text-[10px]">현재</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${
                        s.econ.hasNoPriceMerit ? "text-orange-500" : "text-blue-600"
                      }`}
                    >
                      {onlineMinPrice > 0
                        ? `${fmtRate(s.econ.onlineMinDiscountRate)}%`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {s.econ.availablePool !== null
                        ? `${fmt(s.econ.availablePool)}원`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-purple-700">
                      {fmt(s.econ.kolPerUnit)}원
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${
                        s.econ.vendorMarginPerUnit >= 0
                          ? "text-blue-700"
                          : "text-red-600"
                      }`}
                    >
                      {fmt(s.econ.vendorMarginPerUnit)}원 (
                      {fmtRate(s.econ.vendorMarginRate)}%)
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`badge ${
                          s.feasibility === "possible"
                            ? "bg-green-100 text-green-700"
                            : s.feasibility === "conditional"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {FEASIBILITY_LABEL[s.feasibility]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 자동 계산 결과 ── */}
        {showAnalysis && (
          <div className="space-y-4">
            {/* 경고: 가격 메리트 부족 */}
            {econ.hasNoPriceMerit && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                <span className="text-orange-500 text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-orange-700">
                    가격 메리트 부족
                  </p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    소비자 실결제가({fmt(econ.consumerPrice)}원)가 온라인 최저가(
                    {fmt(onlineMinPrice)}원) 이상입니다. 공동구매의 전제가
                    무너집니다.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4 space-y-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                가용 재원 분석 (1건 판매 기준)
              </p>

              {/* 할인율 비교 */}
              {(normalPrice > 0 || onlineMinPrice > 0) && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    가격 비교 {!vatIncluded && "(소비자 실결제가 기준)"}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {normalPrice > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-400">정상가 대비 할인율</p>
                        <p className="text-xl font-bold text-red-500 mt-1">
                          {fmtRate(econ.normalDiscountRate)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {fmt(normalPrice)}원 → {fmt(econ.consumerPrice)}원
                        </p>
                      </div>
                    )}
                    {onlineMinPrice > 0 && (
                      <div
                        className={`bg-white rounded-lg p-3 border ${
                          econ.onlineMinDiscountRate <= 0
                            ? "border-orange-300"
                            : "border-gray-200"
                        }`}
                      >
                        <p className="text-xs text-gray-400">
                          온라인 최저가 대비 할인율
                        </p>
                        <p
                          className={`text-xl font-bold mt-1 ${
                            econ.onlineMinDiscountRate > 0
                              ? "text-blue-600"
                              : "text-orange-500"
                          }`}
                        >
                          {fmtRate(econ.onlineMinDiscountRate)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {fmt(onlineMinPrice)}원 → {fmt(econ.consumerPrice)}원
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 재원 → 분배 폭포 */}
              {econ.availablePool !== null && econ.clientTakePerUnit !== null ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    재원 분배 — 공구가에서 클라이언트 몫을 뺀 전부가 우리가
                    나눌 돈
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">공구가</span>
                      <span className="font-semibold text-gray-900">
                        +{fmt(gongguPrice)}원
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">
                        {dealType === "rs"
                          ? `클라이언트 몫 차감 (공구가 × ${fmtRate(100 - (econ.maxRsRate ?? 0))}%)`
                          : "공급가 차감 (클라이언트 몫)"}
                      </span>
                      <span className="font-semibold text-red-500">
                        -{fmt(econ.clientTakePerUnit)}원
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-300 text-sm">
                      <span className="text-gray-700 font-medium">
                        가용 재원
                        {econ.maxRsRate !== null &&
                          ` (공구가의 ${fmtRate(econ.maxRsRate)}%)`}
                      </span>
                      <span
                        className={`font-bold ${
                          (econ.availablePool ?? 0) >= 0
                            ? "text-gray-900"
                            : "text-red-600"
                        }`}
                      >
                        {fmt(econ.availablePool ?? 0)}원
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">
                        KOL RS 차감 (공구가 × {influencerRsRate}%)
                      </span>
                      <span className="font-semibold text-purple-600">
                        -{fmt(econ.kolPerUnit)}원
                      </span>
                    </div>
                    <div
                      className={`flex justify-between items-center rounded-lg px-3 py-3 border-2 text-sm ${
                        feasibility === "possible"
                          ? "bg-green-50 border-green-300"
                          : feasibility === "conditional"
                          ? "bg-yellow-50 border-yellow-300"
                          : "bg-red-50 border-red-300"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-gray-900">
                          벤더사 마진 (1건 판매 시 우리 순수익)
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          마진율 {fmtRate(econ.vendorMarginRate)}% — 기준: 율{" "}
                          {FEASIBILITY.VENDOR_GOOD_RATE}%↑ &{" "}
                          {fmt(FEASIBILITY.VENDOR_GOOD_ABS)}원↑
                        </p>
                      </div>
                      <span
                        className={`text-xl font-bold ${
                          feasibility === "possible"
                            ? "text-green-700"
                            : feasibility === "conditional"
                            ? "text-yellow-700"
                            : "text-red-700"
                        }`}
                      >
                        {fmt(econ.vendorMarginPerUnit)}원
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                (influencerRsRate > 0 || vendorFeeRate > 0) && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      RS 분배 (공급가 미입력 — 벤더 % 기준 계산)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 border-2 border-blue-200">
                        <p className="text-xs text-blue-500 font-medium">
                          벤더사 마진 (우리)
                        </p>
                        <p className="text-lg font-bold text-blue-700 mt-1">
                          {fmt(econ.vendorMarginPerUnit)}원
                        </p>
                        <p className="text-xs text-blue-400">{vendorFeeRate}%</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-400">KOL 수익</p>
                        <p className="text-lg font-bold text-purple-600 mt-1">
                          {fmt(econ.kolPerUnit)}원
                        </p>
                        <p className="text-xs text-gray-400">{influencerRsRate}%</p>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* KOL 수익 매력도 */}
              {influencerRsRate > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    KOL 수익 매력도
                  </p>
                  <div className="bg-white rounded-lg p-3 border border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">1건 판매 시 수익</p>
                      <p
                        className={`text-xl font-bold mt-1 ${
                          econ.kolPerUnit >= FEASIBILITY.KOL_ATTRACTIVE
                            ? "text-green-600"
                            : econ.kolPerUnit >= FEASIBILITY.KOL_OK
                            ? "text-yellow-600"
                            : "text-red-500"
                        }`}
                      >
                        {fmt(econ.kolPerUnit)}원
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          econ.kolPerUnit >= FEASIBILITY.KOL_ATTRACTIVE
                            ? "bg-green-100 text-green-700"
                            : econ.kolPerUnit >= FEASIBILITY.KOL_OK
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {econ.kolPerUnit >= FEASIBILITY.KOL_ATTRACTIVE
                          ? "매력적"
                          : econ.kolPerUnit >= FEASIBILITY.KOL_OK
                          ? "보통"
                          : "낮음"}
                      </span>
                      {econ.kolPerUnit < FEASIBILITY.KOL_OK && (
                        <p className="text-xs text-gray-400 mt-1">
                          모집 어려울 수 있음
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── 최종 판정 ── */}
            {canJudge && (
              <div className={`rounded-xl p-4 border-2 ${f.bg} ${f.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      최종 판정 — 벤더사 마진 기준
                    </p>
                    <p className={`text-xl font-bold ${f.text}`}>
                      {FEASIBILITY_LABEL[feasibility]}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {feasibility === "possible" &&
                        `벤더 마진 ${fmt(econ.vendorMarginPerUnit)}원/건(${fmtRate(econ.vendorMarginRate)}%) — 공구 진행에 적합합니다.`}
                      {feasibility === "conditional" &&
                        `벤더 마진 ${fmt(econ.vendorMarginPerUnit)}원/건(${fmtRate(econ.vendorMarginRate)}%) — 조건 협의 후 진행을 권장합니다.`}
                      {feasibility === "not_recommended" &&
                        `벤더 마진 ${fmt(econ.vendorMarginPerUnit)}원/건(${fmtRate(econ.vendorMarginRate)}%) — 수익성 부족으로 진행을 비추천합니다.`}
                    </p>
                  </div>
                  <span className={`text-4xl font-bold ${f.text} opacity-40`}>
                    {f.icon}
                  </span>
                </div>
                <div className="pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-2">
                  <CheckItem
                    ok={econ.vendorMarginPerUnit >= 0}
                    label="벤더 마진 확보"
                  />
                  <CheckItem
                    ok={econ.vendorMarginRate >= FEASIBILITY.VENDOR_MIN_RATE}
                    label={`마진율 ${FEASIBILITY.VENDOR_MIN_RATE}% 이상`}
                  />
                  <CheckItem ok={!econ.hasNoPriceMerit} label="가격 메리트" />
                  <CheckItem ok={!econ.rsBudgetOver} label="RS 한도 준수" />
                  <CheckItem
                    ok={!econ.supplyRsConflict}
                    label="공급가·RS 정합"
                  />
                  <CheckItem
                    ok={econ.kolPerUnit >= FEASIBILITY.KOL_OK}
                    label="KOL 수익 매력도"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 공구 기간 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          공구 기간
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label">공구 시작일</label>
            <input
              type="date"
              name="start_date"
              value={formData.start_date}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">공구 종료일</label>
            <input
              type="date"
              name="end_date"
              value={formData.end_date}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* 링크 정보 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          링크 정보
        </h2>
        <div className="space-y-5">
          <div>
            <label className="label">공통 구매 링크</label>
            <input
              type="url"
              name="purchase_form_url"
              value={formData.purchase_form_url}
              onChange={handleChange}
              className="input"
              placeholder="https://..."
            />
            <p className="text-xs text-gray-400 mt-1">
              캠페인 전체가 하나의 구매 링크를 쓰는 경우 입력하세요. KOL별로
              링크가 다르면 비워두고 인플루언서별 구매링크에 입력하면 됩니다
              (개별 링크가 있으면 개별 링크가 우선).
            </p>
          </div>
          <div>
            <label className="label">KOL 가이드 (구글 드라이브)</label>
            <input
              type="url"
              name="drive_url"
              value={formData.drive_url}
              onChange={handleChange}
              className="input"
              placeholder="https://drive.google.com/..."
            />
            <p className="text-xs text-gray-400 mt-1">
              KOL에게 보낼 가이드 문서 링크
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
        >
          취소
        </button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              저장 중...
            </>
          ) : mode === "create" ? (
            "캠페인 등록"
          ) : (
            "캠페인 수정"
          )}
        </button>
      </div>
    </form>
  );
}
