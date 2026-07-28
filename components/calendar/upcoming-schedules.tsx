"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  CampaignSchedule,
  SCHEDULE_KIND_COLOR,
  SCHEDULE_KIND_LABEL,
} from "@/types/database";
import { googleCalendarUrl } from "@/lib/calendar";
import {
  daysBetween,
  formatDayLabel,
  isoToKstDate,
  isoToKstTime,
  todayKey,
} from "@/lib/schedule";
import type { CalendarCampaign } from "@/components/calendar/campaign-calendar";

interface UpcomingSchedulesProps {
  schedules: CampaignSchedule[];
  campaigns: CalendarCampaign[];
  /** 몇 건까지 보여줄지 */
  limit?: number;
}

/** 달력 아래 "다가오는 일정" 목록 — 오늘 이후 순으로 임박한 것부터 */
export default function UpcomingSchedules({
  schedules,
  campaigns,
  limit = 8,
}: UpcomingSchedulesProps) {
  const today = todayKey();
  const campaignById = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns]
  );

  const upcoming = useMemo(
    () =>
      schedules
        .map((s) => ({ s, date: isoToKstDate(s.start_at) }))
        .filter((x) => x.date >= today)
        .sort((a, b) => a.s.start_at.localeCompare(b.s.start_at))
        .slice(0, limit),
    [schedules, today, limit]
  );

  if (upcoming.length === 0) return null;

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">다가오는 일정</h3>
      <ul className="divide-y divide-gray-100">
        {upcoming.map(({ s, date }) => {
          const campaign = campaignById.get(s.campaign_id);
          const dday = daysBetween(today, date);
          return (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="w-20 shrink-0">
                <p className="text-xs font-semibold text-gray-700">
                  {formatDayLabel(date)}
                </p>
                <p
                  className={`text-[11px] ${dday === 0 ? "text-primary-600 font-semibold" : "text-gray-400"}`}
                >
                  {dday === 0 ? "오늘" : `D-${dday}`}
                </p>
              </div>

              <span
                className={`badge shrink-0 border ${SCHEDULE_KIND_COLOR[s.kind]}`}
              >
                {SCHEDULE_KIND_LABEL[s.kind]}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  {!s.all_day && (
                    <span className="text-gray-500 mr-1.5">
                      {isoToKstTime(s.start_at)}
                    </span>
                  )}
                  {s.title}
                </p>
                {campaign && (
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    {campaign.client_name} · {campaign.campaign_name}
                  </Link>
                )}
              </div>

              <a
                href={googleCalendarUrl({
                  uid: s.id,
                  title: campaign
                    ? `[${campaign.client_name} · ${campaign.campaign_name}] ${s.title}`
                    : s.title,
                  description: s.notes,
                  location: s.location,
                  allDay: s.all_day,
                  start: s.all_day ? date : s.start_at,
                  end: s.all_day
                    ? s.end_at
                      ? isoToKstDate(s.end_at)
                      : date
                    : s.end_at,
                })}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm shrink-0"
                title="구글 캘린더에 추가"
              >
                캘린더 추가
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
