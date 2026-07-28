import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("ko-KR").format(num);
}

/** 원화 표기: "30,000원" */
export function formatWon(amount: number): string {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

/** 대만달러 표기: "NT$690" */
export function formatTwd(amount: number): string {
  return `NT$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * 원화 → TWD 환산. rate = 1 TWD 당 원화(KRW).
 * 환율이 없거나 0 이하이면 null (TWD 표기 불가).
 */
export function krwToTwd(
  krw: number,
  rate: number | null | undefined
): number | null {
  if (!rate || rate <= 0) return null;
  return krw / rate;
}

/**
 * 메인 TWD + 보조 KRW 한 줄 표기.
 * 환율이 있으면 "NT$690 (30,000원)", 없으면 "30,000원".
 */
export function formatMoney(
  krw: number,
  rate: number | null | undefined
): string {
  const twd = krwToTwd(krw, rate);
  return twd === null ? formatWon(krw) : `${formatTwd(twd)} (${formatWon(krw)})`;
}

// 캠페인 상태는 날짜 추론(예정/진행중/종료)에서 명시적 진행 단계로 옮겼다.
// 단일 소스는 lib/campaign-stage.ts — resolveStage / STAGE_LABEL / STAGE_COLOR 사용.

/**
 * 한글 조사 "로/으로"를 받침에 맞춰 붙인다.
 * 단계 이름이 값에 따라 바뀌는 문구("셋업으로", "진행중으로")에서
 * "(으)로" 같은 회피 표기 없이 자연스럽게 읽히도록.
 * 받침이 없거나 ㄹ 받침이면 "로", 그 외에는 "으로".
 */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  // 한글 음절 영역이 아니면(영문·숫자 등) 판단할 수 없으므로 기본형
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return `${word}로`;
  const jongseong = (code - 0xac00) % 28;
  return jongseong === 0 || jongseong === 8 ? `${word}로` : `${word}으로`;
}
