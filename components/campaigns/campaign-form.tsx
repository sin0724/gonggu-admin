"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign, CampaignInsert } from "@/types/database";

interface CampaignFormProps {
  campaign?: Campaign;
  mode: "create" | "edit";
}

export default function CampaignForm({ campaign, mode }: CampaignFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    client_name: campaign?.client_name ?? "",
    campaign_name: campaign?.campaign_name ?? "",
    gonggu_price: campaign?.gonggu_price?.toString() ?? "",
    vendor_fee_rate: campaign?.vendor_fee_rate?.toString() ?? "",
    influencer_rs_rate: campaign?.influencer_rs_rate?.toString() ?? "",
    start_date: campaign?.start_date ?? "",
    end_date: campaign?.end_date ?? "",
    purchase_form_url: campaign?.purchase_form_url ?? "",
    drive_url: campaign?.drive_url ?? "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 브랜드 수익 자동 계산
  const gonguPrice = parseFloat(formData.gonggu_price) || 0;
  const vendorFeeRate = parseFloat(formData.vendor_fee_rate) || 0;
  const influencerRsRate = parseFloat(formData.influencer_rs_rate) || 0;

  const vendorFeeAmount = gonguPrice * (vendorFeeRate / 100);
  const influencerRsAmount = gonguPrice * (influencerRsRate / 100);
  const brandAmount = gonguPrice - vendorFeeAmount - influencerRsAmount;
  const brandRate = gonguPrice > 0 ? (brandAmount / gonguPrice) * 100 : 0;

  const formatCurrency = (n: number) =>
    n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const payload: CampaignInsert = {
        client_name: formData.client_name,
        campaign_name: formData.campaign_name,
        gonggu_price: formData.gonggu_price ? parseFloat(formData.gonggu_price) : null,
        vendor_fee_rate: formData.vendor_fee_rate ? parseFloat(formData.vendor_fee_rate) : null,
        influencer_rs_rate: formData.influencer_rs_rate ? parseFloat(formData.influencer_rs_rate) : null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        purchase_form_url: formData.purchase_form_url || null,
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
        router.push(`/campaigns/${campaign.id}`);
      }

      router.refresh();
    } catch {
      setError("저장 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {/* RS 정보 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">RS 정보</h2>
        <p className="text-xs text-gray-400 mb-5">
          공구가 기준으로 밴더 수수료와 인플루언서 RS를 입력하면 브랜드 수익이 자동 계산됩니다.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          <div>
            <label className="label">공구가 (원)</label>
            <input
              type="number"
              name="gonggu_price"
              value={formData.gonggu_price}
              onChange={handleChange}
              className="input"
              placeholder="예: 30000"
              min="0"
            />
          </div>

          <div>
            <label className="label">밴더 수수료 (%)</label>
            <input
              type="number"
              name="vendor_fee_rate"
              value={formData.vendor_fee_rate}
              onChange={handleChange}
              className="input"
              placeholder="예: 15"
              min="0"
              max="100"
              step="0.1"
            />
            <p className="text-xs text-gray-400 mt-1">통상 10~20%</p>
          </div>

          <div>
            <label className="label">인플루언서 RS (%)</label>
            <input
              type="number"
              name="influencer_rs_rate"
              value={formData.influencer_rs_rate}
              onChange={handleChange}
              className="input"
              placeholder="예: 10"
              min="0"
              max="100"
              step="0.1"
            />
          </div>
        </div>

        {/* 자동 계산 결과 */}
        {gonguPrice > 0 && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">수익 구조 미리보기</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">공구가</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(gonguPrice)}원</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">밴더 수수료</p>
                <p className="text-sm font-semibold text-red-600">
                  -{formatCurrency(vendorFeeAmount)}원
                </p>
                <p className="text-xs text-gray-400">{vendorFeeRate}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">인플루언서 RS</p>
                <p className="text-sm font-semibold text-blue-600">
                  -{formatCurrency(influencerRsAmount)}원
                </p>
                <p className="text-xs text-gray-400">{influencerRsRate}%</p>
              </div>
              <div className="text-center bg-white rounded-md p-2 border border-gray-200">
                <p className="text-xs text-gray-400 mb-1">브랜드 수익</p>
                <p className="text-sm font-bold text-green-600">
                  {formatCurrency(brandAmount)}원
                </p>
                <p className="text-xs text-gray-400">{brandRate.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">공구 기간</h2>

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

      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">링크 정보</h2>

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
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
