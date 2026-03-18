"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CampaignInfluencer,
  CampaignInfluencerInsert,
  Influencer,
} from "@/types/database";

interface InfluencerModalProps {
  campaignId: string;
  record?: CampaignInfluencer & { influencer: Influencer };
  onClose: () => void;
}

export default function InfluencerModal({
  campaignId,
  record,
  onClose,
}: InfluencerModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [searchInfluencer, setSearchInfluencer] = useState("");
  const [isNewInfluencer, setIsNewInfluencer] = useState(false);

  const [formData, setFormData] = useState({
    influencer_id: record?.influencer_id ?? "",
    new_influencer_name: "",
    new_influencer_account_url: "",
    personal_code: record?.personal_code ?? "",
    is_product_sent: record?.is_product_sent ?? false,
    sent_date: record?.sent_date ?? "",
    content_url: record?.content_url ?? "",
    is_uploaded: record?.is_uploaded ?? false,
    sales_amount: record?.sales_amount?.toString() ?? "0",
    settlement_method: record?.settlement_method ?? "",
    settlement_amount: record?.settlement_amount?.toString() ?? "0",
    is_settled: record?.is_settled ?? false,
    settled_date: record?.settled_date ?? "",
    notes: record?.notes ?? "",
  });

  useEffect(() => {
    const fetchInfluencers = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("influencers")
        .select("*")
        .order("name");
      setInfluencers(data ?? []);
    };
    fetchInfluencers();
  }, []);

  const filteredInfluencers = influencers.filter((inf) =>
    inf.name.toLowerCase().includes(searchInfluencer.toLowerCase())
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      let influencerId = formData.influencer_id;

      // 신규 인플루언서 등록
      if (isNewInfluencer) {
        if (!formData.new_influencer_name.trim()) {
          setError("인플루언서 이름을 입력해주세요.");
          setLoading(false);
          return;
        }
        const { data: newInf, error: infError } = await supabase
          .from("influencers")
          .insert({
            name: formData.new_influencer_name,
            account_url: formData.new_influencer_account_url || null,
          })
          .select()
          .single();
        if (infError) throw infError;
        influencerId = newInf.id;
      }

      if (!influencerId) {
        setError("인플루언서를 선택해주세요.");
        setLoading(false);
        return;
      }

      if (!formData.personal_code.trim()) {
        setError("개인 코드를 입력해주세요.");
        setLoading(false);
        return;
      }

      const payload: CampaignInfluencerInsert = {
        campaign_id: campaignId,
        influencer_id: influencerId,
        personal_code: formData.personal_code,
        is_product_sent: formData.is_product_sent,
        sent_date: formData.sent_date || null,
        content_url: formData.content_url || null,
        is_uploaded: formData.is_uploaded,
        sales_amount: parseFloat(formData.sales_amount) || 0,
        settlement_method: formData.settlement_method || null,
        settlement_amount: parseFloat(formData.settlement_amount) || 0,
        is_settled: formData.is_settled,
        settled_date: formData.settled_date || null,
        notes: formData.notes || null,
      };

      if (record) {
        const { error } = await supabase
          .from("campaign_influencers")
          .update(payload)
          .eq("id", record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("campaign_influencers")
          .insert(payload);
        if (error) throw error;
      }

      router.refresh();
      onClose();
    } catch (e) {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 백드롭 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {record ? "인플루언서 정보 수정" : "인플루언서 추가"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 인플루언서 선택 */}
          {!record && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewInfluencer(false)}
                  className={`btn btn-sm ${!isNewInfluencer ? "btn-primary" : "btn-secondary"}`}
                >
                  기존 인플루언서
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewInfluencer(true)}
                  className={`btn btn-sm ${isNewInfluencer ? "btn-primary" : "btn-secondary"}`}
                >
                  신규 인플루언서
                </button>
              </div>

              {!isNewInfluencer ? (
                <div>
                  <label className="label">인플루언서 선택 *</label>
                  <input
                    type="text"
                    value={searchInfluencer}
                    onChange={(e) => setSearchInfluencer(e.target.value)}
                    placeholder="이름으로 검색"
                    className="input mb-2"
                  />
                  <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                    {filteredInfluencers.length === 0 ? (
                      <p className="text-sm text-gray-400 p-3 text-center">
                        검색 결과가 없습니다.
                      </p>
                    ) : (
                      filteredInfluencers.map((inf) => (
                        <button
                          key={inf.id}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              influencer_id: inf.id,
                            }))
                          }
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                            formData.influencer_id === inf.id
                              ? "bg-primary-50 text-primary-700"
                              : ""
                          }`}
                        >
                          <span>{inf.name}</span>
                          {formData.influencer_id === inf.id && (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="label">이름 *</label>
                    <input
                      type="text"
                      name="new_influencer_name"
                      value={formData.new_influencer_name}
                      onChange={handleChange}
                      className="input"
                      placeholder="인플루언서 이름"
                    />
                  </div>
                  <div>
                    <label className="label">계정 URL</label>
                    <input
                      type="url"
                      name="new_influencer_account_url"
                      value={formData.new_influencer_account_url}
                      onChange={handleChange}
                      className="input"
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 코드 */}
          <div>
            <label className="label">개인 코드 *</label>
            <input
              type="text"
              name="personal_code"
              value={formData.personal_code}
              onChange={handleChange}
              className="input"
              placeholder="개인 할인/추적 코드"
              required
            />
          </div>

          {/* 발송 정보 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">상품 발송</h3>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_product_sent"
                name="is_product_sent"
                checked={formData.is_product_sent}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_product_sent" className="text-sm text-gray-700">
                상품 발송 완료
              </label>
            </div>
            {formData.is_product_sent && (
              <div>
                <label className="label">발송일</label>
                <input
                  type="date"
                  name="sent_date"
                  value={formData.sent_date}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            )}
          </div>

          {/* 콘텐츠 업로드 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">콘텐츠 업로드</h3>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_uploaded"
                name="is_uploaded"
                checked={formData.is_uploaded}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_uploaded" className="text-sm text-gray-700">
                콘텐츠 업로드 완료
              </label>
            </div>
            <div>
              <label className="label">콘텐츠 URL</label>
              <input
                type="url"
                name="content_url"
                value={formData.content_url}
                onChange={handleChange}
                className="input"
                placeholder="https://..."
              />
            </div>
          </div>

          {/* 판매 및 정산 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">판매 및 정산</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">판매금액 (원)</label>
                <input
                  type="number"
                  name="sales_amount"
                  value={formData.sales_amount}
                  onChange={handleChange}
                  className="input"
                  min="0"
                  step="1"
                />
              </div>
              <div>
                <label className="label">정산금액 (원)</label>
                <input
                  type="number"
                  name="settlement_amount"
                  value={formData.settlement_amount}
                  onChange={handleChange}
                  className="input"
                  min="0"
                  step="1"
                />
              </div>
            </div>
            <div>
              <label className="label">정산 방법</label>
              <input
                type="text"
                name="settlement_method"
                value={formData.settlement_method}
                onChange={handleChange}
                className="input"
                placeholder="예: 계좌이체, 현금"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_settled"
                name="is_settled"
                checked={formData.is_settled}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_settled" className="text-sm text-gray-700">
                정산 완료
              </label>
            </div>
            {formData.is_settled && (
              <div>
                <label className="label">정산일</label>
                <input
                  type="date"
                  name="settled_date"
                  value={formData.settled_date}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            )}
          </div>

          {/* 메모 */}
          <div>
            <label className="label">메모</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="input resize-none"
              rows={3}
              placeholder="특이사항 또는 메모"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
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
              ) : record ? (
                "수정 완료"
              ) : (
                "인플루언서 추가"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
