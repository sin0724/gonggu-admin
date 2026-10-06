/**
 * 공동구매 인센티브 계산 (사내 보상안: 영업 4% · 관리 6%).
 *
 *   기준금액 = 입금된 밴더 순수수료(VAT 제외) − 직접 실비   (마이너스면 0)
 *   영업 = 기준금액 × 4%, 관리 = 기준금액 × 6%
 *
 * 지급은 "누적 정산" 방식으로 계산한다.
 *   이번 달 지급액 = (지급월까지 확정된 누적 기준금액 × 요율) − 이전에 확정 지급한 금액
 * 그래서 부분입금(입금될 때마다 늘어남), 사후 환불(음수 수수료), 늦게 들어온 실비가
 * 별도 처리 없이 다음 명세표에서 자동으로 더해지거나 차감된다.
 *
 * 화면·DB와 분리된 순수 함수만 둔다 — 급여 계산이라 검산 가능해야 한다.
 */

import type { ManagerRole } from "@/types/database";

export const INCENTIVE_RATE: Record<ManagerRole, number> = {
  sales: 0.04,
  ops: 0.06,
};

/** 지급일 (지급월의 며칠) */
export const PAY_DAY = 10;

export type ExpenseCategory =
  | "ads"
  | "samples"
  | "shipping"
  | "free_seeding"
  | "content"
  | "outsourcing"
  | "shooting"
  | "promotion"
  | "live_event"
  | "travel"
  | "third_party_fee"
  | "remittance";

/** 보상안 4항 직접 실비 항목 — 순서도 문서와 같게 */
export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string; hint: string }[] = [
  { key: "ads", label: "광고 집행비", hint: "Meta·TikTok·네이버 등 이 공구를 위해 별도 집행한 광고비" },
  { key: "samples", label: "샘플·제품비", hint: "회사가 구매·부담한 샘플, 증정품, 테스트 제품" },
  { key: "shipping", label: "배송비", hint: "샘플·증정품·KOL 발송 등 회사 부담 배송·국제배송" },
  { key: "free_seeding", label: "무가시딩 비용", hint: "광고주에게 KOL 비용을 받지 않았는데 회사가 KOL에 실제 지급한 비용" },
  { key: "content", label: "콘텐츠 제작비", hint: "촬영·편집·디자인·배너·상세페이지 별도 제작" },
  { key: "outsourcing", label: "외주비", hint: "프리랜서·제작사·대행사·현지 파트너" },
  { key: "shooting", label: "촬영 관련 비용", hint: "스튜디오·장비대여·모델·헤어메이크업·소품" },
  { key: "promotion", label: "프로모션 비용", hint: "회사 부담 쿠폰·적립금·경품·판촉비" },
  { key: "live_event", label: "라이브·행사 비용", hint: "장소대관·장비·진행자·현장 운영" },
  { key: "travel", label: "출장·현장 비용", hint: "이 공구 수행을 위한 교통·숙박·현장 운영비" },
  { key: "third_party_fee", label: "제3자 수수료", hint: "소개·에이전시·파트너 수수료" },
  { key: "remittance", label: "송금·통관 비용", hint: "이 공구 건에 귀속되는 해외송금·환전·통관" },
];

export const EXPENSE_LABEL = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label])
) as Record<ExpenseCategory, string>;

export interface CampaignSettlement {
  id: string;
  campaign_id: string;
  statement_date: string | null;
  order_amount: number | null;
  adjustment_amount: number | null;
  adjustment_note: string | null;
  vendor_fee: number;
  deposit_amount: number | null;
  deposited_on: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CampaignExpense {
  id: string;
  campaign_id: string;
  category: ExpenseCategory;
  amount: number;
  spent_on: string | null;
  description: string | null;
  evidence_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface IncentivePayout {
  id: string;
  pay_month: string;
  manager_id: string | null;
  manager_name: string;
  manager_email: string | null;
  campaign_id: string | null;
  campaign_name: string;
  role: ManagerRole;
  fee_total: number;
  expense_total: number;
  base_amount: number;
  rate: number;
  entitled_total: number;
  previously_paid: number;
  amount: number;
  confirmed_at: string;
  confirmed_by: string | null;
  paid_at: string | null;
}

/** 인센티브 계산에 필요한 캠페인 필드 */
export interface IncentiveCampaign {
  id: string;
  campaign_name: string;
  client_name: string;
  end_date: string | null;
  manager_id?: string | null;
  sales_manager_id?: string | null;
}

/** "YYYY-MM" */
export type MonthKey = string;

const monthOf = (date: string): MonthKey => date.slice(0, 7);

export function nextMonth(m: MonthKey): MonthKey {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 1)); // mo는 1-based라 그대로 넣으면 다음 달
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function prevMonth(m: MonthKey): MonthKey {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-10" → "2026년 10월" */
export function monthLabel(m: MonthKey): string {
  const [y, mo] = m.split("-").map(Number);
  return `${y}년 ${mo}월`;
}

/** "2026-10" → "10월 10일" */
export function payDayLabel(m: MonthKey): string {
  return `${Number(m.split("-")[1])}월 ${PAY_DAY}일`;
}

/**
 * 정산 한 건의 지급월.
 * 캠페인 종료일과 입금일 중 늦은 날이 속한 달의 다음 달 (그 달 10일 지급).
 * 예) 9/14 종료·9월 입금 → 10월, 9/14 종료·10/5 입금 → 11월.
 * 입금 전이면 null (미수금에는 지급하지 않는다).
 */
export function payMonthFor(
  campaignEndDate: string | null,
  depositedOn: string | null
): MonthKey | null {
  if (!depositedOn) return null;
  const later = campaignEndDate && campaignEndDate > depositedOn ? campaignEndDate : depositedOn;
  return nextMonth(monthOf(later));
}

/** 오늘 기준으로 다음에 돌아오는 지급월 — 10일까지는 이번 달, 지나면 다음 달 */
export function upcomingPayMonth(now = new Date()): MonthKey {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const m = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
  return kst.getUTCDate() <= PAY_DAY ? m : nextMonth(m);
}

export interface CampaignIncentiveSummary {
  /** 지급월까지 반영되는 입금 수수료 합 */
  feeEligible: number;
  /** 입금됐지만 지급월이 더 뒤인 수수료 (예: 공구 진행 중 부분입금) */
  feeLater: number;
  /** 아직 입금 전인 수수료 (미수) */
  feeUnpaid: number;
  expenseTotal: number;
  /** max(0, feeEligible − expenseTotal) */
  base: number;
  sales: number;
  ops: number;
}

/**
 * 캠페인 한 건의 누적 기준금액.
 * 실비는 입력된 것을 전부 먼저 차감한다 (보상안: 실비를 "먼저" 차감한 뒤 계산).
 *
 * @param uptoMonth 이 지급월까지 반영. 생략하면 입금된 것 전부
 */
export function summarizeCampaign(
  campaign: Pick<IncentiveCampaign, "end_date">,
  settlements: Pick<CampaignSettlement, "vendor_fee" | "deposited_on">[],
  expenses: Pick<CampaignExpense, "amount">[],
  uptoMonth?: MonthKey
): CampaignIncentiveSummary {
  let feeEligible = 0;
  let feeLater = 0;
  let feeUnpaid = 0;
  for (const s of settlements) {
    const pm = payMonthFor(campaign.end_date, s.deposited_on);
    if (!pm) feeUnpaid += s.vendor_fee;
    else if (!uptoMonth || pm <= uptoMonth) feeEligible += s.vendor_fee;
    else feeLater += s.vendor_fee;
  }
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const base = Math.max(0, feeEligible - expenseTotal);
  return {
    feeEligible,
    feeLater,
    feeUnpaid,
    expenseTotal,
    base,
    sales: Math.round(base * INCENTIVE_RATE.sales),
    ops: Math.round(base * INCENTIVE_RATE.ops),
  };
}

export interface StatementLine {
  campaignId: string;
  campaignName: string;
  clientName: string;
  role: ManagerRole;
  /** 지급 대상. 담당 미지정이면 null → 지급 보류 */
  managerId: string | null;
  feeTotal: number;
  expenseTotal: number;
  base: number;
  rate: number;
  entitledTotal: number;
  previouslyPaid: number;
  /** 이번 달 지급액. 음수면 이전 지급분 차감 */
  amount: number;
}

/**
 * 지급월 명세표 (미확정 상태의 실시간 계산).
 * 이번 달 지급액이 0이 아닌 줄만 돌려준다.
 */
export function buildStatement(params: {
  month: MonthKey;
  campaigns: IncentiveCampaign[];
  settlements: CampaignSettlement[];
  expenses: CampaignExpense[];
  /** 이미 확정된 명세 전체 (이번 달보다 이전 것만 차감에 쓴다) */
  payouts: Pick<IncentivePayout, "pay_month" | "campaign_id" | "role" | "amount">[];
}): StatementLine[] {
  const { month, campaigns, settlements, expenses, payouts } = params;
  const lines: StatementLine[] = [];

  for (const c of campaigns) {
    const cs = settlements.filter((s) => s.campaign_id === c.id);
    const prior = payouts.filter((p) => p.campaign_id === c.id && p.pay_month.slice(0, 7) < month);
    if (cs.length === 0 && prior.length === 0) continue;

    const sum = summarizeCampaign(
      c,
      cs,
      expenses.filter((e) => e.campaign_id === c.id),
      month
    );

    for (const role of ["sales", "ops"] as ManagerRole[]) {
      const entitledTotal = role === "sales" ? sum.sales : sum.ops;
      const previouslyPaid = prior
        .filter((p) => p.role === role)
        .reduce((s, p) => s + p.amount, 0);
      const amount = entitledTotal - previouslyPaid;
      if (amount === 0) continue;
      lines.push({
        campaignId: c.id,
        campaignName: c.campaign_name,
        clientName: c.client_name,
        role,
        managerId: (role === "sales" ? c.sales_manager_id : c.manager_id) ?? null,
        feeTotal: sum.feeEligible,
        expenseTotal: sum.expenseTotal,
        base: sum.base,
        rate: INCENTIVE_RATE[role],
        entitledTotal,
        previouslyPaid,
        amount,
      });
    }
  }
  return lines;
}
