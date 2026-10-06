"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Manager, ManagerInsert, ManagerRole } from "@/types/database";
import {
  MANAGER_ROLES,
  managerWriteErrorMessage,
  PERMISSION_DENIED,
  roleOf,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
} from "@/lib/managers";

interface ManagerModalProps {
  manager?: Manager;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  role: "ops" as ManagerRole,
};

export default function ManagerModal({ manager, onClose, onSaved }: ManagerModalProps) {
  const isEdit = !!manager;
  const [formData, setFormData] = useState(
    manager
      ? {
          name: manager.name,
          email: manager.email ?? "",
          phone: manager.phone ?? "",
          role: roleOf(manager),
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
        role: formData.role,
      };

      if (isEdit) {
        // RLS에 막히면 에러 없이 0건이 반영되므로 반영 건수로 권한을 확인한다
        const { data, error } = await supabase
          .from("managers")
          .update(payload)
          .eq("id", manager.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error(PERMISSION_DENIED);
      } else {
        const { error } = await supabase.from("managers").insert(payload);
        if (error) throw error;
      }

      onSaved();
    } catch (e) {
      setError(managerWriteErrorMessage(e));
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
            <label className="label">
              구분 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MANAGER_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, role: r }))}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                    formData.role === r
                      ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="block text-sm font-medium text-gray-900">
                    {ROLE_LABEL[r]} 담당자
                  </span>
                  <span className="block text-xs text-gray-500">{ROLE_DESCRIPTION[r]}</span>
                </button>
              ))}
            </div>
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
            <p className="mt-1 text-xs text-gray-400">
              로그인 계정 이메일과 같게 넣으면 캠페인 목록의 &apos;내 캠페인&apos;에 이 사람 담당 건이 모입니다.
            </p>
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
