import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import CampaignCalendar, {
  CalendarCampaign,
} from "@/components/calendar/campaign-calendar";
import UpcomingSchedules from "@/components/calendar/upcoming-schedules";
import { ACTIVE_STAGES, resolveStage, STAGE_COLOR, STAGE_LABEL } from "@/lib/campaign-stage";
import { Campaign, CampaignSchedule } from "@/types/database";

/** 구글 캘린더 구독 주소 — 토큰이 설정된 경우에만 만든다 */
async function buildFeedUrl(): Promise<string | null> {
  const token = process.env.CALENDAR_FEED_TOKEN;
  if (!token) return null;

  let origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    origin = `${proto}://${host}`;
  }
  return `${origin.replace(/\/$/, "")}/api/calendar/ics?token=${encodeURIComponent(token)}`;
}

export default async function ActiveCampaignsPage() {
  const supabase = await createClient();

  const [{ data: rawCampaigns, error }, feedUrl] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, campaign_name, client_name, status, start_date, end_date")
      .order("start_date", { ascending: true, nullsFirst: false }),
    buildFeedUrl(),
  ]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  // status 컬럼이 비어 있는 구 데이터는 날짜로 단계를 추론한다
  const active: CalendarCampaign[] = (
    (rawCampaigns ?? []) as Pick<
      Campaign,
      "id" | "campaign_name" | "client_name" | "status" | "start_date" | "end_date"
    >[]
  )
    .map((c) => ({ ...c, stage: resolveStage(c) }))
    .filter((c) => ACTIVE_STAGES.includes(c.stage));

  const { data: rawSchedules } = active.length
    ? await supabase
        .from("campaign_schedules")
        .select("*")
        .in(
          "campaign_id",
          active.map((c) => c.id)
        )
        .order("start_at")
    : { data: [] };

  const schedules = (rawSchedules ?? []) as CampaignSchedule[];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">진행중인 캠페인</h1>
          <p className="text-sm text-gray-500 mt-1">
            공구가 열려 있거나 정산 중인 캠페인의 기간과 일정을 달력으로 봅니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ACTIVE_STAGES.map((s) => {
            const count = active.filter((c) => c.stage === s).length;
            return (
              <div key={s} className="card px-4 py-2.5 text-center">
                <span className={`badge ${STAGE_COLOR[s]}`}>{STAGE_LABEL[s]}</span>
                <p className="text-lg font-bold text-gray-900 mt-1">{count}</p>
              </div>
            );
          })}
          <Link href="/campaigns" className="btn-secondary btn-sm">
            전체 캠페인
          </Link>
        </div>
      </div>

      <CampaignCalendar
        campaigns={active}
        schedules={schedules}
        feedUrl={feedUrl}
      />

      <UpcomingSchedules
        schedules={schedules}
        campaigns={active}
      />
    </div>
  );
}
