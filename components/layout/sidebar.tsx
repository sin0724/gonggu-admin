"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
};

interface NavItem {
  href: string;
  label: string;
  icon: string;
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
    items: [{ href: "/", label: "대시보드", icon: ICON.dashboard, exact: true }],
  },
  {
    title: "캠페인",
    items: [
      // 진행중은 캘린더가 기본 뷰 — 공구는 일정 관리가 핵심이라서
      {
        href: "/campaigns/active",
        label: "진행중인 캠페인",
        icon: ICON.calendar,
      },
      {
        href: "/campaigns/pipeline",
        label: "대기중인 캠페인",
        icon: ICON.inbox,
      },
      { href: "/campaigns", label: "전체 캠페인", icon: ICON.list, exact: true },
    ],
  },
  {
    title: "파트너",
    items: [
      { href: "/kols", label: "KOL 리스트", icon: ICON.star },
      { href: "/sellers", label: "셀러 리스트", icon: ICON.store },
    ],
  },
  {
    title: "영업 · 정산",
    items: [
      { href: "/settlements", label: "정산 관리", icon: ICON.money },
      { href: "/prospects", label: "가망건 관리", icon: ICON.building },
      { href: "/managers", label: "담당자 관리", icon: ICON.user },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

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
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Icon
                    d={item.icon}
                    className={active ? "text-primary-600" : "text-gray-400"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 하단 정보 */}
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">공구 캠페인 관리 v1.1</p>
      </div>
    </aside>
  );
}
