import type { Manager, ManagerRole } from "@/types/database";
import type { CampaignStage } from "@/lib/campaign-stage";

/**
 * 담당자 구분 — 영업(거래처 컨택) / 관리(캠페인 운영).
 * 캠페인 배정은 주로 관리 담당자가 받지만, 영업 담당자가 직접 굴리는 캠페인도
 * 있어서 배정 목록에서 영업 담당자를 막지는 않는다 (관리 담당자를 위에 보여줄 뿐).
 */

export const MANAGER_ROLES: ManagerRole[] = ["ops", "sales"];

export const ROLE_LABEL: Record<ManagerRole, string> = {
  sales: "영업",
  ops: "관리",
};

export const ROLE_DESCRIPTION: Record<ManagerRole, string> = {
  sales: "거래처(브랜드) 컨택·입점 담당",
  ops: "캠페인 운영·KOL·정산 담당",
};

export const ROLE_COLOR: Record<ManagerRole, string> = {
  sales: "bg-sky-100 text-sky-700",
  ops: "bg-emerald-100 text-emerald-700",
};

/** 024 마이그레이션 전 DB(컬럼 없음)에서도 화면이 죽지 않도록 기본값을 채운다 */
export function roleOf(m: Pick<Manager, "role">): ManagerRole {
  return m.role === "ops" ? "ops" : "sales";
}

export function isActiveManager(m: Pick<Manager, "is_active">): boolean {
  return m.is_active !== false;
}

/** "임패유 (관리)" / "나병훈 (영업·퇴사)" */
export function managerLabel(m: Manager): string {
  const tags = [ROLE_LABEL[roleOf(m)]];
  if (!isActiveManager(m)) tags.push("퇴사");
  return `${m.name} (${tags.join("·")})`;
}

/**
 * 배정 드롭다운용 정렬 — 재직 중인 관리 담당자 → 영업 담당자 순, 이름순.
 * 퇴사자는 새로 배정할 수 없으므로 뺀다. 단, 이미 배정돼 있는 사람(keepId)은
 * 선택값이 사라지지 않도록 남긴다.
 */
export function assignableManagers(managers: Manager[], keepId?: string | null): Manager[] {
  return managers
    .filter((m) => isActiveManager(m) || m.id === keepId)
    .sort((a, b) => {
      const r = MANAGER_ROLES.indexOf(roleOf(a)) - MANAGER_ROLES.indexOf(roleOf(b));
      return r !== 0 ? r : a.name.localeCompare(b.name, "ko");
    });
}

/** 로그인 계정 이메일로 "나"에 해당하는 담당자를 찾는다 */
export function findManagerByEmail(
  managers: Manager[],
  email: string | null | undefined
): Manager | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return managers.find((m) => m.email?.trim().toLowerCase() === e) ?? null;
}

/**
 * 인수인계 때 기본으로 넘길 캠페인 단계 — 아직 손이 가는 건만.
 * 종료·보류 건은 기록 보존용으로 원래 담당자에게 남기는 게 기본이고,
 * 필요하면 인수인계 창에서 직접 체크해서 함께 넘긴다.
 */
export const HANDOVER_DEFAULT_STAGES: CampaignStage[] = [
  "lead",
  "setup",
  "recruiting",
  "live",
  "settling",
];

/**
 * managers 쓰기 실패를 사람이 알아들을 말로.
 * RLS에 막힌 UPDATE/DELETE는 에러 없이 0건만 반영되므로 호출부에서
 * 반영 건수를 확인해 PERMISSION_DENIED를 던진다.
 */
export const PERMISSION_DENIED = "PERMISSION_DENIED";

export function managerWriteErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.message === PERMISSION_DENIED || err?.code === "42501" || /row-level security/i.test(err?.message ?? "")) {
    return "담당자 명단은 최종 관리자 계정만 수정할 수 있습니다.";
  }
  if (err?.code === "42703" || err?.code === "PGRST204") {
    return "담당자 구분 컬럼이 없습니다. supabase/migrations/024_manager_roles_and_campaign_assignment.sql 을 적용해 주세요.";
  }
  return err?.message || "저장 중 오류가 발생했습니다.";
}
