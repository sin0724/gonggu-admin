"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CampaignSchedule,
  SCHEDULE_KIND_COLOR,
  SCHEDULE_KIND_LABEL,
} from "@/types/database";
import { googleCalendarUrl } from "@/lib/calendar";
import {
  formatDayLabel,
  isoToKstDate,
  isoToKstTime,
  todayKey,
} from "@/lib/schedule";
import ScheduleModal, {
  CalendarCampaignOption,
} from "@/components/calendar/schedule-modal";

interface SchedulePanelProps {
  campaign: CalendarCampaignOption;
  schedules: CampaignSchedule[];
}

/** 캠페인 상세의 일정 섹션 — 등록/수정과 구글 캘린더 단건 추가 */
export default function SchedulePanel({
  campaign,
  schedules,
}: SchedulePanelProps) {
  const router = useRouter();
  const today = todayKey();
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; schedule: CampaignSchedule } | null
  >(null);

  const handleSaved = () => {
    setModal(null);
    router.refresh();
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">캠페인 일정</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            등록한 일정은 진행중 캠페인 캘린더와 구글 캘린더 구독 피드에 함께 표시됩니다.
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="btn-primary btn-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          일정 등록
        </button>
      </div>

      {schedules.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          등록된 일정이 없습니다. 제품 발송·공구 오픈·정산일을 등록해 보세요.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {schedules.map((s) => {
            const date = isoToKstDate(s.start_at);
            const endDate =
              s.all_day && s.end_at ? isoToKstDate(s.end_at) : null;
            const past = (endDate ?? date) < today;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 py-2.5 ${past ? "opacity-50" : ""}`}
              >
                <div className="w-32 shrink-0 text-xs">
                  <p className="font-semibold text-gray-700">
                    {formatDayLabel(date)}
                    {endDate && endDate !== date && (
                      <span className="text-gray-400"> ~ {formatDayLabel(endDate)}</span>
                    )}
                  </p>
                  <p className="text-gray-400">
                    {s.all_day ? "종일" : isoToKstTime(s.start_at)}
                  </p>
                </div>

                <span className={`badge shrink-0 border ${SCHEDULE_KIND_COLOR[s.kind]}`}>
                  {SCHEDULE_KIND_LABEL[s.kind]}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{s.title}</p>
                  {(s.location || s.notes) && (
                    <p className="text-xs text-gray-400 truncate">
                      {[s.location, s.notes].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                <a
                  href={googleCalendarUrl({
                    uid: s.id,
                    title: `[${campaign.client_name} · ${campaign.campaign_name}] ${s.title}`,
                    description: s.notes,
                    location: s.location,
                    allDay: s.all_day,
                    start: s.all_day ? date : s.start_at,
                    end: s.all_day ? (endDate ?? date) : s.end_at,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm shrink-0"
                  title="내 구글 캘린더에 추가"
                >
                  캘린더 추가
                </a>
                <button
                  onClick={() => setModal({ mode: "edit", schedule: s })}
                  className="btn-secondary btn-sm shrink-0"
                >
                  수정
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {modal && (
        <ScheduleModal
          campaigns={[campaign]}
          defaultCampaignId={campaign.id}
          schedule={modal.mode === "edit" ? modal.schedule : undefined}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
