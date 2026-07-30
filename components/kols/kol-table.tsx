"use client";

import { useMemo, useState } from "react";
import type { CrmKol } from "@/lib/supabase/crm";
import { formatCrmMoney, needsRateReview } from "@/lib/supabase/crm";
import { formatNumber, formatWon } from "@/lib/utils";
import { GONGGU_CATEGORIES } from "@/types/database";

interface KolTableProps {
  kols: CrmKol[];
  /** 통화 혼합 값 비교용 환율 (NT$1 당 원) — CRM DB에서 읽어온 값 */
  twdKrwRate: number;
  /** 공구매출 집계 뷰를 못 써서 기본 테이블로 폴백한 상태 */
  degraded: boolean;
}

type SortKey = "followers" | "fee" | "sales" | "name" | "recent";

/** 팔로워 규모 구간 — 섭외 티어를 한눈에 보려고 */
const TIERS = [
  { key: "all", label: "전체", min: 0, max: Infinity },
  { key: "mega", label: "10만+", min: 100_000, max: Infinity },
  { key: "macro", label: "3만~10만", min: 30_000, max: 100_000 },
  { key: "mid", label: "1만~3만", min: 10_000, max: 30_000 },
  { key: "micro", label: "1만 미만", min: 0, max: 10_000 },
] as const;

export default function KolTable({ kols, twdKrwRate, degraded }: KolTableProps) {
  const [search, setSearch] = useState("");
  const [gongguCategory, setGongguCategory] = useState("all");
  const [genre, setGenre] = useState("all");
  const [tier, setTier] = useState<(typeof TIERS)[number]["key"]>("all");
  const [sortKey, setSortKey] = useState<SortKey>("followers");
  const [conditionOnly, setConditionOnly] = useState(false);

  /** 콘텐츠 장르 — CRM에서 늘려도 따라가도록 데이터에서 뽑는다 */
  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const k of kols) for (const c of k.categories ?? []) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [kols]);

  /** 공구 카테고리 — 프리셋 순서를 유지하되 실제 쓰이는 값만 노출 */
  const gongguOptions = useMemo(() => {
    const used = new Set<string>();
    for (const k of kols) for (const c of k.gonggu_categories ?? []) used.add(c);
    const preset = GONGGU_CATEGORIES.filter((c) => used.has(c));
    // 프리셋에 없는 값이 CRM에 있으면 뒤에 붙인다 (양쪽 상수 어긋남 조기 발견)
    const extra = [...used].filter(
      (c) => !(GONGGU_CATEGORIES as readonly string[]).includes(c)
    );
    return [...preset, ...extra.sort((a, b) => a.localeCompare(b, "ko"))];
  }, [kols]);

  const salesTotalOf = (k: CrmKol) => k.gonggu_sales_krw_total ?? 0;
  const feeKrwOf = (k: CrmKol) =>
    k.fee_amount_krw ??
    (k.fee_amount != null
      ? k.fee_currency === "KRW"
        ? k.fee_amount
        : k.fee_amount * twdKrwRate
      : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tierDef = TIERS.find((t) => t.key === tier)!;

    const out = kols.filter((k) => {
      if (q) {
        // 제공 항목은 배열이라 부분검색이 안 되므로 CRM이 만들어준 문자열을 함께 본다
        const hay = [
          k.name,
          k.instagram_handle,
          k.history,
          k.email,
          k.deliverables_text,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (genre !== "all" && !(k.categories ?? []).includes(genre)) return false;
      if (
        gongguCategory !== "all" &&
        !(k.gonggu_categories ?? []).includes(gongguCategory)
      ) {
        return false;
      }
      if (conditionOnly && k.fee_amount == null && k.rs_rate == null) {
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
        case "fee":
          return feeKrwOf(b) - feeKrwOf(a);
        case "sales":
          return salesTotalOf(b) - salesTotalOf(a);
        case "followers":
        default:
          return (b.followers ?? 0) - (a.followers ?? 0);
      }
    });
    // feeKrwOf / salesTotalOf 는 props에서 파생 — twdKrwRate만 의존성으로 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kols, search, genre, gongguCategory, tier, sortKey, conditionOnly, twdKrwRate]);

  const reviewCount = kols.filter(needsRateReview).length;

  return (
    <div className="space-y-4">
      {degraded && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-lg text-xs">
          CRM의 공구매출 집계 뷰(kols_with_gonggu)를 읽지 못해 기본 목록만
          표시합니다. 고정비·공구매출 컬럼이 비어 보일 수 있습니다.
        </div>
      )}

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
            placeholder="이름 · 핸들 · 제공 항목 · 이력 검색"
            className="input pl-9"
          />
        </div>

        {gongguOptions.length > 0 && (
          <select
            value={gongguCategory}
            onChange={(e) => setGongguCategory(e.target.value)}
            className="input w-auto"
          >
            <option value="all">전체 공구 카테고리</option>
            {gongguOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="input w-auto"
        >
          <option value="all">전체 장르</option>
          {genres.map((c) => (
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
          <option value="fee">고정비 높은순</option>
          <option value="sales">누적 공구매출순</option>
          <option value="name">이름순</option>
          <option value="recent">최근 등록순</option>
        </select>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={conditionOnly}
            onChange={(e) => setConditionOnly(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          조건 입력된 KOL만
        </label>
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

        {reviewCount > 0 && (
          <span
            className="ml-2 badge bg-amber-100 text-amber-700"
            title="레거시 진행 단가 파싱이 애매한 건 — CRM에서 확인이 필요합니다"
          >
            원문 확인 필요 {reviewCount}
          </span>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">KOL</th>
                <th className="table-header">팔로워</th>
                <th className="table-header">공구 카테고리</th>
                <th className="table-header">진행 조건</th>
                <th className="table-header text-right">누적 공구매출</th>
                <th className="table-header">방문 예정</th>
                <th className="table-header">진행 이력</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400 text-sm">
                    {kols.length === 0
                      ? "CRM에 등록된 KOL이 없습니다."
                      : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((k) => {
                  const fee = formatCrmMoney(k.fee_amount, k.fee_currency);
                  // TWD 고정비는 원화 환산을 보조로 (환율은 열 머리 대신 툴팁에)
                  const feeKrwHint =
                    k.fee_currency === "TWD" && k.fee_amount_krw
                      ? `≈ ${formatWon(k.fee_amount_krw)}`
                      : null;
                  const items = k.deliverables ?? [];
                  return (
                    <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-gray-900">{k.name}</p>
                          {needsRateReview(k) && (
                            <span
                              className="badge bg-amber-100 text-amber-700 shrink-0"
                              title={`고정비 해석이 애매합니다. CRM 원문: "${k.rate ?? "-"}" → ${k.fee_amount?.toLocaleString("ko-KR") ?? "-"} ${k.fee_currency ?? ""}
CRM에서 확인해 주세요.`}
                            >
                              확인 필요
                            </span>
                          )}
                        </div>
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
                        {/* 콘텐츠 장르 — 공구 카테고리와 축이 달라 작게 병기 */}
                        {(k.categories ?? []).length > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {(k.categories ?? []).join(" · ")}
                          </p>
                        )}
                      </td>

                      <td className="table-cell whitespace-nowrap font-medium">
                        {k.followers ? (
                          formatNumber(k.followers)
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                      <td className="table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {(k.gonggu_categories ?? []).length === 0 ? (
                            <span className="text-gray-300 text-xs">-</span>
                          ) : (
                            (k.gonggu_categories ?? []).map((c) => (
                              <span key={c} className="badge bg-gray-100 text-gray-600">
                                {c}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      {/* 진행 조건 — 고정비 · RS · 제공 항목을 한 셀에 */}
                      <td className="table-cell max-w-[260px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {fee ? (
                            <span className="font-semibold text-gray-900 whitespace-nowrap">
                              {fee}
                              {feeKrwHint && (
                                <span className="ml-1 text-xs font-normal text-gray-400">
                                  {feeKrwHint}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">고정비 -</span>
                          )}
                          {k.rs_rate != null && (
                            <span className="badge bg-blue-50 text-blue-700 whitespace-nowrap">
                              RS {k.rs_rate}%
                            </span>
                          )}
                        </div>
                        {items.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {items.map((d) => (
                              <span
                                key={d}
                                className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="table-cell text-right whitespace-nowrap">
                        {(k.gonggu_sales_count ?? 0) > 0 ? (
                          <>
                            {(k.gonggu_sales_twd ?? 0) > 0 && (
                              <p className="font-semibold text-gray-900">
                                NT${Math.round(k.gonggu_sales_twd!).toLocaleString("en-US")}
                              </p>
                            )}
                            {(k.gonggu_sales_krw ?? 0) > 0 && (
                              <p className="font-semibold text-gray-900">
                                {formatWon(k.gonggu_sales_krw!)}
                              </p>
                            )}
                            <p className="text-xs text-gray-400">
                              {k.gonggu_sales_count}건
                              {k.gonggu_sales_last_date &&
                                ` · 최근 ${k.gonggu_sales_last_date}`}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>

                      <td className="table-cell text-xs text-gray-600 whitespace-nowrap">
                        {k.visit_note || <span className="text-gray-300">-</span>}
                      </td>

                      <td className="table-cell text-xs text-gray-500 max-w-[220px]">
                        <p className="line-clamp-2">{k.history || "-"}</p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-gray-500">
            총 {filtered.length}명
            {filtered.length !== kols.length && ` (전체 ${kols.length}명 중)`}
          </p>
          <p className="text-xs text-gray-400">
            통화 혼합 정렬·환산 기준 NT$1 = {twdKrwRate.toLocaleString("ko-KR")}원
          </p>
        </div>
      </div>
    </div>
  );
}
