import Link from "next/link";
import { cn } from "@/lib/utils";
import { SCHEDULE_KIND_COLOR, SCHEDULE_KIND_LABEL, ScheduleKind } from "@/types/database";

export interface TaskCampaign {
  id: string;
  name: string;
  count: number;
}

export interface TodaySchedule {
  id: string;
  campaignId: string;
  campaignName: string;
  title: string;
  kind: ScheduleKind;
  /** "오늘" / "내일" / "D-3" */
  when: string;
  dateLabel: string;
}

interface TodayTasksProps {
  pendingSettlement: number;
  /** 제품은 보냈는데 콘텐츠가 안 올라온 KOL — 캠페인별 */
  uploadWaiting: TaskCampaign[];
  /** 진행 단계인데 제품을 아직 안 보낸 KOL — 캠페인별 */
  sendWaiting: TaskCampaign[];
  schedules: TodaySchedule[];
}

const sum = (list: TaskCampaign[]) => list.reduce((s, c) => s + c.count, 0);

function TaskRow({
  tone,
  label,
  hint,
  count,
  unit,
  href,
  campaigns,
}: {
  tone: string;
  label: string;
  hint: string;
  count: number;
  unit: string;
  href: string;
  campaigns?: TaskCampaign[];
}) {
  const done = count === 0;
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold",
            done ? "bg-gray-50 text-gray-300" : tone
          )}
        >
          {done ? "✓" : count}
        </span>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium", done ? "text-gray-400" : "text-gray-900")}>
            {label}
            {!done && (
              <span className="ml-1 text-gray-500 font-normal">
                {count}
                {unit}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400">{done ? "처리할 건이 없습니다" : hint}</p>
        </div>
        {!done && (
          <Link href={href} className="btn-secondary btn-sm shrink-0">
            처리하기
          </Link>
        )}
      </div>
      {/* 어느 캠페인에서 챙겨야 하는지 바로 들어갈 수 있게 */}
      {!done && campaigns && campaigns.length > 0 && (
        <div className="mt-2 ml-12 flex flex-wrap gap-1.5">
          {campaigns.slice(0, 4).map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:border-primary-300 hover:text-primary-700"
            >
              {c.name}
              <span className="font-semibold">{c.count}</span>
            </Link>
          ))}
          {campaigns.length > 4 && (
            <span className="text-xs text-gray-400 self-center">외 {campaigns.length - 4}개</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 대시보드 최상단 "오늘 할 일" — 숫자 현황보다 먼저, 지금 손대야 하는 일을 보여준다.
 * 처음 온 사람도 여기 버튼만 따라가면 하루 업무를 놓치지 않게 하는 것이 목적.
 */
export default function TodayTasks({
  pendingSettlement,
  uploadWaiting,
  sendWaiting,
  schedules,
}: TodayTasksProps) {
  const total =
    pendingSettlement + sum(uploadWaiting) + sum(sendWaiting) + schedules.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="card p-5 lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            오늘 할 일
            {total === 0 && (
              <span className="ml-2 text-xs font-normal text-green-600">모두 처리됨 🎉</span>
            )}
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          <TaskRow
            tone="bg-orange-50 text-orange-600"
            label="KOL 정산(송금)"
            hint="판매가 끝나 돈을 보내야 하는 KOL입니다"
            count={pendingSettlement}
            unit="건"
            href="/settlements"
          />
          <TaskRow
            tone="bg-amber-50 text-amber-600"
            label="제품 발송"
            hint="모집중·진행중 캠페인에서 아직 제품을 안 보낸 KOL입니다"
            count={sum(sendWaiting)}
            unit="명"
            href={sendWaiting[0] ? `/campaigns/${sendWaiting[0].id}` : "/campaigns"}
            campaigns={sendWaiting}
          />
          <TaskRow
            tone="bg-yellow-50 text-yellow-600"
            label="콘텐츠 업로드 확인"
            hint="제품은 받았지만 아직 업로드 체크가 안 된 KOL입니다"
            count={sum(uploadWaiting)}
            unit="명"
            href={uploadWaiting[0] ? `/campaigns/${uploadWaiting[0].id}` : "/campaigns"}
            campaigns={uploadWaiting}
          />
        </div>
      </div>

      <div className="card p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            이번 주 일정
            <span className="ml-2 text-xs font-normal text-gray-400">오늘부터 7일</span>
          </h2>
          <Link
            href="/campaigns/active"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            달력 →
          </Link>
        </div>
        {schedules.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-400">7일 안에 잡힌 일정이 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">
              제품 발송·공구 오픈·정산일은 진행중인 캠페인에서 등록할 수 있어요.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {schedules.slice(0, 6).map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <div className="w-14 shrink-0 text-center">
                  <p
                    className={cn(
                      "text-xs font-bold",
                      s.when === "오늘" ? "text-red-500" : "text-gray-700"
                    )}
                  >
                    {s.when}
                  </p>
                  <p className="text-[10px] text-gray-400">{s.dateLabel}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 badge border text-[10px] px-2",
                    SCHEDULE_KIND_COLOR[s.kind]
                  )}
                >
                  {SCHEDULE_KIND_LABEL[s.kind]}
                </span>
                <Link
                  href={`/campaigns/${s.campaignId}`}
                  className="min-w-0 flex-1 text-sm text-gray-700 hover:text-primary-700 truncate"
                  title={`${s.campaignName} · ${s.title}`}
                >
                  <span className="font-medium">{s.campaignName}</span>
                  <span className="text-gray-400"> · {s.title}</span>
                </Link>
              </li>
            ))}
            {schedules.length > 6 && (
              <li className="text-xs text-gray-400 text-center pt-1">
                외 {schedules.length - 6}건 — 달력에서 확인하세요
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
