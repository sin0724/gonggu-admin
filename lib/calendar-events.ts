/**
 * 캘린더로 내보낼 이벤트 목록 생성 — ICS 피드와 구글 캘린더 API 동기화가
 * 같은 결과를 보도록 여기 한 곳에서만 만든다.
 *
 * 두 종류를 내보낸다.
 *  - schedule-*  : campaign_schedules에 등록한 세부 일정
 *  - campaign-*  : 캠페인 공구 기간 (종료·보류 단계는 제외)
 */

import { CalendarEvent } from "@/lib/calendar";
import { resolveStage, STAGE_LABEL } from "@/lib/campaign-stage";
import { SCHEDULE_KIND_LABEL, ScheduleKind } from "@/types/database";

export interface ScheduleRow {
  id: string;
  campaign_id: string;
  title: string;
  kind: ScheduleKind;
  all_day: boolean;
  start_at: string;
  end_at: string | null;
  location: string | null;
  notes: string | null;
  updated_at: string;
}

export interface CampaignRow {
  id: string;
  campaign_name: string;
  client_name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

/** 구글 이벤트 ID로도 쓸 수 있는 안정적 식별자를 붙인 이벤트 */
export interface SyncEvent extends CalendarEvent {
  /**
   * 구글 캘린더 event id. 허용 문자가 base32hex(a-v, 0-9)뿐이라
   * UUID의 하이픈을 제거한 16진수에 접두 문자만 붙인다.
   * 결정적이라 같은 일정을 다시 밀면 새로 생기지 않고 갱신된다.
   */
  googleId: string;
}

/** timestamptz → 종일 이벤트용 YYYY-MM-DD (한국 시간 기준) */
export function toSeoulDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** UUID → 구글 event id (a-v, 0-9만 허용하므로 하이픈 제거) */
function googleId(prefix: "s" | "c", uuid: string): string {
  return `${prefix}${uuid.replace(/-/g, "").toLowerCase()}`;
}

export function buildSyncEvents(
  campaigns: CampaignRow[],
  schedules: ScheduleRow[],
  origin: string
): SyncEvent[] {
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const events: SyncEvent[] = [];

  for (const s of schedules) {
    const campaign = campaignById.get(s.campaign_id);
    const label = campaign
      ? `${campaign.client_name} · ${campaign.campaign_name}`
      : "";
    const detailUrl = campaign ? `${origin}/campaigns/${campaign.id}` : null;

    events.push({
      googleId: googleId("s", s.id),
      uid: `schedule-${s.id}`,
      // 캘린더에서는 어느 캠페인 일정인지가 먼저 보여야 한다
      title: label ? `[${label}] ${s.title}` : s.title,
      description: [
        `유형: ${SCHEDULE_KIND_LABEL[s.kind] ?? "기타"}`,
        s.notes,
        detailUrl,
      ]
        .filter(Boolean)
        .join("\n"),
      location: s.location,
      allDay: s.all_day,
      start: s.all_day ? toSeoulDate(s.start_at) : s.start_at,
      end: s.end_at ? (s.all_day ? toSeoulDate(s.end_at) : s.end_at) : null,
      url: detailUrl,
      updatedAt: s.updated_at,
    });
  }

  // 캠페인 공구 기간 — 손 뗀 단계(종료·보류)는 캘린더를 어지럽히므로 제외
  for (const c of campaigns) {
    const stage = resolveStage(c);
    if (stage === "done" || stage === "dropped") continue;
    if (!c.start_date && !c.end_date) continue;
    const start = c.start_date ?? c.end_date!;
    events.push({
      googleId: googleId("c", c.id),
      uid: `campaign-${c.id}`,
      title: `🛒 ${c.client_name} · ${c.campaign_name} 공구기간`,
      description: [
        `단계: ${STAGE_LABEL[stage]}`,
        `${origin}/campaigns/${c.id}`,
      ].join("\n"),
      allDay: true,
      start,
      end: c.end_date ?? start,
      url: `${origin}/campaigns/${c.id}`,
    });
  }

  return events;
}
