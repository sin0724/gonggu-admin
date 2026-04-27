"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Manager, ManagerInsert } from "@/types/database";

interface ManagerModalProps {
  manager?: Manager;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
};

export default function ManagerModal({ manager, onClose, onSaved }: ManagerModalProps) {
  const isEdit = !!manager;
  const [formData, setFormData] = useState(
    manager
      ? {
          name: manager.name,
          email: manager.email ?? "",
          phone: manager.phone ?? "",
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const payload: ManagerInsert = {
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("managers")
          .update(payload)
          .eq("id", manager.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("managers").insert(payload);
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
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "담당자 수정" : "담당자 신규 등록"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input"
              placeholder="홍길동"
              required
            />
          </div>

          <div>
            <label className="label">이메일</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="input"
              placeholder="example@company.com"
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
