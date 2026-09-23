import PrintButton from "@/components/campaigns/print-button";
import {
  FaqView,
  GlossaryView,
  PageGuideView,
  RoutineView,
  WorkflowView,
} from "@/components/guide/guide-sections";
import { PAGE_GUIDES } from "@/lib/guide-content";

// 인수인계 문서 — 새 담당자가 처음부터 끝까지 읽는 용도.
// 내용은 lib/guide-content.ts 한 곳에서 관리하고, 우측 가이드 패널과 공유한다.

const SECTIONS = [
  { id: "intro", label: "시스템 소개" },
  { id: "workflow", label: "업무 흐름" },
  { id: "routine", label: "정기 업무" },
  { id: "screens", label: "화면별 사용법" },
  { id: "glossary", label: "용어 사전" },
  { id: "faq", label: "자주 묻는 질문" },
];

/** 문서에는 실제 사이드바 메뉴 화면만 싣는다 (이 페이지 자신 제외) */
const SCREEN_GUIDES = PAGE_GUIDES.filter((g) => g.key !== "guide");

function Section({
  id,
  no,
  title,
  desc,
  children,
}: {
  id: string;
  no: number;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card p-6 scroll-mt-4 break-inside-avoid-page">
      <h2 className="text-lg font-bold text-gray-900">
        <span className="text-primary-600 mr-2">{no}.</span>
        {title}
      </h2>
      {desc && <p className="text-sm text-gray-500 mt-1">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function GuidePage() {
  return (
    <div className="max-w-5xl mx-auto flex gap-6 print:block">
      {/* 목차 */}
      <nav className="hidden lg:block w-48 shrink-0 print:hidden">
        <div className="sticky top-0 space-y-1">
          <p className="px-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            목차
          </p>
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block px-2 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              {i + 1}. {s.label}
            </a>
          ))}
          <div className="pl-4 pt-1 space-y-0.5">
            {SCREEN_GUIDES.map((g) => (
              <a
                key={g.key}
                href={`#screen-${g.key}`}
                className="block px-2 py-1 rounded-md text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                {g.title}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div className="flex-1 min-w-0 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">인수인계 가이드</h1>
            <p className="text-sm text-gray-500 mt-1">
              공구 어드민을 처음 쓰는 분을 위한 설명서입니다. 1번부터 순서대로 읽으면
              전체 업무를 이해할 수 있습니다.
            </p>
          </div>
          <PrintButton />
        </div>

        <Section id="intro" no={1} title="시스템 소개">
          <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
            <p>
              공구 어드민은 <b>브랜드 제품을 KOL(인플루언서)·셀러를 통해 공동구매로 판매</b>
              하는 업무를 관리하는 시스템입니다. 업체 컨택 → 캠페인 등록 → KOL 섭외 → 공구
              진행 → KOL 정산까지 한 곳에서 처리합니다.
            </p>
            <div className="grid sm:grid-cols-3 gap-3 pt-1">
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">캠페인</p>
                <p className="text-xs text-gray-500 mt-1">
                  공구 1건. 가격·수수료 조건과 참여 KOL·셀러, 일정을 담습니다.
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">파트너</p>
                <p className="text-xs text-gray-500 mt-1">
                  제품을 파는 KOL과 셀러. KOL 정보는 CRM에서 가져옵니다.
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">영업 · 정산</p>
                <p className="text-xs text-gray-500 mt-1">
                  컨택한 업체(거래처)와 KOL에게 보낼 돈(정산)을 관리합니다.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              💡 어느 화면에서든 우측 상단 <b>사용 가이드</b> 버튼이나 <b>?</b> 키를 누르면
              지금 보고 있는 화면의 설명이 열립니다.
            </p>
          </div>
        </Section>

        <Section
          id="workflow"
          no={2}
          title="업무 흐름"
          desc="공구 한 건은 이 순서로 진행됩니다. 각 단계에서 사용하는 화면으로 바로 이동할 수 있습니다."
        >
          <WorkflowView />
        </Section>

        <Section id="routine" no={3} title="정기 업무" desc="놓치기 쉬운 반복 업무 체크리스트입니다.">
          <RoutineView />
        </Section>

        <Section
          id="screens"
          no={4}
          title="화면별 사용법"
          desc="왼쪽 메뉴 순서대로 각 화면에서 하는 일과 방법입니다."
        >
          <div className="space-y-8">
            {SCREEN_GUIDES.map((g) => (
              <div
                key={g.key}
                id={`screen-${g.key}`}
                className="scroll-mt-4 border-t border-gray-100 pt-6 first:border-0 first:pt-0 break-inside-avoid"
              >
                <p className="text-xs text-gray-400">{g.group ?? "홈"}</p>
                <h3 className="text-base font-bold text-gray-900 mb-3">{g.title}</h3>
                <PageGuideView guide={g} />
              </div>
            ))}
          </div>
        </Section>

        <Section id="glossary" no={5} title="용어 사전" desc="화면에 나오는 업무 용어 설명입니다.">
          <GlossaryView />
        </Section>

        <Section id="faq" no={6} title="자주 묻는 질문">
          <FaqView defaultOpen />
        </Section>
      </div>
    </div>
  );
}
