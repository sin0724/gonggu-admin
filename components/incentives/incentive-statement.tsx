"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { Manager, ManagerRole } from "@/types/database";
import { useToast } from "@/components/ui/toast";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { formatDate, formatWon } from "@/lib/utils";
import { ROLE_COLOR, ROLE_LABEL } from "@/lib/managers";
import {
  IncentivePayout,
  monthLabel,
  nextMonth,
  payDayLabel,
  prevMonth,
} from "@/lib/incentive";

/** 명세표 한 줄 — 실시간 계산(미확정)이든 확정 스냅샷이든 같은 모양으로 그린다 */
export interface StatementRow {
  campaignId: string | null;
  campaignName: string;
  clientName: string | null;
  role: ManagerRole;
  managerId: string | null;
  managerName: string | null;
  feeTotal: number;
  expenseTotal: number;
  base: number;
  rate: number;
  entitledTotal: number;
  previouslyPaid: number;
  amount: number;
}

interface IncentiveStatementProps {
  month: string;
  rows: StatementRow[];
  /** 이 달이 확정됐으면 확정 정보(첫 줄) */
  confirmed: Pick<IncentivePayout, "confirmed_at" | "confirmed_by"> | null;
  paidAt: string | null;
  isAdmin: boolean;
  managers: Manager[];
  viewerEmail: string | null;
}

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export default function IncentiveStatement({
  month,
  rows,
  confirmed,
  paidAt,
  isAdmin,
  managers,
}: IncentiveStatementProps) {
  const router = useRouter();
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const [dialog, setDialog] = useState<"confirm" | "unconfirm" | "paid" | null>(null);

  // 사람별 묶음 — 담당 미지정 줄은 "지급 보류"로 따로
  const groups = new Map<string, { name: string | null; managerId: string | null; rows: StatementRow[] }>();
  for (const r of rows) {
    const key = r.managerId ?? "__none";
    const g = groups.get(key) ?? { name: r.managerName, managerId: r.managerId, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const people = [...groups.values()].sort((a, b) => {
    if (!a.managerId !== !b.managerId) return a.managerId ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "", "ko");
  });
  const payable = rows.filter((r) => r.managerId);
  const held = rows.filter((r) => !r.managerId);
  const total = payable.reduce((s, r) => s + r.amount, 0);

  const handleConfirm = async () => {
    setWorking(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const by = auth.user?.email ?? null;
      const now = new Date().toISOString();
      // 담당 미지정 줄은 확정하지 않는다 → 담당을 정하면 다음 달 명세에 자동으로 다시 잡힌다
      const insertRows = payable.map((r) => {
        const m = managers.find((x) => x.id === r.managerId);
        return {
          pay_month: `${month}-01`,
          manager_id: r.managerId,
          manager_name: m?.name ?? r.managerName ?? "(이름 없음)",
          manager_email: m?.email ?? null,
          campaign_id: r.campaignId,
          campaign_name: r.campaignName,
          role: r.role,
          fee_total: r.feeTotal,
          expense_total: r.expenseTotal,
          base_amount: r.base,
          rate: r.rate,
          entitled_total: r.entitledTotal,
          previously_paid: r.previouslyPaid,
          amount: r.amount,
          confirmed_at: now,
          confirmed_by: by,
        };
      });
      const { error } = await supabase.from("incentive_payouts").insert(insertRows);
      if (error) throw error;
      toast.success(`${monthLabel(month)} 명세를 확정했습니다.`);
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "확정 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const handleUnconfirm = async () => {
    setWorking(true);
    try {
      const { error } = await createClient()
        .from("incentive_payouts")
        .delete()
        .eq("pay_month", `${month}-01`);
      if (error) throw error;
      toast.success("확정을 취소했습니다. 다시 계산된 금액으로 표시됩니다.");
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "취소 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const handlePaid = async () => {
    setWorking(true);
    try {
      const { error } = await createClient()
        .from("incentive_payouts")
        .update({ paid_at: new Date().toISOString() })
        .eq("pay_month", `${month}-01`);
      if (error) throw error;
      toast.success("지급 완료로 표시했습니다.");
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "처리 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const exportExcel = () => {
    const data = rows.map((r) => ({
      지급월: monthLabel(month),
      담당자: r.managerName ?? "미지정(지급 보류)",
      역할: ROLE_LABEL[r.role],
      캠페인: r.campaignName,
      "입금 순수수료(누적)": r.feeTotal,
      "직접 실비(누적)": r.expenseTotal,
      기준금액: r.base,
      요율: pct(r.rate),
      "누적 인센티브": r.entitledTotal,
      "이전 지급": r.previouslyPaid,
      "이번 달 지급": r.amount,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [10, 12, 6, 28, 16, 14, 14, 6, 14, 12, 14].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "인센티브");
    XLSX.writeFile(wb, `인센티브_${month}.xlsx`);
  };

  const status = paidAt ? "paid" : confirmed ? "confirmed" : "draft";

  return (
    <div className="space-y-4">
      {/* 월 이동 + 상태 + 동작 */}
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap print:shadow-none">
        <div className="flex items-center gap-2">
          <Link href={`/incentives?month=${prevMonth(month)}`} className="btn-secondary btn-sm print:hidden" aria-label="이전 달">
            ←
          </Link>
          <div className="px-2">
            <p className="text-lg font-bold text-gray-900">{monthLabel(month)} 지급분</p>
            <p className="text-xs text-gray-500">지급일 {payDayLabel(month)}</p>
          </div>
          <Link href={`/incentives?month=${nextMonth(month)}`} className="btn-secondary btn-sm print:hidden" aria-label="다음 달">
            →
          </Link>
          <span
            className={`badge ml-2 ${
              status === "paid"
                ? "bg-green-100 text-green-700"
                : status === "confirmed"
                ? "bg-gray-900 text-white"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {status === "paid" ? "✓ 지급 완료" : status === "confirmed" ? "🔒 확정" : "미확정 (실시간 계산)"}
          </span>
          {confirmed && (
            <span className="text-xs text-gray-400 hidden md:inline">
              {formatDate(confirmed.confirmed_at)} {confirmed.confirmed_by ?? ""}
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={exportExcel} disabled={rows.length === 0} className="btn-secondary btn-sm">
              엑셀
            </button>
            <button onClick={() => window.print()} disabled={rows.length === 0} className="btn-secondary btn-sm">
              인쇄
            </button>
            {status === "draft" && (
              <button onClick={() => setDialog("confirm")} disabled={payable.length === 0} className="btn-primary btn-sm">
                명세 확정
              </button>
            )}
            {status === "confirmed" && (
              <>
                <button onClick={() => setDialog("unconfirm")} className="btn-secondary btn-sm">
                  확정 취소
                </button>
                <button onClick={() => setDialog("paid")} className="btn-primary btn-sm">
                  지급 완료 처리
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!isAdmin && !confirmed ? (
        <div className="card py-14 text-center">
          <p className="text-sm text-gray-500">{monthLabel(month)} 본인 명세가 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">
            아직 확정 전이거나 이 달에 지급할 인센티브가 없습니다. 최종 관리자가 확정하면 여기서 볼 수 있습니다.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card py-14 text-center">
          <p className="text-sm text-gray-500">이 달에 지급할 인센티브가 없습니다.</p>
          <p className="text-xs text-gray-400 mt-1">
            캠페인 상세의 &apos;인센티브 정산&apos;에 입금일이 있는 정산 기록이 있어야 계산됩니다.
          </p>
        </div>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500">이번 달 지급 합계</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">{formatWon(total)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{new Set(payable.map((r) => r.managerId)).size}명</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500">영업 4% / 관리 6%</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
                {formatWon(payable.filter((r) => r.role === "sales").reduce((s, r) => s + r.amount, 0))}
                <span className="text-gray-300 font-normal mx-1.5">/</span>
                {formatWon(payable.filter((r) => r.role === "ops").reduce((s, r) => s + r.amount, 0))}
              </p>
            </div>
            <div className={`card p-4 ${held.length > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
              <p className="text-xs text-gray-500">지급 보류 (담당 미지정)</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
                {formatWon(held.reduce((s, r) => s + r.amount, 0))}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {held.length > 0 ? "캠페인 상세에서 담당을 지정하면 다음 명세에 포함됩니다" : "없음"}
              </p>
            </div>
          </div>

          {/* 사람별 명세 */}
          {people.map((g) => {
            const sum = g.rows.reduce((s, r) => s + r.amount, 0);
            return (
              <div key={g.managerId ?? "none"} className="card overflow-hidden break-inside-avoid">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="font-semibold text-gray-900">
                    {g.name ?? <span className="text-amber-700">담당 미지정 — 지급 보류</span>}
                  </p>
                  <p className="text-sm">
                    <span className="text-gray-500 mr-2">이번 달</span>
                    <span className={`text-lg font-bold tabular-nums ${sum < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {formatWon(sum)}
                    </span>
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="table-header">캠페인</th>
                        <th className="table-header">역할</th>
                        <th className="table-header text-right">입금 순수수료</th>
                        <th className="table-header text-right">직접 실비</th>
                        <th className="table-header text-right">기준금액</th>
                        <th className="table-header text-right">누적 인센티브</th>
                        <th className="table-header text-right">이전 지급</th>
                        <th className="table-header text-right">이번 달</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {g.rows.map((r) => (
                        <tr key={`${r.campaignId}-${r.role}`}>
                          <td className="table-cell">
                            {r.campaignId ? (
                              <Link href={`/campaigns/${r.campaignId}`} className="font-medium text-primary-600 hover:underline print:text-gray-900">
                                {r.campaignName}
                              </Link>
                            ) : (
                              <span className="font-medium text-gray-700">{r.campaignName}</span>
                            )}
                            {r.clientName && <span className="block text-xs text-gray-400">{r.clientName}</span>}
                          </td>
                          <td className="table-cell whitespace-nowrap">
                            <span className={`badge ${ROLE_COLOR[r.role]}`}>
                              {ROLE_LABEL[r.role]} {pct(r.rate)}
                            </span>
                          </td>
                          <td className="table-cell text-right tabular-nums text-gray-600">{formatWon(r.feeTotal)}</td>
                          <td className="table-cell text-right tabular-nums text-gray-600">
                            {r.expenseTotal > 0 ? `−${formatWon(r.expenseTotal)}` : "-"}
                          </td>
                          <td className="table-cell text-right tabular-nums text-gray-900">{formatWon(r.base)}</td>
                          <td className="table-cell text-right tabular-nums text-gray-600">{formatWon(r.entitledTotal)}</td>
                          <td className="table-cell text-right tabular-nums text-gray-400">
                            {r.previouslyPaid !== 0 ? formatWon(r.previouslyPaid) : "-"}
                          </td>
                          <td className={`table-cell text-right tabular-nums font-semibold ${r.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                            {formatWon(r.amount)}
                            {r.amount < 0 && <span className="block text-[11px] font-normal">환불·실비 조정 차감</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <p className="text-[11px] text-gray-400 leading-relaxed">
            금액은 캠페인별 누적 기준입니다. 이번 달 지급 = 누적 인센티브 − 이전 지급. 확정 후 생긴 환불·차지백·실비는
            다음 달 명세에서 자동으로 차감됩니다. 기준금액이 마이너스면 0으로 처리합니다. 미수(입금 전) 금액과 유가시딩
            KOL 예산은 포함하지 않습니다.
          </p>
        </>
      )}

      <ConfirmDialog
        open={dialog === "confirm"}
        title={`${monthLabel(month)} 명세 확정`}
        description={
          <>
            {new Set(payable.map((r) => r.managerId)).size}명, 합계 <b className="text-gray-800">{formatWon(total)}</b>을
            확정합니다. 확정 후에는 금액이 고정되고, 이후 변동은 다음 달 명세에서 조정됩니다.
            {held.length > 0 && (
              <>
                <br />
                <b className="text-amber-700">담당 미지정 {held.length}줄은 제외</b>되고 다음 명세로 넘어갑니다.
              </>
            )}
          </>
        }
        confirmLabel="확정"
        loading={working}
        onConfirm={handleConfirm}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "unconfirm"}
        title="확정 취소"
        danger
        description="이 달의 확정 명세를 지우고 현재 데이터로 다시 계산합니다. 이미 급여에 반영했다면 취소하지 마세요."
        confirmLabel="확정 취소"
        loading={working}
        onConfirm={handleUnconfirm}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "paid"}
        title="지급 완료 처리"
        description={`${monthLabel(month)} 명세를 지급 완료로 표시합니다. 지급 완료 후에는 확정을 취소할 수 없습니다.`}
        confirmLabel="지급 완료"
        loading={working}
        onConfirm={handlePaid}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
