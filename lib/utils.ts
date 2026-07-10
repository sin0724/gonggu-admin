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

export function isCampaignActive(
  startDate: string | null,
  endDate: string | null
): boolean {
  return getCampaignStatus(startDate, endDate) !== "종료";
}

export type CampaignStatus = "예정" | "진행중" | "종료";

/**
 * 캠페인 상태 3단계 — 시작일이 미래면 "예정", 종료일이 지났으면 "종료", 그 외 "진행중".
 * 날짜가 둘 다 없으면 "진행중"으로 간주.
 */
export function getCampaignStatus(
  startDate: string | null,
  endDate: string | null
): CampaignStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (start > today) return "예정";
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (end < today) return "종료";
  }

  return "진행중";
}

export const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, string> = {
  예정: "bg-blue-100 text-blue-700",
  진행중: "bg-green-100 text-green-700",
  종료: "bg-gray-100 text-gray-600",
};
