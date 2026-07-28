import { createClient } from "@/lib/supabase/client";

/**
 * 삭제 활동 로그.
 *
 * 삭제 "직전"에 기록하고, 기록에 실패하면 삭제를 진행하지 않는다.
 * 로그가 조용히 빠지면 안전장치에 구멍이 생기고, 정작 사고가 났을 때
 * 아무것도 남아 있지 않기 때문이다. 그래서 이 함수는 실패 시 throw 한다.
 */

export type ActivityEntity =
  | "campaign"
  | "campaign_influencer"
  | "campaign_seller"
  | "campaign_schedule"
  | "seller"
  | "seller_sale"
  | "prospect"
  | "manager";

export const ENTITY_LABEL: Record<ActivityEntity, string> = {
  campaign: "캠페인",
  campaign_influencer: "캠페인 KOL",
  campaign_seller: "캠페인 셀러",
  campaign_schedule: "캠페인 일정",
  seller: "셀러",
  seller_sale: "셀러 실적",
  prospect: "거래처",
  manager: "담당자",
};

export const ENTITY_COLOR: Record<ActivityEntity, string> = {
  campaign: "bg-blue-100 text-blue-700",
  campaign_influencer: "bg-violet-100 text-violet-700",
  campaign_seller: "bg-amber-100 text-amber-700",
  campaign_schedule: "bg-sky-100 text-sky-700",
  seller: "bg-orange-100 text-orange-700",
  seller_sale: "bg-yellow-100 text-yellow-700",
  prospect: "bg-indigo-100 text-indigo-700",
  manager: "bg-gray-100 text-gray-600",
};

export interface ActivityLog {
  id: string;
  actor_email: string | null;
  actor_id: string | null;
  action: "delete" | "create" | "update";
  entity_type: ActivityEntity;
  entity_id: string | null;
  entity_label: string;
  context: string | null;
  snapshot: Record<string, unknown> | null;
  created_at: string;
}

interface LogDeletionParams {
  entityType: ActivityEntity;
  entityId: string | null;
  /** 삭제 후에도 사람이 알아볼 이름 (캠페인명·셀러명 등) */
  entityLabel: string;
  /** 어디에 속한 것인지 (예: "유이앤루이 · 에코픽 공구") */
  context?: string | null;
  /** 삭제될 행 원본 — 복구 근거가 되므로 가능한 한 통째로 넘긴다 */
  snapshot?: unknown;
}

/**
 * 삭제를 기록한다. 반드시 실제 delete 호출 "전에" 부른다.
 * 실패하면 throw 하므로 호출부의 try/catch가 삭제를 중단시킨다.
 */
export async function logDeletion(params: LogDeletionParams): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("activity_logs").insert({
    actor_email: user?.email ?? null,
    actor_id: user?.id ?? null,
    action: "delete",
    entity_type: params.entityType,
    entity_id: params.entityId,
    entity_label: params.entityLabel,
    context: params.context ?? null,
    // JSONB로 그대로 들어가도록 직렬화 가능한 형태만 넘긴다
    snapshot: params.snapshot
      ? JSON.parse(JSON.stringify(params.snapshot))
      : null,
  });

  if (error) {
    // 42P01 = 테이블 없음. 마이그레이션 미적용을 바로 알 수 있게 구분해준다
    if (error.code === "42P01") {
      throw new Error(
        "활동 로그 테이블이 없어 삭제를 중단했습니다. supabase/migrations/022_activity_logs.sql 을 적용해 주세요."
      );
    }
    throw new Error(`활동 로그 기록에 실패해 삭제를 중단했습니다: ${error.message}`);
  }
}
