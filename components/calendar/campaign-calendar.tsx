"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CampaignSchedule,
  SCHEDULE_KIND_COLOR,
  SCHEDULE_KIND_LABEL,
} from "@/types/database";
import {
  CampaignStage,
  STAGE_COLOR,
  STAGE_DOT,
  STAGE_LABEL,
} from "@/lib/campaign-stage";
import {
  addDays,
  daysBetween,
  isoToKstDate,
  isoToKstTime,
  toDateKey,
  todayKey,
} from "@/lib/schedule";
import ScheduleModal, {
  CalendarCampaignOption,
} from "@/components/calendar/schedule-modal";
import FeedSubscribe from "@/components/calendar/feed-subscribe";
import SyncButton from "@/components/calendar/sync-button";

export interface CalendarCampaign extends CalendarCampaignOption {
  stage: CampaignStage;
  start_date: string | null;
  end_date: string | null;
}

interface CampaignCalendarProps {
  campaigns: CalendarCampaign[];
  schedules: CampaignSchedule[];
  /** 구글 캘린더 구독용 ICS 주소. 환경변수 미설정 시 null */
  feedUrl: string | null;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface Segment {
  campaign: CalendarCampaign;
  col: number;
  span: number;
  startsHere: boolean;
  endsHere: boolean;
  lane: number;
}

/** 한 주(7일) 안에서 캠페인 기간 막대를 겹치지 않게 레인에 배치한다 */
function layoutWeek(
  weekStart: string,
  campaigns: CalendarCampaign[]
): Segment[] {
  const weekEnd = addDays(weekStart, 6);
  const segs: Segment[] = [];

  for (const c of campaigns) {
    const from = c.start_date ?? c.end_date;
    const to = c.end_date ?? c.start_date;
    if (!from || !to) continue;
    if (to < weekStart || from > weekEnd) continue;

    const clipStart = from < weekStart ? weekStart : from;
    const clipEnd = to > weekEnd ? weekEnd : to;
    segs.push({
      campaign: c,
      col: daysBetween(weekStart, clipStart),
      span: daysBetween(clipStart, clipEnd) + 1,
      startsHere: from >= weekStart,
      endsHere: to <= weekEnd,
      lane: 0,
    });
  }

  segs.sort((a, b) => a.col - b.col || b.span - a.span);

  // 레인별로 "다음에 비는 컬럼"을 들고 그리디하게 채운다
  const laneNextFree: number[] = [];
  for (const seg of segs) {
    let lane = 0;
    while (laneNextFree[lane] !== undefined && laneNextFree[lane] > seg.col) {
      lane++;
    }
    laneNextFree[lane] = seg.col + seg.span;
    seg.lane = lane;
  }

  return segs;
}

export default function CampaignCalendar({
  campaigns,
  schedules,
  feedUrl,
}: CampaignCalendarProps) {
  const router = useRouter();
  const today = todayKey();

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [modal, setModal] = useState<
    | { mode: "create"; date: string }
    | { mode: "edit"; schedule: CampaignSchedule }
    | null
  >(null);
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  const visibleCampaigns = useMemo(
    () =>
      campaignFilter === "all"
        ? campaigns
        : campaigns.filter((c) => c.id === campaignFilter),
    [campaigns, campaignFilter]
  );

  const visibleCampaignIds = useMemo(
    () => new Set(visibleCampaigns.map((c) => c.id)),
    [visibleCampaigns]
  );

  /** 달력 그리드 — 그 달 1일이 속한 주의 일요일부터 6주(42일) */
  const weeks = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    const out: string[][] = [];
    for (let w = 0; w < 6; w++) {
      const row: string[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + w * 7 + d);
        row.push(toDateKey(day));
      }
      out.push(row);
    }
    return out;
  }, [cursor]);

  /** 날짜별 일정 — 종일 다중일 일정은 걸치는 모든 날에 표시 */
  const schedulesByDay = useMemo(() => {
    const map = new Map<string, CampaignSchedule[]>();
    for (const s of schedules) {
      if (!visibleCampaignIds.has(s.campaign_id)) continue;
      const start = isoToKstDate(s.start_at);
      const end =
        s.all_day && s.end_at ? isoToKstDate(s.end_at) : start;
      let day = start;
      // 잘못된 데이터로 무한 루프에 빠지지 않게 상한을 둔다
      for (let i = 0; i < 90 && day <= end; i++, day = addDays(day, 1)) {
        const list = map.get(day) ?? [];
        list.push(s);
        map.set(day, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }
    return map;
  }, [schedules, visibleCampaignIds]);

  const campaignById = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns]
  );

  const moveMonth = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const handleSaved = () => {
    setModal(null);
    router.refresh();
  };

  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => moveMonth(-1)}
            className="btn-secondary btn-sm"
            aria-label="이전 달"
          >
            ←
          </button>
          <h2 className="text-lg font-bold text-gray-900 min-w-[130px] text-center">
            {cursor.year}년 {cursor.month + 1}월
          </h2>
          <button
            onClick={() => moveMonth(1)}
            className="btn-secondary btn-sm"
            aria-label="다음 달"
          >
            →
          </button>
          <button onClick={goToday} className="btn-secondary btn-sm ml-1">
            오늘
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="input w-auto text-sm py-1.5"
          >
            <option value="all">전체 캠페인 ({campaigns.length})</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_name} · {c.campaign_name}
              </option>
            ))}
          </select>
          <SyncButton />
          <FeedSubscribe feedUrl={feedUrl} />
          <button
            onClick={() => setModal({ mode: "create", date: today })}
            className="btn-primary btn-sm"
            disabled={campaigns.length === 0}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            일정 등록
          </button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-gray-400 text-sm">진행중인 캠페인이 없습니다.</p>
          <p className="text-gray-400 text-xs mt-1">
            캠페인 단계를 &quot;진행중&quot; 또는 &quot;정산중&quot;으로 바꾸면 여기에 나타납니다.
          </p>
          <Link href="/campaigns/pipeline" className="btn-secondary btn-sm mt-4 inline-flex">
            대기중인 캠페인 보기
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`px-2 py-2 text-center text-xs font-semibold ${
                  i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
                }`}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 주 단위 렌더 — 캠페인 기간 막대는 주별로 span 계산 */}
          {weeks.map((week) => {
            const segments = layoutWeek(week[0], visibleCampaigns);
            const laneCount = segments.reduce(
              (max, s) => Math.max(max, s.lane + 1),
              0
            );

            return (
              <div key={week[0]} className="border-b border-gray-100 last:border-b-0">
                {/* 날짜 숫자 */}
                <div className="grid grid-cols-7">
                  {week.map((day, i) => {
                    const inMonth = day.startsWith(monthPrefix);
                    const isToday = day === today;
                    return (
                      <div
                        key={day}
                        className={`px-2 pt-1.5 text-xs ${
                          inMonth ? "" : "opacity-40"
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-medium ${
                            isToday
                              ? "bg-primary-600 text-white"
                              : i === 0
                                ? "text-red-500"
                                : i === 6
                                  ? "text-blue-500"
                                  : "text-gray-700"
                          }`}
                        >
                          {Number(day.slice(8))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 캠페인 공구 기간 막대 */}
                {laneCount > 0 && (
                  <div
                    className="grid grid-cols-7 gap-y-0.5 px-1 pb-0.5"
                    style={{ gridTemplateRows: `repeat(${laneCount}, auto)` }}
                  >
                    {segments.map((seg) => (
                      <Link
                        key={`${seg.campaign.id}-${week[0]}`}
                        href={`/campaigns/${seg.campaign.id}`}
                        title={`${seg.campaign.client_name} · ${seg.campaign.campaign_name} (${STAGE_LABEL[seg.campaign.stage]})`}
                        className={`${STAGE_DOT[seg.campaign.stage]} text-white text-[11px] leading-none px-1.5 py-1 truncate hover:opacity-85 transition-opacity ${
                          seg.startsHere ? "rounded-l-full" : ""
                        } ${seg.endsHere ? "rounded-r-full" : ""}`}
                        style={{
                          gridColumn: `${seg.col + 1} / span ${seg.span}`,
                          gridRow: seg.lane + 1,
                        }}
                      >
                        {seg.startsHere ? seg.campaign.campaign_name : " "}
                      </Link>
                    ))}
                  </div>
                )}

                {/* 일정 칩 — 빈 영역 클릭 시 그 날짜로 등록 */}
                <div className="grid grid-cols-7">
                  {week.map((day) => {
                    const items = schedulesByDay.get(day) ?? [];
                    const inMonth = day.startsWith(monthPrefix);
                    return (
                      <div
                        key={day}
                        onClick={() => setModal({ mode: "create", date: day })}
                        className={`min-h-[64px] px-1 pb-1.5 space-y-0.5 border-l border-gray-50 first:border-l-0 cursor-pointer hover:bg-gray-50/70 transition-colors ${
                          inMonth ? "" : "bg-gray-50/50"
                        }`}
                      >
                        {items.map((s) => {
                          const c = campaignById.get(s.campaign_id);
                          return (
                            <button
                              key={`${s.id}-${day}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setModal({ mode: "edit", schedule: s });
                              }}
                              title={`${c ? `${c.campaign_name} · ` : ""}${SCHEDULE_KIND_LABEL[s.kind]} · ${s.title}`}
                              className={`w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded border truncate hover:brightness-95 transition ${SCHEDULE_KIND_COLOR[s.kind]}`}
                            >
                              {!s.all_day && (
                                <span className="font-semibold mr-1">
                                  {isoToKstTime(s.start_at)}
                                </span>
                              )}
                              {s.title}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 범례 */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500 px-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-600">캠페인 단계</span>
          {(["live", "settling"] as CampaignStage[]).map((s) => (
            <span key={s} className={`badge ${STAGE_COLOR[s]}`}>
              {STAGE_LABEL[s]}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-600">일정 유형</span>
          {(Object.keys(SCHEDULE_KIND_LABEL) as (keyof typeof SCHEDULE_KIND_LABEL)[]).map(
            (k) => (
              <span
                key={k}
                className={`px-1.5 py-0.5 rounded border text-[11px] ${SCHEDULE_KIND_COLOR[k]}`}
              >
                {SCHEDULE_KIND_LABEL[k]}
              </span>
            )
          )}
        </div>
      </div>

      {modal && (
        <ScheduleModal
          campaigns={campaigns}
          schedule={modal.mode === "edit" ? modal.schedule : undefined}
          defaultDate={modal.mode === "create" ? modal.date : undefined}
          defaultCampaignId={
            campaignFilter !== "all" ? campaignFilter : undefined
          }
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
