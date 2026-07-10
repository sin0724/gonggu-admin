"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  CampaignInfluencer,
  Influencer,
  getProgressStatus,
  hasBankDetails,
} from "@/types/database";
import { formatDate, formatWon, formatTwd, krwToTwd } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

// 전 캠페인 정산 큐 — 정산대기 목록에서 바로 완료 처리하고,
// 해외송금(SWIFT) 실무용으로 계좌 정보 포함 엑셀을 내보낸다.

export interface SettlementRecord extends CampaignInfluencer {
  influencer: Influencer;
  campaign: {
    id: string;
    campaign_name: string;
    client_name: string;
    influencer_rs_rate: number | null;
    exchange_rate: number | null;
  };
}

type Tab = "정산대기" | "정산완료";

/** 정산금액 — 실입력 우선, 없으면 판매액 × 캠페인 RS율 추정 */
function resolveAmount(r: SettlementRecord): { amount: number; estimated: boolean } {
  if (r.settlement_amount > 0) return { amount: r.settlement_amount, estimated: false };
  const rate = r.campaign?.influencer_rs_rate ?? 0;
  if (r.sales_amount > 0 && rate > 0) {
    return { amount: Math.round(r.sales_amount * (rate / 100)), estimated: true };
  }
  return { amount: 0, estimated: false };
}

function Money({ krw, rate }: { krw: number; rate: number | null }) {
  if (!(krw > 0)) return <span className="text-gray-300">-</span>;
  const twd = krwToTwd(krw, rate);
  if (twd === null) return <span>{formatWon(krw)}</span>;
  return (
    <span>
      {formatTwd(twd)}
      <span className="block text-xs font-normal text-gray-400">{formatWon(krw)}</span>
    </span>
  );
}

export default function SettlementTable({
  records,
  initialTab = "정산대기",
}: {
  records: SettlementRecord[];
  initialTab?: Tab;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  // 낙관적 오버라이드 — 완료/되돌리기 즉시 반영, 실패 시 롤백
  const [overrides, setOverrides] = useState<
    Record<string, { is_settled: boolean; settled_date: string | null }>
  >({});

  const effective = useMemo(
    () =>
      records.map((r) => {
        const o = overrides[r.id];
        return o ? { ...r, ...o } : r;
      }),
    [records, overrides]
  );

  const pending = effective.filter((r) => getProgressStatus(r) === "정산대기");
  const done = effective.filter((r) => r.is_settled);
  const rows = (tab === "정산대기" ? pending : done).filter(
    (r) =>
      r.influencer.name.toLowerCase().includes(search.toLowerCase()) ||
      r.campaign.campaign_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = rows.reduce((sum, r) => sum + resolveAmount(r).amount, 0);
  const hasEstimate = rows.some((r) => resolveAmount(r).estimated);
  const missingBankCount = rows.filter((r) => !hasBankDetails(r.influencer)).length;

  const updateSettled = async (
    r: SettlementRecord,
    settled: boolean,
    { silent = false }: { silent?: boolean } = {}
  ) => {
    const prev = { is_settled: r.is_settled, settled_date: r.settled_date };
    const today = new Date().toISOString().slice(0, 10);
    const next = {
      is_settled: settled,
      settled_date: settled ? r.settled_date || today : null,
    };
    setOverrides((o) => ({ ...o, [r.id]: next }));
    const supabase = createClient();
    const { error } = await supabase
      .from("campaign_influencers")
      .update(next)
      .eq("id", r.id);
    if (error) {
      setOverrides((o) => ({ ...o, [r.id]: prev }));
      toast.error("정산 상태 변경에 실패했습니다.");
      return;
    }
    if (!silent) {
      if (settled) {
        toast.success(`${r.influencer.name} 정산 완료 처리됨`, {
          label: "실행 취소",
          onClick: () => updateSettled({ ...r, ...next }, false, { silent: true }),
        });
      } else {
        toast.success(`${r.influencer.name} 정산 대기로 되돌렸습니다.`);
      }
    }
    router.refresh();
  };

  const handleExport = () => {
    const exportRows = rows.map((r) => {
      const { amount, estimated } = resolveAmount(r);
      const inf = r.influencer;
      const twd = krwToTwd(amount, r.campaign.exchange_rate);
      return {
        캠페인: r.campaign.campaign_name,
        클라이언트: r.campaign.client_name,
        KOL명: inf.name,
        "판매액(원)": r.sales_amount || 0,
        "정산금액(원)": amount,
        "정산금액(TWD)": twd !== null ? Math.round(twd) : "",
        추정여부: estimated ? "추정" : "",
        정산방법: r.settlement_method ?? "",
        예금주: inf.bank_account_holder ?? "",
        은행명: inf.bank_name ?? "",
        계좌번호: inf.bank_account_number ?? "",
        계좌유형: inf.bank_account_type ?? "",
        "SWIFT/BIC": inf.bank_swift_code ?? "",
        이메일: inf.bank_email ?? "",
        주소: inf.bank_address ?? "",
        정산일: r.settled_date ?? "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"] = [
      { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
      { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 26 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab);
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `정산_${tab}_${date}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 border-orange-200 bg-orange-50">
          <p className="text-xs text-orange-600 font-medium mb-1">정산 대기</p>
          <p className="text-2xl font-bold text-orange-700">
            {pending.length}
            <span className="text-sm font-normal ml-0.5">건</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400 mb-1">
            {tab} 합계{hasEstimate && " (추정 포함)"}
          </p>
          <p className="text-2xl font-bold text-gray-900">{formatWon(totalAmount)}</p>
        </div>
        <div className={`card p-4 ${missingBankCount > 0 ? "border-red-200 bg-red-50" : ""}`}>
          <p className={`text-xs mb-1 ${missingBankCount > 0 ? "text-red-500 font-medium" : "text-gray-400"}`}>
            계좌정보 미등록
          </p>
          <p className={`text-2xl font-bold ${missingBankCount > 0 ? "text-red-600" : "text-gray-300"}`}>
            {missingBankCount}
            <span className="text-sm font-normal ml-0.5">건</span>
          </p>
        </div>
      </div>

      {/* 탭 + 검색 + 내보내기 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          {(["정산대기", "정산완료"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`btn btn-sm flex items-center gap-1.5 ${
                tab === t ? "btn-primary" : "btn-secondary"
              }`}
            >
              {t}
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                  tab === t ? "bg-white/30 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {t === "정산대기" ? pending.length : done.length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="KOL명 또는 캠페인명 검색"
            className="input text-sm max-w-xs"
          />
          <button onClick={handleExport} className="btn-secondary whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            엑셀 내보내기 (계좌 포함)
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">캠페인</th>
                <th className="table-header">KOL</th>
                <th className="table-header text-right">판매액</th>
                <th className="table-header text-right">정산금액</th>
                <th className="table-header">정산방법</th>
                <th className="table-header">계좌정보</th>
                {tab === "정산완료" && <th className="table-header">정산일</th>}
                <th className="table-header text-right">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400 text-sm">
                    {search
                      ? "검색 결과가 없습니다."
                      : tab === "정산대기"
                      ? "정산 대기 중인 KOL이 없습니다. 🎉"
                      : "정산 완료된 건이 없습니다."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const { amount, estimated } = resolveAmount(r);
                  const inf = r.influencer;
                  const bankOk = hasBankDetails(inf);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <Link
                          href={`/campaigns/${r.campaign.id}`}
                          className="font-medium text-primary-600 hover:text-primary-700"
                        >
                          {r.campaign.campaign_name}
                        </Link>
                        <p className="text-xs text-gray-400">{r.campaign.client_name}</p>
                      </td>
                      <td className="table-cell">
                        <p className="font-medium text-gray-900">{inf.name}</p>
                        {inf.account_url && (
                          <a
                            href={inf.account_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-500 hover:underline"
                          >
                            계정 보기
                          </a>
                        )}
                      </td>
                      <td className="table-cell text-right">
                        <Money krw={r.sales_amount} rate={r.campaign.exchange_rate} />
                      </td>
                      <td className="table-cell text-right font-medium text-green-700">
                        <Money krw={amount} rate={r.campaign.exchange_rate} />
                        {estimated && (
                          <span className="block text-[10px] text-orange-500 font-normal">
                            RS {r.campaign.influencer_rs_rate}% 추정
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 text-xs">
                        {r.settlement_method || "-"}
                      </td>
                      <td className="table-cell">
                        {bankOk ? (
                          <div className="text-xs text-gray-600">
                            <p className="font-medium text-gray-800">
                              {inf.bank_name} · {inf.bank_account_holder}
                            </p>
                            <p className="text-gray-400">
                              {inf.bank_account_number}
                              {inf.bank_swift_code && ` · ${inf.bank_swift_code}`}
                            </p>
                          </div>
                        ) : (
                          <span className="badge bg-red-100 text-red-600">미등록</span>
                        )}
                      </td>
                      {tab === "정산완료" && (
                        <td className="table-cell text-gray-500 text-xs">
                          {formatDate(r.settled_date)}
                        </td>
                      )}
                      <td className="table-cell">
                        <div className="flex justify-end">
                          {tab === "정산대기" ? (
                            <button
                              onClick={() => updateSettled(r, true)}
                              className="btn-primary btn-sm whitespace-nowrap"
                            >
                              정산 완료
                            </button>
                          ) : (
                            <button
                              onClick={() => updateSettled(r, false)}
                              className="btn-secondary btn-sm whitespace-nowrap"
                            >
                              대기로 되돌리기
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            {tab} {rows.length}건 · 합계 {formatWon(totalAmount)}
            {hasEstimate && " (금액 미입력 건은 RS율 추정)"}
          </p>
        </div>
      </div>
    </div>
  );
}
