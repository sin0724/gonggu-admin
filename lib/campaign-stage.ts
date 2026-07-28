/**
 * 캠페인 진행 단계 — campaigns.status 컬럼의 단일 소스.
 *
 * 날짜(start_date/end_date)로 추론하던 "예정/진행중/종료" 3단계로는
 * 계약 전 가망건이나 셋업 중인 건을 구분할 수 없어서 명시적 단계로 관리한다.
 * 날짜는 이제 공구 기간 표시·캘린더 배치에만 쓴다.
 */

export type CampaignStage =
  | "lead"
  | "setup"
  | "recruiting"
  | "live"
  | "settling"
  | "done"
  | "dropped";

export const CAMPAIGN_STAGES: CampaignStage[] = [
  "lead",
  "setup",
  "recruiting",
  "live",
  "settling",
  "done",
  "dropped",
];

export const STAGE_LABEL: Record<CampaignStage, string> = {
  lead: "가망",
  setup: "셋업",
  recruiting: "모집중",
  live: "진행중",
  settling: "정산중",
  done: "종료",
  dropped: "보류",
};

export const STAGE_DESCRIPTION: Record<CampaignStage, string> = {
  lead: "제안·협의 중, 계약 전",
  setup: "확정. 가격·물량·소재 준비",
  recruiting: "KOL·셀러 섭외 및 제품 발송",
  live: "공구 오픈, 판매 진행 중",
  settling: "판매 종료. KOL 정산·입금 처리 중",
  done: "정산까지 완료",
  dropped: "드랍·무산",
};

export const STAGE_COLOR: Record<CampaignStage, string> = {
  lead: "bg-slate-100 text-slate-600",
  setup: "bg-purple-100 text-purple-700",
  recruiting: "bg-blue-100 text-blue-700",
  live: "bg-green-100 text-green-700",
  settling: "bg-orange-100 text-orange-700",
  done: "bg-gray-100 text-gray-500",
  dropped: "bg-red-50 text-red-500",
};

/** 캘린더/사이드바 등에서 캠페인 막대 색으로 쓰는 진한 배경 */
export const STAGE_DOT: Record<CampaignStage, string> = {
  lead: "bg-slate-400",
  setup: "bg-purple-500",
  recruiting: "bg-blue-500",
  live: "bg-green-500",
  settling: "bg-orange-500",
  done: "bg-gray-400",
  dropped: "bg-red-400",
};

/** 공구가 실제로 돌아가고 있는 단계 — "진행중인 캠페인" */
export const ACTIVE_STAGES: CampaignStage[] = ["live", "settling"];

/** 아직 오픈 전인 단계 — "대기중인 캠페인" */
export const PIPELINE_STAGES: CampaignStage[] = ["lead", "setup", "recruiting"];

/** 손 뗀 단계 */
export const CLOSED_STAGES: CampaignStage[] = ["done", "dropped"];

/**
 * 저장된 status를 안전하게 해석한다.
 * status 컬럼 도입 전 데이터(null)는 날짜로 추론해서 채운다.
 */
export function resolveStage(campaign: {
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}): CampaignStage {
  const raw = campaign.status;
  if (raw && (CAMPAIGN_STAGES as string[]).includes(raw)) {
    return raw as CampaignStage;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (campaign.end_date && campaign.end_date < today) return "done";
  if (campaign.start_date && campaign.start_date > today) return "setup";
  return "live";
}

export function isActiveStage(stage: CampaignStage): boolean {
  return ACTIVE_STAGES.includes(stage);
}

export function isPipelineStage(stage: CampaignStage): boolean {
  return PIPELINE_STAGES.includes(stage);
}
