import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 로그인 사용자가 최종 관리자(app_admins)인지 — 담당자 명단 수정 권한.
 *
 * 실제 차단은 DB RLS(managers 쓰기 = is_app_admin())가 하고, 이 값은 화면에서
 * 버튼을 보여줄지 정하는 용도다.
 *
 * @returns true/false, 또는 024 마이그레이션 전이라 판정 함수가 없으면 null.
 *          null이면 DB도 아직 막지 않는 상태이므로 화면도 기존처럼 열어둔다
 *          (canManageManagers 참고).
 */
export async function fetchIsAdmin(supabase: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("is_app_admin");
  if (error) return null;
  return data === true;
}

/** 담당자 추가·수정·퇴사·삭제·인수인계 버튼을 보여줄지 */
export function canManageManagers(isAdmin: boolean | null): boolean {
  return isAdmin !== false;
}
