"use client";

import { useMemo, useState } from "react";
import type { CrmKolDetail } from "@/lib/supabase/crm";
import { formatNumber } from "@/lib/utils";

interface KolTableProps {
  kols: CrmKolDetail[];
}

type SortKey = "followers" | "name" | "recent";

/** 팔로워 규모 구간 — 섭외 티어를 한눈에 보려고 */
const TIERS = [
  { key: "all", label: "전체", min: 0, max: Infinity },
  { key: "mega", label: "10만+", min: 100_000, max: Infinity },
  { key: "macro", label: "3만~10만", min: 30_000, max: 100_000 },
  { key: "mid", label: "1만~3만", min: 10_000, max: 30_000 },
  { key: "micro", label: "1만 미만", min: 0, max: 10_000 },
] as const;

export default function KolTable({ kols }: KolTableProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tier, setTier] = useState<(typeof TIERS)[number]["key"]>("all");
  const [sortKey, setSortKey] = useState<SortKey>("followers");

  // 카테고리 옵션은 실제 데이터에서 뽑는다 (CRM에서 카테고리를 늘려도 따라감)
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const k of kols) for (const c of k.categories ?? []) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [kols]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tierDef = TIERS.find((t) => t.key === tier)!;

    const out = kols.filter((k) => {
      if (q) {
        const hay = [k.name, k.instagram_handle, k.history, k.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (category !== "all" && !(k.categories ?? []).includes(category)) {
        return false;
      }
      if (tier !== "all") {
        const f = k.followers ?? 0;
        if (f < tierDef.min || f >= tierDef.max) return false;
      }
      return true;
    });

    return out.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "ko");
        case "recent":
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        case "followers":
        default:
          return (b.followers ?? 0) - (a.followers ?? 0);
      }
    });
  }, [kols, search, category, tier, sortKey]);

  return (
    <div className="space-y-4">
      {/* 검색 · 필터 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
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
            placeholder="이름 · 인스타 핸들 · 진행 이력 검색"
            className="input pl-9"
          />
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input w-auto"
        >
          <option value="all">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="input w-auto"
        >
          <option value="followers">팔로워 많은순</option>
          <option value="name">이름순</option>
          <option value="recent">최근 등록순</option>
        </select>
      </div>

      {/* 팔로워 티어 탭 */}
      <div className="flex items-center gap-1 flex-wrap">
        {TIERS.map((t) => {
          const count =
            t.key === "all"
              ? kols.length
              : kols.filter((k) => {
                  const f = k.followers ?? 0;
                  return f >= t.min && f < t.max;
                }).length;
          return (
            <button
              key={t.key}
              onClick={() => setTier(t.key)}
              className={`btn btn-sm flex items-center gap-1.5 ${
                tier === t.key ? "btn-primary" : "btn-secondary"
              }`}
            >
              {t.label}
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                  tier === t.key ? "bg-white/30 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">KOL</th>
                <th className="table-header">팔로워</th>
                <th className="table-header">카테고리</th>
                <th className="table-header">진행 단가</th>
                <th className="table-header">방문 예정</th>
                <th className="table-header">진행 이력</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-gray-400 text-sm">
                    {kols.length === 0
                      ? "CRM에 등록된 KOL이 없습니다."
                      : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((k) => (
                  <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <p className="font-medium text-gray-900">{k.name}</p>
                      {k.instagram_handle && (
                        <a
                          href={`https://instagram.com/${k.instagram_handle}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary-600 hover:underline"
                        >
                          @{k.instagram_handle}
                        </a>
                      )}
                      {k.email && (
                        <p className="text-xs text-gray-400">{k.email}</p>
                      )}
                    </td>
                    <td className="table-cell whitespace-nowrap font-medium">
                      {k.followers ? formatNumber(k.followers) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(k.categories ?? []).length === 0 ? (
                          <span className="text-gray-300 text-xs">-</span>
                        ) : (
                          (k.categories ?? []).map((c) => (
                            <span
                              key={c}
                              className="badge bg-gray-100 text-gray-600"
                            >
                              {c}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-xs text-gray-600 max-w-[160px]">
                      {k.rate || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="table-cell text-xs text-gray-600 whitespace-nowrap">
                      {k.visit_note || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="table-cell text-xs text-gray-500 max-w-[280px]">
                      <p className="line-clamp-2">{k.history || "-"}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            총 {filtered.length}명
            {filtered.length !== kols.length && ` (전체 ${kols.length}명 중)`}
          </p>
        </div>
      </div>
    </div>
  );
}
