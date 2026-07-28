"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ProspectStatus,
  ProspectWithManager,
  PROSPECT_STATUS_COLORS,
} from "@/types/database";

export interface PickedProspect {
  id: string;
  company_name: string;
  business_number: string;
  contact_name: string | null;
  phone: string | null;
}

interface ProspectPickerProps {
  onPick: (prospect: PickedProspect) => void;
  onClose: () => void;
}

/** 입점완료가 실제로 캠페인이 될 확률이 높아 먼저 보여준다 */
const STATUS_ORDER: ProspectStatus[] = ["입점완료", "발송완료", "무응답", "거절"];

export default function ProspectPicker({ onPick, onClose }: ProspectPickerProps) {
  const [prospects, setProspects] = useState<ProspectWithManager[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProspectStatus>("all");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        // 이미 캠페인이 만들어진 가망건은 표시해 준다 (중복 등록 방지)
        const [{ data, error: err }, { data: linked }] = await Promise.all([
          supabase
            .from("prospects")
            .select("*, manager:managers(*)")
            .order("created_at", { ascending: false }),
          supabase
            .from("campaigns")
            .select("prospect_id")
            .not("prospect_id", "is", null),
        ]);
        if (cancelled) return;
        if (err) throw err;
        setProspects((data as ProspectWithManager[]) ?? []);
        setLinkedIds(
          new Set(
            (linked ?? [])
              .map((c: { prospect_id: string | null }) => c.prospect_id)
              .filter((id): id is string => Boolean(id))
          )
        );
      } catch {
        if (!cancelled) setError("거래처를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects
      .filter((p) => {
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (!q) return true;
        return [p.company_name, p.business_number, p.contact_name, p.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          a.company_name.localeCompare(b.company_name, "ko")
      );
  }, [prospects, search, statusFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              거래처에서 불러오기
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              선택하면 클라이언트명이 채워지고, 이 캠페인의 출처로 기록됩니다.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
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
              placeholder="상호명 · 사업자번호 · 담당자 검색"
              className="input pl-9"
              autoFocus
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | ProspectStatus)
            }
            className="input w-auto"
          >
            <option value="all">전체 상태</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-16 text-center text-sm text-gray-400">불러오는 중...</p>
          ) : error ? (
            <p className="py-16 text-center text-sm text-red-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">
              {prospects.length === 0
                ? "등록된 거래처가 없습니다."
                : "검색 결과가 없습니다."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((p) => {
                const already = linkedIds.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onPick({
                          id: p.id,
                          company_name: p.company_name,
                          business_number: p.business_number,
                          contact_name: p.contact_name,
                          phone: p.phone,
                        })
                      }
                      className="w-full text-left px-6 py-3 hover:bg-primary-50/60 transition-colors flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {p.company_name}
                          </span>
                          <span
                            className={`badge shrink-0 ${PROSPECT_STATUS_COLORS[p.status]}`}
                          >
                            {p.status}
                          </span>
                          {already && (
                            <span className="badge bg-amber-100 text-amber-700 shrink-0">
                              캠페인 있음
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {[p.business_number, p.contact_name, p.phone]
                            .filter(Boolean)
                            .join(" · ")}
                          {p.manager && ` · 담당 ${p.manager.name}`}
                        </p>
                      </div>
                      <span className="text-xs text-primary-600 font-medium shrink-0">
                        선택
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-500">{filtered.length}건</p>
          <button onClick={onClose} className="btn-secondary btn-sm">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
