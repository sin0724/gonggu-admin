"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Manager,
  ProspectWithManager,
  ProspectInsert,
  ProspectStatus,
} from "@/types/database";

interface ProspectModalProps {
  prospect?: ProspectWithManager;
  managers: Manager[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS: ProspectStatus[] = ["발송완료", "입점완료", "무응답", "거절"];

const EMPTY_FORM = {
  company_name: "",
  business_number: "",
  contact_name: "",
  phone: "",
  notes: "",
  status: "발송완료" as ProspectStatus,
  manager_id: "",
};

export default function ProspectModal({ prospect, managers, onClose, onSaved }: ProspectModalProps) {
  const isEdit = !!prospect;
  const [formData, setFormData] = useState(
    prospect
      ? {
          company_name: prospect.company_name,
          business_number: prospect.business_number,
          contact_name: prospect.contact_name ?? "",
          phone: prospect.phone ?? "",
          notes: prospect.notes ?? "",
          status: prospect.status,
          manager_id: prospect.manager_id ?? "",
        }
      : EMPTY_FORM
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const payload: ProspectInsert = {
        company_name: formData.company_name,
        business_number: formData.business_number,
        contact_name: formData.contact_name || null,
        phone: formData.phone || null,
        notes: formData.notes || null,
        status: formData.status,
        manager_id: formData.manager_id || null,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("prospects")
          .update(payload)
          .eq("id", prospect.id);
        if (error) throw error;
      } else {
        const { data: existing } = await supabase
          .from("prospects")
          .select("id")
          .eq("business_number", payload.business_number)
          .maybeSingle();

        if (existing) {
          setError("이미 등록된 사업자번호입니다.");
          return;
        }

        const { error } = await supabase.from("prospects").insert(payload);
        if (error) throw error;
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
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "가망건 수정" : "가망건 신규 등록"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">
                상호명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                className="input"
                placeholder="예: (주)브랜드명"
                required
              />
            </div>
            <div>
              <label className="label">
                사업자번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="business_number"
                value={formData.business_number}
                onChange={handleChange}
                className="input"
                placeholder="000-00-00000"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">담당자명 (업체측)</label>
              <input
                type="text"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleChange}
                className="input"
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="label">전화번호</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="input"
                placeholder="010-0000-0000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">우리측 담당자</label>
              <select
                name="manager_id"
                value={formData.manager_id}
                onChange={handleChange}
                className="input"
              >
                <option value="">담당자 없음</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">상태</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">특이사항</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="input resize-none"
              rows={3}
              placeholder="메모할 내용을 입력하세요"
            />
          </div>

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
