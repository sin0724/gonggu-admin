"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { GONGGU_CATEGORIES, Seller, SellerInsert } from "@/types/database";

interface SellerModalProps {
  seller?: Seller;
  onClose: () => void;
  onSaved: () => void;
}

export default function SellerModal({
  seller,
  onClose,
  onSaved,
}: SellerModalProps) {
  const isEdit = !!seller;
  const toast = useToast();

  const [form, setForm] = useState({
    name: seller?.name ?? "",
    contact_name: seller?.contact_name ?? "",
    phone: seller?.phone ?? "",
    email: seller?.email ?? "",
    channel: seller?.channel ?? "",
    channel_url: seller?.channel_url ?? "",
    region: seller?.region ?? "",
    fixed_fee: seller?.fixed_fee?.toString() ?? "",
    rs_rate: seller?.rs_rate?.toString() ?? "",
    notes: seller?.notes ?? "",
    is_active: seller?.is_active ?? true,
  });
  const [categories, setCategories] = useState<string[]>(
    seller?.categories ?? []
  );
  const [customCategory, setCustomCategory] = useState("");
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

  const toggleCategory = (c: string) =>
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );

  const addCustomCategory = () => {
    const c = customCategory.trim();
    if (!c) return;
    if (!categories.includes(c)) setCategories((prev) => [...prev, c]);
    setCustomCategory("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("셀러명을 입력해 주세요.");
      return;
    }
    const rs = form.rs_rate ? parseFloat(form.rs_rate) : null;
    if (rs !== null && (isNaN(rs) || rs < 0 || rs > 100)) {
      setError("RS 요율은 0~100 사이의 숫자여야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const payload: SellerInsert = {
        name: form.name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        channel: form.channel.trim() || null,
        channel_url: form.channel_url.trim() || null,
        region: form.region.trim() || null,
        categories,
        fixed_fee: form.fixed_fee ? Math.round(parseFloat(form.fixed_fee)) : null,
        rs_rate: rs,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };

      if (isEdit) {
        const { error: err } = await supabase
          .from("sellers")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", seller.id);
        if (err) throw err;
        toast.success("셀러 정보가 수정되었습니다.");
      } else {
        const { error: err } = await supabase.from("sellers").insert(payload);
        if (err) throw err;
        toast.success("셀러가 등록되었습니다.");
      }
      onSaved();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "셀러 수정" : "셀러 신규 등록"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">
                셀러명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="input"
                placeholder="예: 대만 A총판"
                required
              />
            </div>
            <div>
              <label className="label">담당자명</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => set("contact_name", e.target.value)}
                className="input"
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="label">지역</label>
              <input
                type="text"
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className="input"
                placeholder="대만 / 타이베이"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">연락처</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className="input"
                placeholder="라인 ID / 전화번호"
              />
            </div>
            <div>
              <label className="label">이메일</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className="input"
                placeholder="seller@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">판매 채널</label>
              <input
                type="text"
                value={form.channel}
                onChange={(e) => set("channel", e.target.value)}
                className="input"
                placeholder="쇼피 / 라인 / 인스타"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">채널 링크</label>
              <input
                type="url"
                value={form.channel_url}
                onChange={(e) => set("channel_url", e.target.value)}
                className="input"
                placeholder="https://"
              />
            </div>
          </div>

          {/* 조건 — 고정비 · RS */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">거래 조건</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">고정비 (원)</label>
                <input
                  type="number"
                  value={form.fixed_fee}
                  onChange={(e) => set("fixed_fee", e.target.value)}
                  className="input"
                  placeholder="예: 500000"
                  min={0}
                  step={1000}
                />
                <p className="text-xs text-gray-400 mt-1">
                  캠페인당 판매와 무관하게 지급하는 금액
                </p>
              </div>
              <div>
                <label className="label">RS 요율 (%)</label>
                <input
                  type="number"
                  value={form.rs_rate}
                  onChange={(e) => set("rs_rate", e.target.value)}
                  className="input"
                  placeholder="예: 15"
                  min={0}
                  max={100}
                  step={0.1}
                />
                <p className="text-xs text-gray-400 mt-1">
                  판매액 대비 셀러 몫 비율
                </p>
              </div>
            </div>
          </div>

          {/* 공구 카테고리 */}
          <div>
            <label className="label">공구 카테고리</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {GONGGU_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    categories.includes(c)
                      ? "bg-primary-600 text-white border-primary-600"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {c}
                </button>
              ))}
              {/* 프리셋에 없는 직접 입력 카테고리 */}
              {categories
                .filter((c) => !(GONGGU_CATEGORIES as readonly string[]).includes(c))
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCategory(c)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border bg-primary-600 text-white border-primary-600"
                  >
                    {c} ✕
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomCategory();
                  }
                }}
                className="input max-w-xs"
                placeholder="카테고리 직접 추가"
              />
              <button
                type="button"
                onClick={addCustomCategory}
                className="btn-secondary btn-sm"
              >
                추가
              </button>
            </div>
          </div>

          <div>
            <label className="label">메모</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="input resize-none"
              rows={2}
              placeholder="정산 조건, 특이사항 등"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            거래중 (해제하면 비활성 셀러로 분류)
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              취소
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "저장 중..." : isEdit ? "수정" : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
