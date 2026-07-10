"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

// 전역 토스트 — alert() 대체. 성공/실패 피드백과 "실행 취소" 액션을 지원한다.

type ToastVariant = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast는 ToastProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}

const VARIANT_STYLES: Record<ToastVariant, { box: string; icon: React.ReactNode }> = {
  success: {
    box: "border-green-200",
    icon: (
      <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  error: {
    box: "border-red-200",
    icon: (
      <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  info: {
    box: "border-blue-200",
    icon: (
      <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, action?: ToastAction) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-3), { id, variant, message, action }]);
      // 액션(실행 취소 등)이 있으면 누를 시간을 더 준다
      const ttl = action ? 7000 : variant === "error" ? 6000 : 3500;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    success: useCallback((m, a) => push("success", m, a), [push]),
    error: useCallback((m, a) => push("error", m, a), [push]),
    info: useCallback((m, a) => push("info", m, a), [push]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 print:hidden">
        {toasts.map((t) => {
          const s = VARIANT_STYLES[t.variant];
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 bg-white border ${s.box} shadow-lg rounded-xl pl-4 pr-2 py-3 min-w-[260px] max-w-sm animate-toast-in`}
            >
              {s.icon}
              <p className="text-sm text-gray-800 flex-1">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700 whitespace-nowrap px-2 py-1 rounded-lg hover:bg-primary-50"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
