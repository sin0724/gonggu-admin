"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { guideForPath } from "@/lib/guide-content";
import { cn } from "@/lib/utils";
import { GuideTab, useGuide } from "@/components/guide/guide-provider";
import {
  FaqView,
  GlossaryView,
  PageGuideView,
  RoutineView,
  WorkflowView,
} from "@/components/guide/guide-sections";

const TABS: { key: GuideTab; label: string }[] = [
  { key: "page", label: "이 화면" },
  { key: "workflow", label: "업무 흐름" },
  { key: "glossary", label: "용어" },
  { key: "faq", label: "FAQ" },
];

/**
 * 우측 인수인계 패널 — 배경을 막지 않는(non-modal) 패널이라
 * 설명을 펴둔 채로 화면을 직접 따라 조작할 수 있다.
 */
export default function GuideDrawer() {
  const { open, tab, setTab, closeGuide } = useGuide();
  const pathname = usePathname();
  const guide = guideForPath(pathname);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 화면이나 탭이 바뀌면 맨 위부터 읽게 한다
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [pathname, tab]);

  return (
    <aside
      aria-label="사용 가이드"
      // 닫힐 때 visibility까지 전환해야 숨은 패널 안 링크로 Tab 포커스가 들어가지 않는다
      className={cn(
        "fixed top-0 right-0 z-40 h-screen w-[420px] max-w-full bg-white border-l border-gray-200 shadow-2xl flex flex-col transition-[transform,visibility] duration-200 ease-out print:hidden",
        open ? "translate-x-0 visible" : "translate-x-full invisible"
      )}
    >
      {/* 헤더 */}
      <div className="h-16 shrink-0 flex items-center justify-between px-5 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
            <BookIcon className="w-4 h-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">사용 가이드</p>
            <p className="text-[11px] text-gray-400 leading-tight">
              <kbd className="px-1 py-px rounded border border-gray-200 bg-gray-50 font-sans">?</kbd>{" "}
              키로 언제든 열고 닫을 수 있어요
            </p>
          </div>
        </div>
        <button
          onClick={closeGuide}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="가이드 닫기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 탭 */}
      <div className="shrink-0 flex gap-1 px-3 pt-3 border-b border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 본문 */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-5">
        {tab === "page" && (
          <>
            <p className="text-xs text-gray-400 mb-1">
              {guide.group ? `${guide.group} › ` : ""}현재 화면
            </p>
            <h3 className="text-lg font-bold text-gray-900 mb-4">{guide.title}</h3>
            <PageGuideView guide={guide} onNavigate={closeGuide} />
          </>
        )}
        {tab === "workflow" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-1">공구 한 건의 흐름</h3>
              <p className="text-sm text-gray-500 mb-4">
                업체 컨택부터 KOL 정산까지, 이 순서대로 화면을 옮겨 다니며 일합니다.
              </p>
              <WorkflowView onNavigate={closeGuide} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-3">정기 업무</h3>
              <RoutineView />
            </div>
          </div>
        )}
        {tab === "glossary" && <GlossaryView />}
        {tab === "faq" && <FaqView />}
      </div>

      {/* 하단 — 전체 문서 */}
      <div className="shrink-0 px-5 py-3 border-t border-gray-200 bg-gray-50">
        <Link
          href="/guide"
          onClick={closeGuide}
          className="flex items-center justify-between text-sm font-medium text-gray-700 hover:text-primary-700"
        >
          전체 인수인계 문서 보기 (인쇄 가능)
          <span aria-hidden>→</span>
        </Link>
      </div>
    </aside>
  );
}

export function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("w-5 h-5", className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
