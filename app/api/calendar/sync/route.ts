import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildSyncEvents,
  CampaignRow,
  ScheduleRow,
} from "@/lib/calendar-events";
import {
  deleteEvent,
  getGoogleCalendarConfig,
  reconcile,
  upsertEvent,
} from "@/lib/google-calendar";

// 팀 공용 구글 캘린더에 일정을 직접 밀어넣는다.
// 일정 등록/수정/삭제 직후 클라이언트가 호출하고, "전체 동기화" 버튼은 all=true로 부른다.
//
//   { scheduleId }        해당 일정 하나만 반영
//   { deleteScheduleId }  해당 일정 이벤트 삭제
//   { campaignId }        캠페인 공구기간 이벤트 하나만 반영
//   { all: true }         전체 재동기화 + 대상 아닌 이벤트 정리

export const dynamic = "force-dynamic";

const SCHEDULE_COLUMNS =
  "id, campaign_id, title, kind, all_day, start_at, end_at, location, notes, updated_at";
const CAMPAIGN_COLUMNS =
  "id, campaign_name, client_name, status, start_date, end_date";

/** 외부에서 보이는 배포 주소 (프록시 뒤에서는 request.url이 내부 주소다) */
function resolveOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

/** UUID → 구글 event id (lib/calendar-events.ts의 규칙과 같아야 한다) */
function googleId(prefix: "s" | "c", uuid: string): string {
  return `${prefix}${uuid.replace(/-/g, "").toLowerCase()}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const config = getGoogleCalendarConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "구글 캘린더 연동이 설정되지 않았습니다. GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / NEXT_PUBLIC_GOOGLE_CALENDAR_ID 를 확인해 주세요.",
        configured: false,
      },
      { status: 503 }
    );
  }

  let body: {
    scheduleId?: string;
    deleteScheduleId?: string;
    campaignId?: string;
    all?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const origin = resolveOrigin(request);

  try {
    // 삭제는 DB를 볼 필요 없이 결정적 id로 바로 지운다
    if (body.deleteScheduleId) {
      await deleteEvent(config, googleId("s", body.deleteScheduleId));
      return NextResponse.json({ ok: true, deleted: 1 });
    }

    if (body.all) {
      const [{ data: schedules }, { data: campaigns }] = await Promise.all([
        supabase.from("campaign_schedules").select(SCHEDULE_COLUMNS),
        supabase.from("campaigns").select(CAMPAIGN_COLUMNS),
      ]);
      const events = buildSyncEvents(
        (campaigns ?? []) as CampaignRow[],
        (schedules ?? []) as ScheduleRow[],
        origin
      );
      const result = await reconcile(config, events);
      return NextResponse.json({ ok: result.errors.length === 0, ...result });
    }

    // 단건 반영 — 캠페인 정보가 제목에 들어가므로 캠페인도 같이 읽는다
    if (body.scheduleId) {
      const { data: schedule } = await supabase
        .from("campaign_schedules")
        .select(SCHEDULE_COLUMNS)
        .eq("id", body.scheduleId)
        .maybeSingle();
      if (!schedule) {
        return NextResponse.json(
          { error: "일정을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      const { data: campaign } = await supabase
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("id", (schedule as ScheduleRow).campaign_id)
        .maybeSingle();

      const events = buildSyncEvents(
        campaign ? [campaign as CampaignRow] : [],
        [schedule as ScheduleRow],
        origin
      );
      // 캠페인 기간 이벤트까지 섞이지 않게 이 일정 것만 고른다
      const target = events.find((e) => e.uid === `schedule-${body.scheduleId}`);
      if (target) await upsertEvent(config, target);
      return NextResponse.json({ ok: true, upserted: target ? 1 : 0 });
    }

    if (body.campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("id", body.campaignId)
        .maybeSingle();
      if (!campaign) {
        return NextResponse.json(
          { error: "캠페인을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      const events = buildSyncEvents([campaign as CampaignRow], [], origin);
      const target = events.find((e) => e.uid === `campaign-${body.campaignId}`);
      if (target) {
        await upsertEvent(config, target);
        return NextResponse.json({ ok: true, upserted: 1 });
      }
      // 종료·보류로 바뀌었거나 날짜가 지워진 경우 — 캘린더에서 내린다
      await deleteEvent(config, googleId("c", body.campaignId));
      return NextResponse.json({ ok: true, deleted: 1 });
    }

    return NextResponse.json({ error: "대상이 없습니다." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 }
    );
  }
}

/** 연동 설정 여부 확인용 — 화면에서 버튼 노출 판단에 쓴다 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  return NextResponse.json({ configured: getGoogleCalendarConfig() !== null });
}
