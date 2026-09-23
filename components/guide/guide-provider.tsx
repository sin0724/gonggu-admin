"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import GuideDrawer from "@/components/guide/guide-drawer";

export type GuideTab = "page" | "workflow" | "glossary" | "faq";

interface GuideContextValue {
  open: boolean;
  tab: GuideTab;
  setTab: (tab: GuideTab) => void;
  openGuide: (tab?: GuideTab) => void;
  closeGuide: () => void;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide는 GuideProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}

/** 입력 중에는 ? 단축키를 가로채지 않는다 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * 인수인계 가이드 패널 상태 — 헤더 버튼·사이드바·대시보드 배너 어디서든 연다.
 * 단축키: ? 열기/닫기, Esc 닫기.
 */
export default function GuideProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GuideTab>("page");

  const openGuide = useCallback((next: GuideTab = "page") => {
    setTab(next);
    setOpen(true);
  }, []);
  const closeGuide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) setTab("page");
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <GuideContext.Provider value={{ open, tab, setTab, openGuide, closeGuide }}>
      {children}
      <GuideDrawer />
    </GuideContext.Provider>
  );
}
