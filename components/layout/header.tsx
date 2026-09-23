"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { guideForPath } from "@/lib/guide-content";
import { useGuide } from "@/components/guide/guide-provider";
import { BookIcon } from "@/components/guide/guide-drawer";

interface HeaderProps {
  userEmail?: string;
}

export default function Header({ userEmail }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { open, openGuide, closeGuide } = useGuide();
  // 현재 위치 — 처음 쓰는 사람이 "지금 어디에 있는지" 바로 알 수 있게
  const current = guideForPath(pathname);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 print:hidden">
      <div className="min-w-0">
        {current.group && (
          <p className="text-[11px] text-gray-400 leading-tight">{current.group}</p>
        )}
        <p className="text-base font-semibold text-gray-900 truncate">{current.title}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => (open ? closeGuide() : openGuide("page"))}
          className="btn btn-sm bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 focus:ring-amber-400"
          title="이 화면 사용법 보기 (단축키 ?)"
        >
          <BookIcon className="w-4 h-4" />
          사용 가이드
        </button>
        {userEmail && (
          <span className="text-sm text-gray-500 hidden md:inline">{userEmail}</span>
        )}
        <button onClick={handleLogout} className="btn-secondary btn-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          로그아웃
        </button>
      </div>
    </header>
  );
}
