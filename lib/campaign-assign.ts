import { createClient } from "@/lib/supabase/client";
import { logAssignment } from "@/lib/activity-log";
import type { Manager } from "@/types/database";

/** 배정 대상 캠페인 — 이전 담당자를 기록하려고 현재 manager_id도 받는다 */
export interface AssignTarget {
  id: string;
  campaign_name: string;
  manager_id?: string | null;
}

/**
 * 컬럼이 아직 없는 DB(024 미적용)에서 나는 에러를 사람이 알아들을 말로 바꾼다.
 * 42703 = undefined_column, PGRST204 = 스키마 캐시에 컬럼 없음.
 */
export function assignErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === "42703" || err?.code === "PGRST204" || /manager_id/.test(err?.message ?? "")) {
    return "담당자 배정 컬럼이 없습니다. supabase/migrations/024_manager_roles_and_campaign_assignment.sql 을 적용해 주세요.";
  }
  return err?.message || "담당자 배정 중 오류가 발생했습니다.";
}

/**
 * 캠페인 담당자 일괄 배정 — 단건 변경·목록 일괄 배정·인수인계가 모두 이 함수를 쓴다.
 * 배정 후 활동 로그에 "누가 → 누구" 기록을 남긴다 (로그 실패는 배정을 막지 않음).
 *
 * @returns 활동 로그 기록 성공 여부
 */
export async function assignCampaigns({
  targets,
  managerId,
  managers,
  reason,
}: {
  targets: AssignTarget[];
  /** null이면 배정 해제 */
  managerId: string | null;
  managers: Manager[];
  /** 로그 제목. 없으면 단건은 캠페인명, 여러 건은 "캠페인 N건 배정" */
  reason?: string;
}): Promise<{ logged: boolean }> {
  const changed = targets.filter((t) => (t.manager_id ?? null) !== managerId);
  if (changed.length === 0) return { logged: true };

  const supabase = createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ manager_id: managerId })
    .in(
      "id",
      changed.map((t) => t.id)
    );
  if (error) throw error;

  const nameOf = (id: string | null | undefined) =>
    id ? managers.find((m) => m.id === id)?.name ?? "(삭제된 담당자)" : "미배정";

  const fromNames = Array.from(new Set(changed.map((t) => nameOf(t.manager_id))));
  const logged = await logAssignment({
    campaignId: changed.length === 1 ? changed[0].id : null,
    label:
      reason ??
      (changed.length === 1 ? changed[0].campaign_name : `캠페인 ${changed.length}건 배정`),
    context: `${fromNames.join(", ")} → ${nameOf(managerId)}`,
    snapshot: changed.map((t) => ({
      campaign_id: t.id,
      campaign_name: t.campaign_name,
      from_manager_id: t.manager_id ?? null,
      from_manager: nameOf(t.manager_id),
      to_manager_id: managerId,
      to_manager: nameOf(managerId),
    })),
  });

  return { logged };
}
