"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useGuide } from "@/components/guide/guide-provider";

/** 사이드바 아이콘 — 24 viewBox 스트로크 패스만 넘긴다 */
function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      className={cn("w-5 h-5", className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}

const ICON = {
  dashboard:
    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  calendar:
    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  inbox:
    "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4",
  list: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  star: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  store:
    "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  money:
    "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  building:
    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  history:
    "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  book: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
};

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** 한 줄 설명 — 활성 메뉴 아래에 보이고, 나머지는 마우스를 올리면 보인다 */
  desc: string;
  /** 정확히 일치할 때만 활성 (하위 경로에 다른 메뉴가 있는 경우) */
  exact?: boolean;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      {
        href: "/",
        label: "대시보드",
        icon: ICON.dashboard,
        desc: "오늘 할 일과 전체 현황",
        exact: true,
      },
    ],
  },
  {
    title: "캠페인",
    items: [
      // 진행중은 캘린더가 기본 뷰 — 공구는 일정 관리가 핵심이라서
      {
        href: "/campaigns/active",
        label: "진행중인 캠페인",
        icon: ICON.calendar,
        desc: "공구 중·정산 중 캠페인 달력",
      },
      {
        href: "/campaigns/pipeline",
        label: "대기중인 캠페인",
        icon: ICON.inbox,
        desc: "오픈 전 캠페인 (가망·셋업·모집)",
      },
      {
        href: "/campaigns",
        label: "전체 캠페인",
        icon: ICON.list,
        desc: "모든 캠페인 목록·단계 변경",
        exact: true,
      },
    ],
  },
  {
    title: "파트너",
    items: [
      {
        href: "/kols",
        label: "KOL 리스트",
        icon: ICON.star,
        desc: "CRM KOL 조회 (섭외 후보 찾기)",
      },
      {
        href: "/sellers",
        label: "셀러 리스트",
        icon: ICON.store,
        desc: "총판·셀러 명단과 공구매출",
      },
    ],
  },
  {
    title: "영업 · 정산",
    items: [
      {
        href: "/settlements",
        label: "정산 관리",
        icon: ICON.money,
        desc: "KOL 송금 대기·완료 처리",
      },
      {
        href: "/prospects",
        label: "거래처 관리",
        icon: ICON.building,
        desc: "컨택한 업체(브랜드) 명단",
      },
      {
        href: "/managers",
        label: "담당자 관리",
        icon: ICON.user,
        desc: "거래처를 맡는 우리 팀원",
      },
    ],
  },
  {
    title: "시스템",
    items: [
      {
        href: "/activity",
        label: "활동 로그",
        icon: ICON.history,
        desc: "삭제 기록과 원본",
      },
      {
        href: "/guide",
        label: "인수인계 가이드",
        icon: ICON.book,
        desc: "처음 쓰는 사람을 위한 설명서",
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { openGuide } = useGuide();

  const isActive = (item: NavItem) => {
    if (item.exact) {
      // /campaigns는 목록 전용 — /campaigns/active·pipeline·[id]에서는 활성 아님
      if (item.href === "/campaigns") {
        return pathname === "/campaigns" || /^\/campaigns\/[0-9a-f-]{8}/i.test(pathname);
      }
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-gray-200 flex flex-col print:hidden">
      {/* 브랜드 */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <Icon d={ICON.list} className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">공구 어드민</span>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.title ?? `group-${i}`} className="space-y-1">
            {group.title && (
              <p className="px-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.desc}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Icon
                    d={item.icon}
                    className={cn(
                      "shrink-0",
                      active ? "text-primary-600" : "text-gray-400"
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block leading-5">{item.label}</span>
                    {active && (
                      <span className="block text-[11px] font-normal text-primary-500 leading-4 mt-0.5">
                        {item.desc}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 도움말 — 처음 쓰는 사람이 막혔을 때 가장 먼저 찾는 자리 */}
      <div className="p-3 border-t border-gray-200 space-y-2">
        <button
          onClick={() => openGuide("page")}
          className="w-full text-left rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 hover:bg-amber-100 transition-colors"
        >
          <p className="text-xs font-semibold text-amber-800">사용법이 궁금하세요?</p>
          <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
            지금 보는 화면 설명 열기 ·{" "}
            <kbd className="px-1 rounded border border-amber-200 bg-white font-sans">?</kbd> 키
          </p>
        </button>
        <p className="text-[11px] text-gray-400 text-center">공구 캠페인 관리 v1.2</p>
      </div>
    </aside>
  );
}
