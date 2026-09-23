"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FAQ,
  GLOSSARY,
  GlossaryItem,
  PageGuide,
  ROUTINES,
  WORKFLOW,
} from "@/lib/guide-content";
import { cn } from "@/lib/utils";

// 가이드 패널과 /guide 페이지가 함께 쓰는 렌더러.
// onNavigate: 패널 안에서 링크를 누르면 패널을 닫기 위한 콜백.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
      {children}
    </p>
  );
}

/** 화면 하나의 사용법 — 목적 · 작업 순서 · 팁 · 주의 */
export function PageGuideView({
  guide,
  onNavigate,
}: {
  guide: PageGuide;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-primary-50 border border-primary-100 px-4 py-3">
        <p className="text-xs font-semibold text-primary-700 mb-1">이 화면은</p>
        <p className="text-sm text-gray-700 leading-relaxed">{guide.purpose}</p>
      </div>

      {guide.tasks.map((task) => (
        <div key={task.title}>
          <SectionLabel>이렇게 하세요</SectionLabel>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">{task.title}</h4>
          <ol className="space-y-2">
            {task.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-gray-700 leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {/* 번호는 원으로 그리므로 문구 앞의 ①② 표기는 뗀다 */}
                <span>{step.replace(/^[①-⑩]\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {guide.tips && guide.tips.length > 0 && (
        <div>
          <SectionLabel>알아두면 좋아요</SectionLabel>
          <ul className="space-y-1.5">
            {guide.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
                <span className="text-amber-500 shrink-0">💡</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {guide.cautions && guide.cautions.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
          <p className="text-xs font-semibold text-red-600 mb-1.5">주의하세요</p>
          <ul className="space-y-1.5">
            {guide.cautions.map((c, i) => (
              <li key={i} className="text-sm text-red-700 leading-relaxed">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {guide.related && guide.related.length > 0 && (
        <div>
          <SectionLabel>관련 화면</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {guide.related.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={onNavigate}
                className="btn-secondary btn-sm"
              >
                {r.label} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 거래처 컨택부터 정산까지 — 세로 타임라인 */
export function WorkflowView({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ol className="relative">
      {WORKFLOW.map((step, i) => (
        <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
          {/* 연결선 */}
          {i < WORKFLOW.length - 1 && (
            <span className="absolute left-[13px] top-7 bottom-0 w-px bg-gray-200" />
          )}
          <span className="relative z-10 shrink-0 w-7 h-7 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <div className="flex-1 pt-0.5">
            <p className="text-sm font-semibold text-gray-900">{step.title}</p>
            <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{step.desc}</p>
            <Link
              href={step.href}
              onClick={onNavigate}
              className="inline-block mt-1.5 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              {step.hrefLabel} 바로가기 →
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 매일 · 매주 · 공구 마감 후 체크리스트 */
export function RoutineView() {
  return (
    <div className="grid gap-3">
      {ROUTINES.map((r) => (
        <div key={r.period} className="rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900 mb-2">{r.period}</p>
          <ul className="space-y-1.5">
            {r.items.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
                <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const GLOSSARY_CATEGORIES: (GlossaryItem["category"] | "전체")[] = [
  "전체",
  "단계",
  "돈",
  "사람·조직",
  "시스템",
];

/** 용어 사전 — 검색 + 분류 필터 */
export function GlossaryView() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof GLOSSARY_CATEGORIES)[number]>("전체");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY.filter(
      (g) =>
        (category === "전체" || g.category === category) &&
        (!q || g.term.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q))
    );
  }, [query, category]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="모르는 용어 검색 (예: RS, 견적가)"
        className="input"
      />
      <div className="flex flex-wrap gap-1.5">
        {GLOSSARY_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              category === c
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {c}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          찾는 용어가 없습니다. FAQ를 확인하거나 팀에 문의해 주세요.
        </p>
      ) : (
        <dl className="divide-y divide-gray-100">
          {items.map((g) => (
            <div key={g.term} className="py-2.5">
              <dt className="text-sm font-semibold text-gray-900">{g.term}</dt>
              <dd className="text-sm text-gray-600 mt-0.5 leading-relaxed">{g.desc}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** 자주 묻는 질문 — 접이식. 문서 페이지에서는 인쇄를 위해 펼친 채로 시작 */
export function FaqView({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <div className="divide-y divide-gray-100 border-y border-gray-100">
      {FAQ.map((f) => (
        <details key={f.q} open={defaultOpen} className="group py-3">
          <summary className="flex items-start justify-between gap-3 cursor-pointer list-none text-sm font-medium text-gray-900 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="text-primary-600 font-bold mr-1.5">Q.</span>
              {f.q}
            </span>
            <svg
              className="w-4 h-4 text-gray-400 shrink-0 mt-0.5 transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <p className="mt-2 pl-6 text-sm text-gray-600 leading-relaxed">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
