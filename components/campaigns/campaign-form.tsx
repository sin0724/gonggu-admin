"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign, CampaignInsert } from "@/types/database";

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

export default function CampaignForm({ campaign, mode }: CampaignFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetMargin, setTargetMargin] = useState(5000);

  const [formData, setFormData] = useState({
    client_name: campaign?.client_name ?? "",
    campaign_name: campaign?.campaign_name ?? "",
    normal_price: campaign?.normal_price?.toString() ?? "",
    online_min_price: campaign?.online_min_price?.toString() ?? "",
    supply_price: campaign?.supply_price?.toString() ?? "",
    gonggu_price: campaign?.gonggu_price?.toString() ?? "",
    influencer_rs_rate: campaign?.influencer_rs_rate?.toString() ?? "",
    vendor_fee_rate: campaign?.vendor_fee_rate?.toString() ?? "",
    shipping_payer: campaign?.shipping_payer ?? "buyer",
    shipping_fee: campaign?.shipping_fee?.toString() ?? "",
    vat_included: campaign?.vat_included === false ? "false" : "true",
    start_date: campaign?.start_date ?? "",
    end_date: campaign?.end_date ?? "",
    purchase_form_url: campaign?.purchase_form_url ?? "",
    response_sheet_url: campaign?.response_sheet_url ?? "",
    drive_url: campaign?.drive_url ?? "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ── 자동 계산 ──────────────────────────────────────────────
  const normalPrice = parseFloat(formData.normal_price) || 0;
  const onlineMinPrice = parseFloat(formData.online_min_price) || 0;
  const supplyPrice = parseFloat(formData.supply_price) || 0;
  const gongguPrice = parseFloat(formData.gonggu_price) || 0;
  const influencerRsRate = parseFloat(formData.influencer_rs_rate) || 0;
  const vendorFeeRate = parseFloat(formData.vendor_fee_rate) || 0;
  const shippingFee = parseFloat(formData.shipping_fee) || 0;
  const isSellerShipping = formData.shipping_payer === "seller";

  const normalDiscountRate =
    normalPrice > 0 && gongguPrice > 0
      ? ((normalPrice - gongguPrice) / normalPrice) * 100
      : 0;

  const onlineMinDiscountRate =
    onlineMinPrice > 0 && gongguPrice > 0
      ? ((onlineMinPrice - gongguPrice) / onlineMinPrice) * 100
      : 0;

  const influencerAmount = gongguPrice * (influencerRsRate / 100);
  const vendorFeeAmount = gongguPrice * (vendorFeeRate / 100);
  const totalRsAmount = influencerAmount + vendorFeeAmount;

  const marginAfterSupply = gongguPrice - supplyPrice - totalRsAmount;
  const effectiveShipping = isSellerShipping ? shippingFee : 0;
  const netMargin = marginAfterSupply - effectiveShipping;
  const netMarginRate = gongguPrice > 0 ? (netMargin / gongguPrice) * 100 : 0;

  // 추천 공구가
  const rsDecimal = (influencerRsRate + vendorFeeRate) / 100;
  const canCalcRecommended = rsDecimal < 1 && supplyPrice > 0;
  const recommendedPriceRaw = canCalcRecommended
    ? (supplyPrice + (isSellerShipping ? shippingFee : 0) + targetMargin) /
      (1 - rsDecimal)
    : 0;
  const recommendedPrice = Math.ceil(recommendedPriceRaw / 1000) * 1000;

  // 최종 판정
  type Feasibility = "possible" | "conditional" | "not_recommended";
  const feasibility: Feasibility =
    gongguPrice > 0 && supplyPrice > 0
      ? netMargin >= 5000
        ? "possible"
        : netMargin >= 3000
        ? "conditional"
        : "not_recommended"
      : "possible";

  const feasibilityConfig: Record<
    Feasibility,
    { label: string; bg: string; border: string; text: string; icon: string }
  > = {
    possible: {
      label: "진행 가능",
      bg: "bg-green-50",
      border: "border-green-300",
      text: "text-green-700",
      icon: "✓",
    },
    conditional: {
      label: "조건부 진행",
      bg: "bg-yellow-50",
      border: "border-yellow-300",
      text: "text-yellow-700",
      icon: "△",
    },
    not_recommended: {
      label: "진행 비추천",
      bg: "bg-red-50",
      border: "border-red-300",
      text: "text-red-700",
      icon: "✗",
    },
  };

  const hasLowPriceMerit =
    onlineMinPrice > 0 && gongguPrice > 0 && gongguPrice >= onlineMinPrice;
  const isRsOverloaded = influencerRsRate + vendorFeeRate > 50;
  const showAnalysis = gongguPrice > 0;

  const fmt = (n: number) =>
    n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  const fmtRate = (n: number) => n.toFixed(1);

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
        normal_price: formData.normal_price ? parseFloat(formData.normal_price) : null,
        online_min_price: formData.online_min_price ? parseFloat(formData.online_min_price) : null,
        supply_price: formData.supply_price ? parseFloat(formData.supply_price) : null,
        gonggu_price: formData.gonggu_price ? parseFloat(formData.gonggu_price) : null,
        vendor_fee_rate: formData.vendor_fee_rate ? parseFloat(formData.vendor_fee_rate) : null,
        influencer_rs_rate: formData.influencer_rs_rate ? parseFloat(formData.influencer_rs_rate) : null,
        shipping_fee: formData.shipping_fee ? parseFloat(formData.shipping_fee) : null,
        shipping_payer: formData.shipping_payer || null,
        vat_included: formData.vat_included === "true",
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        purchase_form_url: formData.purchase_form_url || null,
        response_sheet_url: formData.response_sheet_url || null,
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
            await Promise.all(
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

      {/* RS 정보 — 자동 계산형 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">RS 정보</h2>
        <p className="text-xs text-gray-400 mb-4">
          입력값을 기준으로 수익 구조가 자동 계산됩니다.
        </p>
        {mode === "edit" && (
          <p className="text-xs text-blue-500 mb-4">
            인플루언서 RS% 변경 시 미정산 인플루언서의 정산금액이 자동으로
            재계산됩니다.
          </p>
        )}

        {/* ── 기본 입력값 ── */}
        <div className="space-y-4 mb-6">
          {/* 가격 4종 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <p className="text-xs text-gray-400 mt-1">소비자 정상 판매가</p>
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
              <p className="text-xs text-gray-400 mt-1">타 채널 최저 판매가</p>
            </div>
            <div>
              <label className="label">공급가 (원)</label>
              <input
                type="number"
                name="supply_price"
                value={formData.supply_price}
                onChange={handleChange}
                className="input"
                placeholder="예: 15,000"
                min="0"
              />
              <p className="text-xs text-gray-400 mt-1">벤더 원가</p>
            </div>
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
              {gongguPrice > 0 && normalPrice > 0 && (
                <p className="text-xs text-blue-500 mt-1">
                  ↓ {fmtRate(normalDiscountRate)}% 할인
                </p>
              )}
            </div>
          </div>

          {/* RS · 배송 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label">인플루언서 RS (%)</label>
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
              <p className="text-xs text-gray-400 mt-1">통상 20~35%</p>
            </div>
            <div>
              <label className="label">벤더 수수료 (%)</label>
              <input
                type="number"
                name="vendor_fee_rate"
                value={formData.vendor_fee_rate}
                onChange={handleChange}
                className="input"
                placeholder="예: 5"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">통상 3~10%</p>
            </div>
            <div>
              <label className="label">배송비 부담 주체</label>
              <select
                name="shipping_payer"
                value={formData.shipping_payer}
                onChange={handleChange}
                className="input"
              >
                <option value="buyer">구매자 부담</option>
                <option value="seller">판매자 부담</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {isSellerShipping ? "마진에서 차감" : "소비자 별도 부담"}
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
              <p className="text-xs text-gray-400 mt-1">
                {formData.shipping_payer === "buyer"
                  ? "구매자가 별도 결제"
                  : "판매자 부담분"}
              </p>
            </div>
          </div>

          {/* 부가세 */}
          <div>
            <label className="label">부가세</label>
            <div className="flex gap-5 mt-1">
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
                별도 (VAT excl.) — 실소비가 × 1.1
              </label>
            </div>
          </div>
        </div>

        {/* ── 추천 공구가 계산기 ── */}
        {canCalcRecommended && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
            <p className="text-xs font-semibold text-blue-700 mb-3">
              추천 공구가 계산기
            </p>
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="text-xs text-blue-600 font-medium block mb-1">
                  목표 실마진 (원)
                </label>
                <input
                  type="number"
                  value={targetMargin}
                  onChange={(e) =>
                    setTargetMargin(parseFloat(e.target.value) || 0)
                  }
                  className="w-36 px-3 py-2 text-sm border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  min="0"
                  step="500"
                />
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium mb-1">
                  추천 공구가
                </p>
                <p className="text-2xl font-bold text-blue-700">
                  {fmt(recommendedPrice)}원
                </p>
                <p className="text-xs text-blue-400 mt-0.5">
                  ({fmt(Math.round(recommendedPriceRaw))}원 → 1,000원 단위 올림)
                </p>
              </div>
            </div>
            <p className="text-xs text-blue-400 mt-3 leading-relaxed">
              공식: (공급가 {fmt(supplyPrice)} +{" "}
              {isSellerShipping
                ? `배송비 ${fmt(shippingFee)}`
                : "배송비 0 (구매자 부담)"}{" "}
              + 목표마진 {fmt(targetMargin)}) ÷ (1 − RS {influencerRsRate}% −
              벤더 {vendorFeeRate}%)
            </p>
          </div>
        )}

        {/* ── 자동 계산 결과 ── */}
        {showAnalysis && (
          <div className="space-y-4">
            {/* 경고: 가격 메리트 부족 */}
            {hasLowPriceMerit && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                <span className="text-orange-500 text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-orange-700">
                    가격 메리트 부족
                  </p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    공구가({fmt(gongguPrice)}원)가 온라인 최저가(
                    {fmt(onlineMinPrice)}원) 이상입니다. 소비자 구매 유인이
                    부족할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

            {/* 경고: RS 과다 */}
            {isRsOverloaded && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <span className="text-red-500 text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-red-700">
                    RS 과다
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    총 RS({fmtRate(influencerRsRate + vendorFeeRate)}%)가
                    50%를 초과합니다. 수익 구조를 재검토해주세요.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4 space-y-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                수익 구조 분석
              </p>

              {/* 할인율 비교 */}
              {(normalPrice > 0 || onlineMinPrice > 0) && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    가격 비교
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {normalPrice > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-400">정상가 대비 할인율</p>
                        <p className="text-xl font-bold text-red-500 mt-1">
                          {fmtRate(normalDiscountRate)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {fmt(normalPrice)}원 → {fmt(gongguPrice)}원
                        </p>
                      </div>
                    )}
                    {onlineMinPrice > 0 && (
                      <div
                        className={`bg-white rounded-lg p-3 border ${
                          onlineMinDiscountRate <= 0
                            ? "border-orange-300"
                            : "border-gray-200"
                        }`}
                      >
                        <p className="text-xs text-gray-400">
                          온라인 최저가 대비 할인율
                        </p>
                        <p
                          className={`text-xl font-bold mt-1 ${
                            onlineMinDiscountRate > 0
                              ? "text-blue-600"
                              : "text-orange-500"
                          }`}
                        >
                          {fmtRate(onlineMinDiscountRate)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {fmt(onlineMinPrice)}원 → {fmt(gongguPrice)}원
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* RS 지급 내역 */}
              {(influencerRsRate > 0 || vendorFeeRate > 0) && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    RS 지급 내역
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-400">인플루언서 RS</p>
                      <p className="text-sm font-bold text-purple-600 mt-1">
                        -{fmt(influencerAmount)}원
                      </p>
                      <p className="text-xs text-gray-400">
                        {influencerRsRate}%
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-400">벤더 수수료</p>
                      <p className="text-sm font-bold text-orange-600 mt-1">
                        -{fmt(vendorFeeAmount)}원
                      </p>
                      <p className="text-xs text-gray-400">{vendorFeeRate}%</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-300">
                      <p className="text-xs text-gray-400">총 RS 지급액</p>
                      <p className="text-sm font-bold text-red-600 mt-1">
                        -{fmt(totalRsAmount)}원
                      </p>
                      <p className="text-xs text-gray-400">
                        {fmtRate(influencerRsRate + vendorFeeRate)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 마진 분석 */}
              {supplyPrice > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    마진 분석
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">공구가</span>
                      <span className="font-semibold text-gray-900">
                        +{fmt(gongguPrice)}원
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">공급가 차감</span>
                      <span className="font-semibold text-red-500">
                        -{fmt(supplyPrice)}원
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">총 RS 지급액 차감</span>
                      <span className="font-semibold text-red-500">
                        -{fmt(totalRsAmount)}원
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">공급가 차감 후 마진</span>
                      <span
                        className={`font-semibold ${
                          marginAfterSupply >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {fmt(marginAfterSupply)}원
                      </span>
                    </div>
                    {isSellerShipping && shippingFee > 0 && (
                      <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                        <span className="text-gray-600">
                          배송비 차감 (판매자 부담)
                        </span>
                        <span className="font-semibold text-red-500">
                          -{fmt(shippingFee)}원
                        </span>
                      </div>
                    )}
                    <div
                      className={`flex justify-between items-center rounded-lg px-3 py-3 border-2 text-sm ${
                        netMargin >= 5000
                          ? "bg-green-50 border-green-300"
                          : netMargin >= 3000
                          ? "bg-yellow-50 border-yellow-300"
                          : "bg-red-50 border-red-300"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-gray-900">
                          실마진 (1개 판매 시 예상 순이익)
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          실마진율 {fmtRate(netMarginRate)}%
                        </p>
                      </div>
                      <span
                        className={`text-xl font-bold ${
                          netMargin >= 5000
                            ? "text-green-700"
                            : netMargin >= 3000
                            ? "text-yellow-700"
                            : "text-red-700"
                        }`}
                      >
                        {fmt(netMargin)}원
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 인플루언서 수익 매력도 */}
              {influencerRsRate > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    인플루언서 수익 매력도
                  </p>
                  <div className="bg-white rounded-lg p-3 border border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">1건 판매 시 수익</p>
                      <p
                        className={`text-xl font-bold mt-1 ${
                          influencerAmount >= 10000
                            ? "text-green-600"
                            : influencerAmount >= 5000
                            ? "text-yellow-600"
                            : "text-red-500"
                        }`}
                      >
                        {fmt(influencerAmount)}원
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          influencerAmount >= 10000
                            ? "bg-green-100 text-green-700"
                            : influencerAmount >= 5000
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {influencerAmount >= 10000
                          ? "매력적"
                          : influencerAmount >= 5000
                          ? "보통"
                          : "낮음"}
                      </span>
                      {influencerAmount < 5000 && (
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
            {supplyPrice > 0 && (
              <div
                className={`rounded-xl p-4 border-2 ${f.bg} ${f.border}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      최종 판정
                    </p>
                    <p className={`text-xl font-bold ${f.text}`}>{f.label}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {feasibility === "possible" &&
                        `실마진 ${fmt(netMargin)}원 — 공구 진행에 적합합니다.`}
                      {feasibility === "conditional" &&
                        `실마진 ${fmt(netMargin)}원 — 조건 협의 후 진행을 권장합니다.`}
                      {feasibility === "not_recommended" &&
                        `실마진 ${fmt(netMargin)}원 — 수익성 부족으로 진행을 비추천합니다.`}
                    </p>
                  </div>
                  <span className={`text-4xl font-bold ${f.text} opacity-40`}>
                    {f.icon}
                  </span>
                </div>
                <div className="pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-2">
                  <CheckItem ok={netMargin >= 0} label="공구 진행 가능" />
                  <CheckItem ok={!hasLowPriceMerit} label="적정 공구가" />
                  <CheckItem ok={!isRsOverloaded} label="RS 적정 수준" />
                  <CheckItem ok={vendorFeeAmount >= 1000} label="벤더 수익 구조" />
                  <CheckItem
                    ok={influencerAmount >= 5000}
                    label="인플루언서 수익 매력도"
                  />
                  <CheckItem ok={netMargin >= 3000} label="수익성 확보" />
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
            <label className="label">구매 양식 링크</label>
            <input
              type="url"
              name="purchase_form_url"
              value={formData.purchase_form_url}
              onChange={handleChange}
              className="input"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="label">응답 시트 링크</label>
            <input
              type="url"
              name="response_sheet_url"
              value={formData.response_sheet_url}
              onChange={handleChange}
              className="input"
              placeholder="https://docs.google.com/spreadsheets/..."
            />
            <p className="text-xs text-gray-400 mt-1">
              구매 양식과 연동된 Google Sheets
            </p>
          </div>
          <div>
            <label className="label">구글 드라이브 링크</label>
            <input
              type="url"
              name="drive_url"
              value={formData.drive_url}
              onChange={handleChange}
              className="input"
              placeholder="https://drive.google.com/..."
            />
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
