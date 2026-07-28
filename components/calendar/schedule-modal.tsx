"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import {
  CampaignSchedule,
  ScheduleKind,
  SCHEDULE_KIND_LABEL,
} from "@/types/database";
import { googleCalendarUrl } from "@/lib/calendar";
import { isoToKstDate, isoToKstTime, kstToIso, todayKey } from "@/lib/schedule";

export interface CalendarCampaignOption {
  id: string;
  campaign_name: string;
  client_name: string;
}

interface ScheduleModalProps {
  /** 수정 대상. 없으면 신규 등록 */
  schedule?: CampaignSchedule;
  /** 캠페인 선택 목록. 1개면 셀렉트를 숨기고 고정한다 */
  campaigns: CalendarCampaignOption[];
  /** 신규 등록 시 미리 채울 캠페인/날짜 */
  defaultCampaignId?: string;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

const KIND_OPTIONS: ScheduleKind[] = [
  "open",
  "close",
  "shipping",
  "content",
  "settlement",
  "meeting",
  "other",
];

export default function ScheduleModal({
  schedule,
  campaigns,
  defaultCampaignId,
  defaultDate,
  onClose,
  onSaved,
}: ScheduleModalProps) {
  const isEdit = !!schedule;
  const toast = useToast();

  const [form, setForm] = useState(() => ({
    campaign_id:
      schedule?.campaign_id ?? defaultCampaignId ?? campaigns[0]?.id ?? "",
    title: schedule?.title ?? "",
    kind: (schedule?.kind ?? "other") as ScheduleKind,
    all_day: schedule?.all_day ?? true,
    start_date: schedule
      ? isoToKstDate(schedule.start_at)
      : defaultDate ?? todayKey(),
    start_time: schedule ? isoToKstTime(schedule.start_at) : "10:00",
    end_date: schedule?.end_at
      ? isoToKstDate(schedule.end_at)
      : schedule
        ? isoToKstDate(schedule.start_at)
        : defaultDate ?? todayKey(),
    end_time: schedule?.end_at ? isoToKstTime(schedule.end_at) : "11:00",
    location: schedule?.location ?? "",
    notes: schedule?.notes ?? "",
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const campaign = campaigns.find((c) => c.id === form.campaign_id);

  /**
   * 팀 구글 캘린더에 반영 — DB 저장이 끝난 뒤 부른다.
   * 연동 미설정(503)이면 조용히 넘어가고, 실패해도 DB 저장은 이미 끝났으므로
   * 저장 자체를 막지 않고 경고만 띄운다.
   */
  const syncToGoogle = async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 503) return;
      const body = await res.json().catch(() => ({}));
      toast.error(
        `구글 캘린더 반영 실패: ${body.error ?? res.status}. 저장은 완료됐습니다.`
      );
    } catch {
      toast.error("구글 캘린더 반영에 실패했습니다. 저장은 완료됐습니다.");
    }
  };

  const buildPayload = () => ({
    campaign_id: form.campaign_id,
    title: form.title.trim(),
    kind: form.kind,
    all_day: form.all_day,
    start_at: kstToIso(form.start_date, form.all_day ? null : form.start_time),
    // 종일이 아닐 때 종료일은 시작일과 같게 두고 시각만 받는다
    end_at: form.all_day
      ? form.end_date && form.end_date !== form.start_date
        ? kstToIso(form.end_date)
        : null
      : kstToIso(form.start_date, form.end_time),
    location: form.location.trim() || null,
    notes: form.notes.trim() || null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.campaign_id) {
      setError("캠페인을 선택해 주세요.");
      return;
    }
    if (!form.title.trim()) {
      setError("일정명을 입력해 주세요.");
      return;
    }
    if (form.all_day && form.end_date && form.end_date < form.start_date) {
      setError("종료일이 시작일보다 빠릅니다.");
      return;
    }
    if (!form.all_day && form.end_time <= form.start_time) {
      setError("종료 시각이 시작 시각보다 빠릅니다.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const payload = buildPayload();

      let savedId: string | null = null;
      if (isEdit) {
        const { error: err } = await supabase
          .from("campaign_schedules")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", schedule.id);
        if (err) throw err;
        savedId = schedule.id;
        toast.success("일정이 수정되었습니다.");
      } else {
        const { data, error: err } = await supabase
          .from("campaign_schedules")
          .insert(payload)
          .select("id")
          .single();
        if (err) throw err;
        savedId = data.id;
        toast.success("일정이 등록되었습니다.");
      }

      if (savedId) await syncToGoogle({ scheduleId: savedId });
      onSaved();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!schedule) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("campaign_schedules")
        .delete()
        .eq("id", schedule.id);
      if (err) throw err;
      await syncToGoogle({ deleteScheduleId: schedule.id });
      toast.success("일정이 삭제되었습니다.");
      onSaved();
    } catch {
      setError("삭제 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  // 저장 전에도 지금 입력값 그대로 내 구글 캘린더에 바로 넣을 수 있게 한다
  const gcalUrl = form.title.trim()
    ? googleCalendarUrl({
        uid: schedule?.id ?? "draft",
        title: campaign
          ? `[${campaign.client_name} · ${campaign.campaign_name}] ${form.title}`
          : form.title,
        description: form.notes || null,
        location: form.location || null,
        allDay: form.all_day,
        start: form.all_day
          ? form.start_date
          : kstToIso(form.start_date, form.start_time),
        end: form.all_day
          ? form.end_date || form.start_date
          : kstToIso(form.start_date, form.end_time),
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "일정 수정" : "일정 등록"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {campaigns.length > 1 && (
            <div>
              <label className="label">
                캠페인 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.campaign_id}
                onChange={(e) => set("campaign_id", e.target.value)}
                className="input"
                required
              >
                <option value="">캠페인 선택</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.client_name} · {c.campaign_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="label">
                일정명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className="input"
                placeholder="예: 1차 제품 발송"
                required
              />
            </div>
            <div>
              <label className="label">유형</label>
              <select
                value={form.kind}
                onChange={(e) => set("kind", e.target.value as ScheduleKind)}
                className="input"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {SCHEDULE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(e) => set("all_day", e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            종일 일정 (시각 없이 날짜만)
          </label>

          {form.all_day ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">시작일</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">종료일 (여러 날일 때)</label>
                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => set("end_date", e.target.value)}
                  className="input"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">날짜</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">시작</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => set("start_time", e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">종료</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => set("end_time", e.target.value)}
                  className="input"
                />
              </div>
            </div>
          )}

          <div>
            <label className="label">장소 · 링크</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              className="input"
              placeholder="예: 강남 사무실 / 줌 링크"
            />
          </div>

          <div>
            <label className="label">메모</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="input resize-none"
              rows={2}
              placeholder="일정 관련 메모"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                >
                  삭제
                </button>
              )}
              {gcalUrl && (
                <a
                  href={gcalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-sm"
                  title="이 일정을 내 구글 캘린더에 바로 추가합니다"
                >
                  구글 캘린더에 추가
                </a>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-secondary">
                취소
              </button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? "저장 중..." : isEdit ? "수정" : "등록"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
