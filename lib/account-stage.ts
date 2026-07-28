/**
 * 거래처의 거래 단계 — 캠페인 연결 여부에서 자동으로 파생된다.
 *
 * prospects.status(발송완료/입점완료/무응답/거절)는 "쇼피 입점 링크를 보냈고
 * 답이 왔는가"라는 컨택 이력이지, 실제 거래 여부가 아니다. 캠페인을 등록하고
 * 나면 더 이상 가망건이 아닌데도 같은 목록에 섞여 있어 구분이 안 됐다.
 *
 * 그래서 "이 업체에 연결된 캠페인이 어느 단계에 있는가"로 거래 단계를 따로 만든다.
 * 사람이 손으로 관리하는 값이 아니라 항상 캠페인 실제 상태를 따라간다.
 */

import { ACTIVE_STAGES, CampaignStage, PIPELINE_STAGES } from "@/lib/campaign-stage";

export type AccountStage = "가망" | "준비중" | "거래중" | "거래종료";

export const ACCOUNT_STAGES: AccountStage[] = [
  "가망",
  "준비중",
  "거래중",
  "거래종료",
];

export const ACCOUNT_STAGE_COLOR: Record<AccountStage, string> = {
  가망: "bg-slate-100 text-slate-600",
  준비중: "bg-purple-100 text-purple-700",
  거래중: "bg-green-100 text-green-700",
  거래종료: "bg-gray-100 text-gray-500",
};

export const ACCOUNT_STAGE_DESCRIPTION: Record<AccountStage, string> = {
  가망: "아직 캠페인이 없는 업체",
  준비중: "캠페인을 등록했고 공구 오픈 전",
  거래중: "공구가 진행 중이거나 정산 중",
  거래종료: "진행했던 캠페인이 모두 종료됨",
};

/**
 * 이 업체에 연결된 캠페인들의 단계로 거래 단계를 정한다.
 * 여러 캠페인이 있으면 가장 활발한 쪽을 대표로 삼는다 (거래중 > 준비중 > 종료).
 */
export function resolveAccountStage(
  campaignStages: CampaignStage[]
): AccountStage {
  if (campaignStages.length === 0) return "가망";
  if (campaignStages.some((s) => ACTIVE_STAGES.includes(s))) return "거래중";
  if (campaignStages.some((s) => PIPELINE_STAGES.includes(s))) return "준비중";
  return "거래종료";
}
