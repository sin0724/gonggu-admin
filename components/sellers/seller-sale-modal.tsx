"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { SellerSale, SellerSaleInsert } from "@/types/database";
import { todayKey } from "@/lib/schedule";
import { logDeletion } from "@/lib/activity-log";

export interface SaleCampaignOption {
  id: string;
  campaign_name: string;
  client_name: string;
}

interface SellerSaleModalProps {
  sellerId: string;
  sellerName: string;
  sale?: SellerSale;
  /** 캠페인 연결 선택지 — 우리 시스템 밖 공구면 비워두고 제목만 적는다 */
  campaigns: SaleCampaignOption[];
  onClose: () => void;
  onSaved: () => void;
}

/** 셀러의 지난 공구 실적 등록/수정 */
export default function SellerSaleModal({
  sellerId,
  sellerName,
  sale,
  campaigns,
  onClose,
  onSaved,
}: SellerSaleModalProps) {
  const isEdit = !!sale;
  const toast = useToast();

  const [form, setForm] = useState({
    campaign_id: sale?.campaign_id ?? "",
    title: sale?.title ?? "",
    sale_date: sale?.sale_date ?? todayKey(),
    amount: sale?.amount?.toString() ?? "",
    quantity: sale?.quantity?.toString() ?? "",
    notes: sale?.notes ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** 캠페인을 고르면 공구명을 자동으로 채워준다 (비어 있을 때만) */
  const handleCampaignChange = (id: string) => {
    const c = campaigns.find((x) => x.id === id);
    setForm((prev) => ({
      ...prev,
      campaign_id: id,
      title: prev.title.trim() || (c ? `${c.client_name} ${c.campaign_name}` : ""),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("공구명을 입력해 주세요.");
      return;
    }
    const amount = form.amount ? parseFloat(form.amount) : 0;
    if (isNaN(amount) || amount < 0) {
      setError("매출액은 0 이상의 숫자여야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const payload: SellerSaleInsert = {
        seller_id: sellerId,
        campaign_id: form.campaign_id || null,
        title: form.title.trim(),
        sale_date: form.sale_date || null,
        amount: Math.round(amount),
        quantity: form.quantity ? parseInt(form.quantity, 10) : null,
        notes: form.notes.trim() || null,
      };

      if (isEdit) {
        const { error: err } = await supabase
          .from("seller_sales")
          .update(payload)
          .eq("id", sale.id);
        if (err) throw err;
        toast.success("실적이 수정되었습니다.");
      } else {
        const { error: err } = await supabase.from("seller_sales").insert(payload);
        if (err) throw err;
        toast.success("실적이 등록되었습니다.");
      }
      onSaved();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!sale) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await logDeletion({
        entityType: "seller_sale",
        entityId: sale.id,
        entityLabel: sale.title,
        context: `${sellerName} · ${(sale.amount || 0).toLocaleString("ko-KR")}원`,
        snapshot: sale,
      });
      const { error: err } = await supabase
        .from("seller_sales")
        .delete()
        .eq("id", sale.id);
      if (err) throw err;
      toast.success("실적이 삭제되었습니다.");
      onSaved();
    } catch (e) {
      setError((e as Error).message || "삭제 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "공구 실적 수정" : "공구 실적 등록"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{sellerName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">캠페인 연결 (선택)</label>
            <select
              value={form.campaign_id}
              onChange={(e) => handleCampaignChange(e.target.value)}
              className="input"
            >
              <option value="">연결 안 함 (외부 공구)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.client_name} · {c.campaign_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">
              공구명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="input"
              placeholder="예: 2026 봄 콜라겐 공구"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">진행일</label>
              <input
                type="date"
                value={form.sale_date}
                onChange={(e) => set("sale_date", e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">
                매출액 (원) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                className="input"
                placeholder="12000000"
                min={0}
                step={1000}
                required
              />
            </div>
            <div>
              <label className="label">수량</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                className="input"
                placeholder="300"
                min={0}
              />
            </div>
          </div>

          <div>
            <label className="label">메모</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="input resize-none"
              rows={2}
              placeholder="반응, 재구매율 등"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
              >
                삭제
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-secondary">
                취소
              </button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? "저장 중..." : isEdit ? "수정" : "등록"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
