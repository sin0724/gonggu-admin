"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ActivityLog,
  ActivityEntity,
  ENTITY_COLOR,
  ENTITY_LABEL,
} from "@/lib/activity-log";
import { useToast } from "@/components/ui/toast";

interface ActivityTableProps {
  logs: ActivityLog[];
}

/** "2026-07-28T09:16:38Z" → "7/28 (화) 18:16" (KST) */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const week = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} (${week}) ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

export default function ActivityTable({ logs }: ActivityTableProps) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<"all" | ActivityEntity>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: logs.length };
    for (const l of logs) counts[l.entity_type] = (counts[l.entity_type] ?? 0) + 1;
    return counts;
  }, [logs]);

  // 실제로 기록이 있는 종류만 탭으로 보여준다
  const presentEntities = useMemo(
    () =>
      (Object.keys(ENTITY_LABEL) as ActivityEntity[]).filter(
        (e) => (entityCounts[e] ?? 0) > 0
      ),
    [entityCounts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (entityFilter !== "all" && l.entity_type !== entityFilter) return false;
      if (!q) return true;
      return [l.entity_label, l.context, l.actor_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [logs, search, entityFilter]);

  const copySnapshot = async (log: ActivityLog) => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(log.snapshot, null, 2)
      );
      toast.success("삭제된 원본 데이터를 복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 · 실행자 검색"
            className="input pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {(["all", ...presentEntities] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEntityFilter(e)}
            className={`btn btn-sm flex items-center gap-1.5 ${
              entityFilter === e ? "btn-primary" : "btn-secondary"
            }`}
          >
            {e === "all" ? "전체" : ENTITY_LABEL[e]}
            <span
              className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                entityFilter === e ? "bg-white/30 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {entityCounts[e] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">일시</th>
                <th className="table-header">종류</th>
                <th className="table-header">대상</th>
                <th className="table-header">실행자</th>
                <th className="table-header text-right">원본</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-gray-400 text-sm">
                    {logs.length === 0
                      ? "아직 삭제 기록이 없습니다."
                      : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const isOpen = expanded === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell text-xs text-gray-500 whitespace-nowrap">
                          {formatWhen(log.created_at)}
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${ENTITY_COLOR[log.entity_type] ?? "bg-gray-100 text-gray-600"}`}>
                            {ENTITY_LABEL[log.entity_type] ?? log.entity_type}
                          </span>
                        </td>
                        <td className="table-cell">
                          <p className="font-medium text-gray-900">{log.entity_label}</p>
                          {log.context && (
                            <p className="text-xs text-gray-400 mt-0.5">{log.context}</p>
                          )}
                        </td>
                        <td className="table-cell text-xs text-gray-600">
                          {log.actor_email ?? <span className="text-gray-300">-</span>}
                        </td>
                        <td className="table-cell text-right">
                          {log.snapshot ? (
                            <button
                              onClick={() => setExpanded(isOpen ? null : log.id)}
                              className="btn-secondary btn-sm"
                            >
                              {isOpen ? "닫기" : "보기"}
                            </button>
                          ) : (
                            <span className="text-gray-300 text-xs">없음</span>
                          )}
                        </td>
                      </tr>

                      {isOpen && log.snapshot && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-gray-500">
                                삭제 직전의 원본입니다. 복구는 이 값을 보고 다시 등록하는 방식입니다.
                              </p>
                              <button
                                onClick={() => copySnapshot(log)}
                                className="btn-secondary btn-sm"
                              >
                                복사
                              </button>
                            </div>
                            <pre className="text-[11px] bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto max-h-72 text-gray-700">
{JSON.stringify(log.snapshot, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            총 {filtered.length}건
            {filtered.length !== logs.length && ` (전체 ${logs.length}건 중)`}
          </p>
        </div>
      </div>
    </div>
  );
}
