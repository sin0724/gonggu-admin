"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Manager } from "@/types/database";
import { CampaignStage, CLOSED_STAGES, OPENED_STAGES } from "@/lib/campaign-stage";
import { isActiveManager, roleOf, ROLE_COLOR, ROLE_LABEL } from "@/lib/managers";
import { formatWon } from "@/lib/utils";
import HelpTip from "@/components/ui/help-tip";

/** 서버에서 캠페인별로 미리 계산해 내려주는 실적 한 줄 */
export interface PerfCampaign {
  id: string;
  stage: CampaignStage;
  /** 기간 필터 기준일 — 공구 시작일, 없으면 등록일 (YYYY-MM-DD) */
  date: string;
  /** 관리 담당자 */
  managerId: string | null;
  /** 영업 담당자 (캠페인 영업 담당, 없으면 거래처 담당자) */
  sourceManagerId: string | null;
  /** 이 캠페인이 시작된 거래처. 직접 등록이면 null */
  prospectId: string | null;
  sales: number;
  target: number | null;
  pendingCount: number;
}

/** 영업 담당자별 거래처 수 (기간 무관) */
export interface PerfProspectCount {
  managerId: string | null;
  total: number;
}

interface ManagerPerformanceProps {
  managers: Manager[];
  campaigns: PerfCampaign[];
  prospectCounts: PerfProspectCount[];
  /** 로그인한 사람의 담당자 id — 행 강조용 */
  meId: string | null;
}

type Basis = "ops" | "sales";
type Period = "all" | "year" | "3m" | "month";

const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "이번 달" },
  { key: "3m", label: "최근 3개월" },
  { key: "year", label: "올해" },
  { key: "all", label: "전체" },
];

/** 기간 시작일 (KST 기준 YYYY-MM-DD). 전체면 null */
function periodStart(p: Period): string | null {
  const now = new Date(Date.now() + 9 * 3600_000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (p === "month") return `${y}-${pad(m + 1)}-01`;
  if (p === "year") return `${y}-01-01`;
  if (p === "3m") {
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
  }
  return null;
}

/** 1.2억 / 3,400만 / 5,000원 */
function compactWon(n: number): string {
  if (n >= 1e8) {
    const v = n / 1e8;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}억`;
  }
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

interface Row {
  key: string;
  manager: Manager | null;
  /** 관리 기준 */
  active: number;
  total: number;
  sales: number;
  targetSales: number;
  targetSum: number;
  pending: number;
  /** 영업 기준 — 업체 수(중복 제외). 한 업체가 캠페인을 여러 번 해도 1곳 */
  prospects: number;
  linked: Set<string>;
  opened: Set<string>;
}

/**
 * 담당자별 실적.
 *
 * - 관리 실적: 캠페인 담당자(campaigns.manager_id) 기준 — 누가 굴린 캠페인이 얼마나 팔렸나
 * - 영업 실적: 거래처 담당자(prospects.manager_id) 기준 — 누가 데려온 업체가 얼마나 팔렸나
 *
 * 한 캠페인이 두 기준에 모두 잡히는 건 의도된 것이다 (관리·영업은 서로 다른 기여).
 * 같은 기준 안에서는 캠페인이 한 사람에게만 잡히므로 합계 = 전체 취급액.
 * 막대는 단일 지표(취급액)라 색 하나 — 값은 옆 숫자로도 읽힌다.
 */
export default function ManagerPerformance({
  managers,
  campaigns,
  prospectCounts,
  meId,
}: ManagerPerformanceProps) {
  const router = useRouter();
  const [basis, setBasis] = useState<Basis>("ops");
  const [period, setPeriod] = useState<Period>("all");

  const rows = useMemo(() => {
    const start = periodStart(period);
    const inPeriod = campaigns.filter((c) => !start || c.date >= start);
    const byKey = new Map<string, Row>();
    const rowOf = (id: string | null): Row => {
      const key = id ?? "__none";
      let r = byKey.get(key);
      if (!r) {
        r = {
          key,
          manager: id ? managers.find((m) => m.id === id) ?? null : null,
          active: 0,
          total: 0,
          sales: 0,
          targetSales: 0,
          targetSum: 0,
          pending: 0,
          prospects: 0,
          linked: new Set(),
          opened: new Set(),
        };
        byKey.set(key, r);
      }
      return r;
    };

    // 해당 구분의 재직자는 실적이 0이어도 보여준다 ("아직 0"도 정보다)
    for (const m of managers) {
      if (isActiveManager(m) && roleOf(m) === basis) rowOf(m.id);
    }

    if (basis === "ops") {
      for (const c of inPeriod) {
        const r = rowOf(c.managerId);
        r.total++;
        if (!CLOSED_STAGES.includes(c.stage)) r.active++;
        r.sales += c.sales;
        r.pending += c.pendingCount;
        if (c.target && c.target > 0) {
          r.targetSum += c.target;
          r.targetSales += c.sales;
        }
      }
    } else {
      // 거래처에서 시작하지 않은 캠페인은 영업 기여를 따질 수 없으므로 뺀다
      for (const c of inPeriod) {
        // 영업 담당도 없고 거래처에서 시작하지도 않은 캠페인은 영업 기여를 따질 수 없다
        if (!c.prospectId && !c.sourceManagerId) continue;
        const r = rowOf(c.sourceManagerId);
        if (c.prospectId) {
          r.linked.add(c.prospectId);
          if (OPENED_STAGES.includes(c.stage)) r.opened.add(c.prospectId);
        }
        r.sales += c.sales;
      }
      for (const p of prospectCounts) {
        if (p.total > 0) rowOf(p.managerId).prospects += p.total;
      }
    }

    const list = [...byKey.values()];
    // 미배정은 항상 맨 아래, 나머지는 취급액 → 이름순
    return list.sort((a, b) => {
      if (!a.manager !== !b.manager) return a.manager ? -1 : 1;
      if (b.sales !== a.sales) return b.sales - a.sales;
      return (a.manager?.name ?? "").localeCompare(b.manager?.name ?? "", "ko");
    });
  }, [campaigns, prospectCounts, managers, basis, period]);

  const visible = rows.filter(
    (r) => r.manager || r.total > 0 || r.linked.size > 0 || r.prospects > 0
  );
  const maxSales = Math.max(0, ...visible.map((r) => r.sales));
  const totalSales = visible.reduce((s, r) => s + r.sales, 0);

  const goCampaigns = (r: Row) => {
    if (basis !== "ops") return;
    router.push(`/campaigns?manager=${r.manager ? r.manager.id : "none"}`);
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 flex-wrap px-5 pt-5 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center">
            담당자별 실적
            <HelpTip
              align="left"
              text="취급액은 이 시스템에 입력된 KOL 판매액 + 셀러 공급액 기준입니다(재무 확정 전 금액). 기간은 캠페인의 공구 시작일(없으면 등록일)로 거릅니다."
            />
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {basis === "ops"
              ? "캠페인 담당자 기준 — 누가 운영한 캠페인이 얼마나 팔렸는지"
              : "캠페인 영업 담당 기준 — 누가 데려온 업체가 얼마나 팔렸는지"}
          </p>
        </div>
        {/* 필터는 한 줄에 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            {(["ops", "sales"] as Basis[]).map((b) => (
              <button
                key={b}
                onClick={() => setBasis(b)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  basis === b ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {ROLE_LABEL[b]} 실적
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">
            {basis === "ops" ? "관리" : "영업"} 담당자가 아직 없습니다.
          </p>
          <Link href="/managers" className="btn-secondary btn-sm mt-3">
            담당자 관리로 이동
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">담당자</th>
                {basis === "ops" ? (
                  <>
                    <th className="table-header text-right">진행 중</th>
                    <th className="table-header text-right">캠페인</th>
                  </>
                ) : (
                  <>
                    <th className="table-header text-right">담당 거래처</th>
                    <th className="table-header text-right">캠페인 연결 업체</th>
                    <th className="table-header text-right">공구 오픈 업체</th>
                  </>
                )}
                <th className="table-header w-[38%]">취급액</th>
                {basis === "ops" && (
                  <>
                    <th className="table-header text-right">목표 달성률</th>
                    <th className="table-header text-right">정산 대기</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((r) => {
                const isMe = !!meId && r.manager?.id === meId;
                const share = totalSales > 0 ? (r.sales / totalSales) * 100 : 0;
                const width = maxSales > 0 ? (r.sales / maxSales) * 100 : 0;
                const achievement = r.targetSum > 0 ? (r.targetSales / r.targetSum) * 100 : null;
                return (
                  <tr
                    key={r.key}
                    onClick={() => goCampaigns(r)}
                    className={`transition-colors ${basis === "ops" ? "cursor-pointer hover:bg-gray-50" : ""} ${
                      isMe ? "bg-primary-50/40" : ""
                    }`}
                    title={basis === "ops" ? "눌러서 이 담당자의 캠페인 보기" : undefined}
                  >
                    <td className="table-cell whitespace-nowrap">
                      {r.manager ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{r.manager.name}</span>
                          <span className={`badge ${ROLE_COLOR[roleOf(r.manager)]}`}>
                            {ROLE_LABEL[roleOf(r.manager)]}
                          </span>
                          {!isActiveManager(r.manager) && (
                            <span className="badge bg-red-50 text-red-500">퇴사</span>
                          )}
                          {isMe && <span className="badge bg-primary-100 text-primary-700">나</span>}
                        </div>
                      ) : (
                        <span className="text-gray-400">미배정</span>
                      )}
                    </td>
                    {basis === "ops" ? (
                      <>
                        <td className="table-cell text-right tabular-nums font-medium text-gray-900">
                          {r.active}
                        </td>
                        <td className="table-cell text-right tabular-nums text-gray-500">{r.total}</td>
                      </>
                    ) : (
                      <>
                        <td className="table-cell text-right tabular-nums text-gray-700">
                          {r.prospects}
                        </td>
                        <td className="table-cell text-right tabular-nums text-gray-700">{r.linked.size}</td>
                        <td className="table-cell text-right tabular-nums whitespace-nowrap">
                          <span className="font-medium text-gray-900">{r.opened.size}</span>
                          {r.prospects > 0 && (
                            <span className="text-xs text-gray-400 ml-1">
                              ({((r.opened.size / r.prospects) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        {/* 막대 — 기준선은 각지게, 데이터 끝만 4px 라운드 */}
                        <div className="group relative flex-1 h-5 min-w-[80px]">
                          {r.sales > 0 && (
                            <>
                              <div
                                className={`h-full rounded-r ${r.manager ? "bg-primary-500 group-hover:bg-primary-600" : "bg-gray-300"}`}
                                style={{ width: `${Math.max(width, 1.5)}%` }}
                              />
                              <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 pointer-events-none">
                                {formatWon(r.sales)} · 전체의 {share.toFixed(1)}%
                              </div>
                            </>
                          )}
                        </div>
                        <span className="w-16 shrink-0 text-right text-sm font-semibold text-gray-900 tabular-nums">
                          {r.sales > 0 ? compactWon(r.sales) : <span className="text-gray-300 font-normal">-</span>}
                        </span>
                      </div>
                    </td>
                    {basis === "ops" && (
                      <>
                        <td className="table-cell text-right tabular-nums">
                          {achievement === null ? (
                            <span className="text-xs text-gray-300">목표 없음</span>
                          ) : (
                            <span className={`text-sm font-medium ${achievement >= 100 ? "text-green-600" : "text-gray-700"}`}>
                              {achievement.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="table-cell text-right">
                          {r.pending > 0 ? (
                            <span className="badge bg-orange-100 text-orange-700">{r.pending}건</span>
                          ) : (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="table-cell text-xs font-medium text-gray-500">합계</td>
                {basis === "ops" ? (
                  <>
                    <td className="table-cell text-right text-xs tabular-nums text-gray-600">
                      {visible.reduce((s, r) => s + r.active, 0)}
                    </td>
                    <td className="table-cell text-right text-xs tabular-nums text-gray-600">
                      {visible.reduce((s, r) => s + r.total, 0)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="table-cell text-right text-xs tabular-nums text-gray-600">
                      {visible.reduce((s, r) => s + r.prospects, 0)}
                    </td>
                    <td className="table-cell text-right text-xs tabular-nums text-gray-600">
                      {visible.reduce((s, r) => s + r.linked.size, 0)}
                    </td>
                    <td className="table-cell text-right text-xs tabular-nums text-gray-600">
                      {visible.reduce((s, r) => s + r.opened.size, 0)}
                    </td>
                  </>
                )}
                <td className="table-cell text-right text-sm font-semibold text-gray-900 tabular-nums">
                  {formatWon(totalSales)}
                </td>
                {basis === "ops" && (
                  <>
                    <td className="table-cell" />
                    <td className="table-cell text-right text-xs tabular-nums text-gray-600">
                      {visible.reduce((s, r) => s + r.pending, 0)}건
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-100">
        {basis === "ops"
          ? "진행 중 = 종료·보류가 아닌 캠페인. 행을 누르면 그 담당자의 캠페인 목록으로 이동합니다."
          : "담당 거래처 수는 기간과 무관한 현재 기준입니다. 공구 오픈 % = 기간 내 공구를 연 업체 ÷ 담당 거래처. 취급액은 캠페인의 영업 담당 기준입니다."}
      </p>
    </div>
  );
}
