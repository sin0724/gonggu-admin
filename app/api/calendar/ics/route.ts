import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { buildIcs } from "@/lib/calendar";
import {
  buildSyncEvents,
  CampaignRow,
  ScheduleRow,
} from "@/lib/calendar-events";

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

/**
 * Supabase 키의 role 클레임을 읽는다 — anon 키를 SUPABASE_SERVICE_ROLE_KEY에
 * 잘못 넣으면 RLS에 막혀 "빈 캘린더"가 조용히 나가는 사고가 나서, 진단에서 잡는다.
 * 신형 키(sb_secret_…)는 JWT가 아니라 role을 알 수 없으므로 opaque로 표기.
 */
function keyRole(key: string): string {
  const parts = key.split(".");
  if (parts.length !== 3) return "opaque (JWT 아님)";
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf-8")
    );
    return String(payload.role ?? "unknown");
  } catch {
    return "unknown";
  }
}

/**
 * 외부에서 보이는 배포 주소를 찾는다.
 * Railway/Vercel 뒤에서는 request.url이 내부 주소(https://localhost:8080)라
 * 그대로 쓰면 ICS 안의 캠페인 링크가 죽는다. 우선순위:
 *   NEXT_PUBLIC_SITE_URL → x-forwarded-host → host → request.url
 */
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

  const [
    { data: schedules, error: scheduleError },
    { data: campaigns, error: campaignError },
  ] = await Promise.all([
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

  // 배포 주소 — 일정 설명에 캠페인 상세 링크를 넣어준다.
  // request.url은 Railway 내부 프록시 주소(localhost:8080)라 그대로 쓰면 안 되고,
  // 프록시가 붙여주는 x-forwarded-* 를 먼저 본다.
  const origin = resolveOrigin(request);

  // 이벤트 구성은 구글 API 동기화와 공유한다 (lib/calendar-events.ts)
  const events = buildSyncEvents(
    (campaigns ?? []) as CampaignRow[],
    (schedules ?? []) as ScheduleRow[],
    origin
  );

  // ?debug=1 — 구글에 일정이 안 뜰 때 어디서 끊겼는지 보는 진단용.
  // 키 role이 service_role이 아니면 RLS에 막혀 0건이 나가므로 그것부터 확인한다.
  if (searchParams.get("debug") === "1") {
    return Response.json({
      supabaseKeyRole: keyRole(key),
      campaignCount: campaigns?.length ?? 0,
      scheduleCount: schedules?.length ?? 0,
      eventCount: events.length,
      campaignError: campaignError?.message ?? null,
      scheduleError: scheduleError?.message ?? null,
      origin,
      hint:
        events.length === 0
          ? "이벤트 0건입니다. supabaseKeyRole이 service_role이 아니면 RLS에 막힌 것이고, service_role인데도 0건이면 등록된 일정이 없거나 캠페인이 종료·보류 단계입니다."
          : "피드는 정상입니다. 구글에 안 보이면 구독 갱신 지연(수 시간)이거나 구독 주소가 외부에서 접근 불가한 주소입니다.",
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
