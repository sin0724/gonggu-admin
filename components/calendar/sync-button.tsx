"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";

/**
 * 팀 구글 캘린더 전체 재동기화.
 *
 * 평소에는 일정 등록/수정/삭제 시 자동으로 반영되지만,
 * 캠페인 기간을 바꿨거나 연동을 새로 붙인 직후처럼 한 번에 맞춰야 할 때 쓴다.
 * 우리가 만든 이벤트만 대상이라 사람이 캘린더에 직접 넣은 일정은 건드리지 않는다.
 */
export default function SyncButton() {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  const run = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 503) {
        toast.error(
          "구글 캘린더 연동이 아직 설정되지 않았습니다. 서비스 계정 환경변수를 확인해 주세요."
        );
        return;
      }
      if (!res.ok) {
        toast.error(`동기화 실패: ${body.error ?? res.status}`);
        return;
      }

      const errors: string[] = body.errors ?? [];
      if (errors.length > 0) {
        // 대부분 원인이 하나(권한 등)인데 이벤트마다 반복돼서 나온다.
        // 이벤트명 접두사를 떼고 원인만 모아 중복을 없앤다.
        const causes = [
          ...new Set(errors.map((e) => e.replace(/^.*?: /, ""))),
        ];
        toast.error(
          causes.length === 1
            ? causes[0]
            : `${causes.length}가지 오류: ${causes.join(" / ")}`
        );
        return;
      }
      toast.success(
        `팀 캘린더 동기화 완료 — ${body.upserted ?? 0}건 반영, ${body.deleted ?? 0}건 정리`
      );
    } catch {
      toast.error("동기화 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={syncing}
      className="btn-secondary btn-sm"
      title="팀 구글 캘린더에 전체 일정을 다시 맞춥니다"
    >
      <svg
        className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {syncing ? "동기화 중..." : "팀 캘린더 동기화"}
    </button>
  );
}
