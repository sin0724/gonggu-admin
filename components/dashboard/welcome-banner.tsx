"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WORKFLOW } from "@/lib/guide-content";
import { useGuide } from "@/components/guide/guide-provider";

const STORAGE_KEY = "gonggu-admin:welcome-dismissed";

/**
 * 처음 온 사람용 안내 배너 — 업무 흐름 7단계를 한 줄로 보여주고 가이드로 안내한다.
 * 닫으면 이 브라우저에서는 다시 뜨지 않는다 (가이드는 헤더 버튼으로 언제든 열 수 있음).
 */
export default function WelcomeBanner() {
  // 서버 렌더와 어긋나지 않도록 저장값을 읽기 전까지는 그리지 않는다
  const [visible, setVisible] = useState(false);
  const { openGuide } = useGuide();

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 저장이 막힌 브라우저면 이번 세션에서만 숨긴다
    }
  };

  if (!visible) return null;

  return (
    <div className="card p-5 border-amber-200 bg-gradient-to-br from-amber-50 to-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            공구 어드민에 오신 것을 환영합니다 👋
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            공구 한 건은 아래 순서로 진행됩니다. 단계를 누르면 해당 화면으로 이동해요.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
        >
          다시 보지 않기
        </button>
      </div>

      <ol className="mt-4 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        {WORKFLOW.map((step, i) => (
          <li key={step.title}>
            <Link
              href={step.href}
              title={step.desc}
              className="flex h-full flex-col rounded-lg bg-white border border-amber-100 px-3 py-2.5 hover:border-amber-300 hover:shadow-sm transition"
            >
              <span className="text-[11px] font-bold text-amber-600">STEP {i + 1}</span>
              <span className="text-sm font-medium text-gray-900 leading-snug mt-0.5">
                {step.title}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => openGuide("workflow")} className="btn-primary btn-sm">
          업무 흐름 자세히 보기
        </button>
        <Link href="/guide" className="btn-secondary btn-sm">
          전체 인수인계 문서
        </Link>
        <span className="text-xs text-gray-500">
          어느 화면에서든 우측 상단 <b>사용 가이드</b> 또는{" "}
          <kbd className="px-1 rounded border border-gray-200 bg-white font-sans">?</kbd> 키로
          그 화면 설명을 볼 수 있어요.
        </span>
      </div>
    </div>
  );
}
