import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildIcs, CalendarEvent } from "@/lib/calendar";
import { STAGE_LABEL, resolveStage } from "@/lib/campaign-stage";
import { SCHEDULE_KIND_LABEL, ScheduleKind } from "@/types/database";

// 구글 캘린더 구독 피드.
// 구글 서버가 로그인 없이 주기적으로 당겨가므로 세션 대신 토큰으로 보호하고,
// 데이터는 service role 키로 읽는다.
//
//   구독 방법: 구글 캘린더 → 다른 캘린더 추가 → URL로 추가
//   https://<배포주소>/api/calendar/ics?token=<CALENDAR_FEED_TOKEN>
//
// 구글은 보통 수 시간 간격으로 갱신하므로 방금 등록한 일정을 바로 보려면
// 일정 카드의 "구글 캘린더에 추가" 링크를 쓰면 된다.

export const dynamic = "force-dynamic";

interface ScheduleRow {
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

interface CampaignRow {
  id: string;
  campaign_name: string;
  client_name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

/** timestamptz → 종일 이벤트용 YYYY-MM-DD (한국 시간 기준) */
function toSeoulDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const seoul = new Date(d.getTime() + 9 * 3600_000);
  return seoul.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const expected = process.env.CALENDAR_FEED_TOKEN;
  if (!expected) {
    return new Response(
      "CALENDAR_FEED_TOKEN 환경변수가 설정되지 않아 캘린더 피드를 제공할 수 없습니다.",
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return new Response(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않아 캘린더 피드를 제공할 수 없습니다.",
      { status: 503 }
    );
  }

  const supabase = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [{ data: schedules }, { data: campaigns }] = await Promise.all([
    supabase
      .from("campaign_schedules")
      .select(
        "id, campaign_id, title, kind, all_day, start_at, end_at, location, notes, updated_at"
      )
      .order("start_at"),
    supabase
      .from("campaigns")
      .select("id, campaign_name, client_name, status, start_date, end_date"),
  ]);

  const campaignById = new Map<string, CampaignRow>(
    ((campaigns ?? []) as CampaignRow[]).map((c) => [c.id, c])
  );

  // 배포 주소 — 일정 설명에 캠페인 상세 링크를 넣어준다
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  const events: CalendarEvent[] = [];

  for (const s of (schedules ?? []) as ScheduleRow[]) {
    const campaign = campaignById.get(s.campaign_id);
    const campaignLabel = campaign
      ? `${campaign.client_name} · ${campaign.campaign_name}`
      : "";
    const detailUrl = campaign ? `${origin}/campaigns/${campaign.id}` : null;

    events.push({
      uid: `schedule-${s.id}`,
      // 캘린더에서는 어느 캠페인 일정인지가 먼저 보여야 한다
      title: campaignLabel
        ? `[${campaignLabel}] ${s.title}`
        : s.title,
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

  // 캠페인 공구 기간 자체도 종일 이벤트 한 건으로 내보낸다 (종료·보류 제외)
  for (const c of (campaigns ?? []) as CampaignRow[]) {
    const stage = resolveStage(c);
    if (stage === "done" || stage === "dropped") continue;
    if (!c.start_date && !c.end_date) continue;
    const start = c.start_date ?? c.end_date!;
    events.push({
      uid: `campaign-${c.id}`,
      title: `🛒 ${c.client_name} · ${c.campaign_name} 공구기간`,
      description: [`단계: ${STAGE_LABEL[stage]}`, `${origin}/campaigns/${c.id}`].join(
        "\n"
      ),
      allDay: true,
      start,
      end: c.end_date ?? start,
      url: `${origin}/campaigns/${c.id}`,
    });
  }

  const ics = buildIcs(events, {
    name: "공구 캠페인 일정",
    description: "공구 어드민에서 등록한 캠페인 기간과 세부 일정",
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="gonggu-campaigns.ics"',
      "Cache-Control": "public, max-age=600",
    },
  });
}
