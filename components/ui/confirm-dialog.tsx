"use client";

import { useEffect, useState } from "react";

// confirm() 대체 다이얼로그.
// - danger: 확인 버튼을 빨간색으로
// - requireText: 지정한 문자열(예: 캠페인명)을 입력해야 확인 버튼 활성화 (파괴적 작업 보호)
// - checkboxLabel: 부가 옵션 체크박스 (예: "KOL 명단도 함께 복사") — onConfirm에 체크 여부 전달

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: string;
  checkboxLabel?: string;
  loading?: boolean;
  onConfirm: (checked: boolean) => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  requireText,
  checkboxLabel,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  // 다이얼로그가 열릴 때마다 입력 상태 초기화
  useEffect(() => {
    if (open) {
      setTyped("");
      setChecked(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirmDisabled =
    loading || (requireText !== undefined && typed.trim() !== requireText);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={loading ? undefined : onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        {description && (
          <div className="text-sm text-gray-500 mb-4 leading-relaxed">
            {description}
          </div>
        )}

        {requireText !== undefined && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1.5">
              계속하려면{" "}
              <b className="text-gray-800 select-all">{requireText}</b> 를 입력하세요.
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input"
              placeholder={requireText}
              autoFocus
            />
          </div>
        )}

        {checkboxLabel && (
          <label className="flex items-start gap-2 mb-4 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span>{checkboxLabel}</span>
          </label>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(checked)}
            disabled={confirmDisabled}
            className={danger ? "btn-danger" : "btn-primary"}
          >
            {loading ? "처리 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
