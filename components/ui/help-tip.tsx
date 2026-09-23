import { cn } from "@/lib/utils";

interface HelpTipProps {
  /** 풍선에 보여줄 설명 */
  text: string;
  /** 풍선이 펼쳐지는 방향 — 화면 가장자리 카드는 안쪽으로 */
  align?: "center" | "left" | "right";
  className?: string;
}

/**
 * 용어·숫자 옆 ⓘ 아이콘 — 마우스를 올리거나 Tab으로 포커스하면 설명이 뜬다.
 * CSS만 쓰므로 서버 컴포넌트에서도 그대로 쓸 수 있다.
 */
export default function HelpTip({ text, align = "center", className }: HelpTipProps) {
  return (
    <span
      tabIndex={0}
      role="note"
      aria-label={text}
      className={cn(
        "group/tip relative inline-flex align-middle ml-1 text-gray-300 hover:text-gray-500 focus:text-gray-500 focus:outline-none cursor-help",
        className
      )}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full mb-2 z-30 w-60 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case tracking-normal leading-relaxed text-white shadow-lg whitespace-normal text-left",
          "opacity-0 invisible transition-opacity group-hover/tip:opacity-100 group-hover/tip:visible group-focus/tip:opacity-100 group-focus/tip:visible",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "left" && "left-0",
          align === "right" && "right-0"
        )}
      >
        {text}
      </span>
    </span>
  );
}
