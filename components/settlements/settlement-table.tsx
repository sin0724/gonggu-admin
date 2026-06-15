"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CampaignInfluencer,
  Influencer,
  getProgressStatus,
  STATUS_COLORS,
  hasBankDetails,
} from "@/types/database";
import { formatDate, formatTwd, krwToTwd } from "@/lib/utils";

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

type Filter = "전체" | "정산대기" | "정산완료" | "판매중";

const fmt = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

/** 정산 행 금액 — TWD 메인 · 원화 보조. 환율 없으면 원화만. */
function Money({
  krw,
  rate,
  className,
}: {
  krw: number;
  rate: number | null;
  className?: string;
}) {
  if (!(krw > 0)) return <span className="text-gray-300">-</span>;
  const twd = krwToTwd(krw, rate);
  if (twd === null) return <span className={className}>{fmt(krw)}원</span>;
  return (
    <span className={className}>
      {formatTwd(twd)}
      <span className="block text-xs font-normal text-gray-400">
        {fmt(krw)}원
      </span>
    </span>
  );
}

export default function SettlementTable({
  records,
}: {
  records: SettlementRecord[];
}) {
  const [filter, setFilter] = useState<Filter>("정산대기");
  const [search, setSearch] = useState("");

  const withStatus = useMemo(
    () => records.map((r) => ({ r, status: getProgressStatus(r) })),
    [records]
  );

  const filtered = withStatus.filter(({ r, status }) => {
    const matchFilter =
      filter === "전체"
        ? true
        : filter === "정산완료"
        ? r.is_settled
        : status === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.influencer.name.toLowerCase().includes(q) ||
      r.campaign.campaign_name.toLowerCase().includes(q) ||
      r.campaign.client_name.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const counts: Record<Filter, number> = {
    전체: withStatus.length,
    정산대기: withStatus.filter(({ status }) => status === "정산대기").length,
    정산완료: withStatus.filter(({ r }) => r.is_settled).length,
    판매중: withStatus.filter(({ status }) => status === "판매중").length,
  };

  const totalSales = filtered.reduce((s, { r }) => s + (r.sales_amount || 0), 0);
  const totalSettlement = filtered.reduce(
    (s, { r }) => s + (r.settlement_amount || 0),
    0
  );
  // 캠페인마다 환율이 달라 TWD 합계는 각 행을 자기 환율로 환산해 합산.
  // 환율이 입력된 건이 하나라도 있을 때만 TWD 합계를 표시하고,
  // 일부 건에 환율이 없으면 합계가 불완전함을 안내한다.
  const totalSalesTwd = filtered.reduce((s, { r }) => {
    const t = krwToTwd(r.sales_amount || 0, r.campaign.exchange_rate);
    return t !== null ? s + t : s;
  }, 0);
  const totalSettlementTwd = filtered.reduce((s, { r }) => {
    const t = krwToTwd(r.settlement_amount || 0, r.campaign.exchange_rate);
    return t !== null ? s + t : s;
  }, 0);
  const anyRate = filtered.some(
    ({ r }) => r.campaign.exchange_rate && r.campaign.exchange_rate > 0
  );
  const someMissingRate =
    anyRate && filtered.some(({ r }) => !r.campaign.exchange_rate);

  const handleExportCSV = () => {
    const headers = [
      "캠페인",
      "클라이언트",
      "인플루언서",
      "환율(1TWD=원)",
      "판매액(원)",
      "판매액(TWD)",
      "수량",
      "RS율(%)",
      "정산금액(원)",
      "정산금액(TWD)",
      "정산방식",
      "정산여부",
      "정산일",
      "진행상태",
      "예금주(Account Holder)",
      "은행명(Bank Name)",
      "계좌번호(Account Number)",
      "계좌유형(Account Type)",
      "SWIFT/BIC",
      "이메일",
      "주소",
      "메모",
    ];
    const rows = filtered.map(({ r, status }) => {
      const rate = r.campaign.exchange_rate;
      const salesTwd = krwToTwd(r.sales_amount ?? 0, rate);
      const settleTwd = krwToTwd(r.settlement_amount ?? 0, rate);
      return [
        r.campaign.campaign_name,
        r.campaign.client_name,
        r.influencer.name,
        rate ? rate.toString() : "",
        (r.sales_amount ?? 0).toString(),
        salesTwd !== null ? Math.round(salesTwd).toString() : "",
        (r.quantity ?? 0).toString(),
        (r.campaign.influencer_rs_rate ?? 0).toString(),
        (r.settlement_amount ?? 0).toString(),
        settleTwd !== null ? Math.round(settleTwd).toString() : "",
        r.settlement_method ?? "",
        r.is_settled ? "Y" : "N",
        r.settled_date ?? "",
        status,
        r.influencer.bank_account_holder ?? "",
        r.influencer.bank_name ?? "",
        r.influencer.bank_account_number ?? "",
        r.influencer.bank_account_type ?? "",
        r.influencer.bank_swift_code ?? "",
        r.influencer.bank_email ?? "",
        r.influencer.bank_address ?? "",
        r.notes ?? "",
      ];
    });
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv =
      "\uFEFF" +
      [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `settlements_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 합계 카드 */}
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        <div className="card p-4">
          <p className="text-xs text-gray-400 mb-1">선택 조건 판매액 합계</p>
          {anyRate ? (
            <>
              <p className="text-xl font-bold text-gray-900">
                {formatTwd(totalSalesTwd)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(totalSales)}원</p>
            </>
          ) : (
            <p className="text-xl font-bold text-gray-900">{fmt(totalSales)}원</p>
          )}
        </div>
        <div className="card p-4 border-orange-200 bg-orange-50">
          <p className="text-xs text-orange-500 font-medium mb-1">
            선택 조건 정산금액 합계
          </p>
          {anyRate ? (
            <>
              <p className="text-xl font-bold text-orange-700">
                {formatTwd(totalSettlementTwd)}
              </p>
              <p className="text-xs text-orange-400 mt-0.5">
                {fmt(totalSettlement)}원
              </p>
            </>
          ) : (
            <p className="text-xl font-bold text-orange-700">
              {fmt(totalSettlement)}원
            </p>
          )}
        </div>
      </div>
      {someMissingRate && (
        <p className="text-xs text-amber-600 -mt-2">
          ⚠ 일부 캠페인에 환율이 입력되지 않아 TWD 합계에서 제외되었습니다. 정확한
          TWD 합계를 위해 해당 캠페인에 환율을 입력하세요.
        </p>
      )}

      {/* 필터 + 검색 + 내보내기 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {(["정산대기", "정산완료", "판매중", "전체"] as Filter[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`btn btn-sm flex items-center gap-1.5 ${
                filter === s ? "btn-primary" : "btn-secondary"
              }`}
            >
              {s}
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                  filter === s
                    ? "bg-white/30 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="캠페인·클라이언트·인플루언서 검색"
            className="input max-w-xs"
          />
          <button onClick={handleExportCSV} className="btn-secondary whitespace-nowrap">
            CSV 내보내기
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
                <th className="table-header">클라이언트</th>
                <th className="table-header">인플루언서</th>
                <th className="table-header text-right">판매액</th>
                <th className="table-header text-right">정산금액</th>
                <th className="table-header hidden md:table-cell">정산방식</th>
                <th className="table-header hidden md:table-cell">계좌정보</th>
                <th className="table-header">상태</th>
                <th className="table-header hidden md:table-cell">정산일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-gray-400 text-sm">
                    조건에 맞는 정산 건이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map(({ r, status }) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <Link
                        href={`/campaigns/${r.campaign.id}`}
                        className="font-medium text-primary-600 hover:text-primary-700"
                      >
                        {r.campaign.campaign_name}
                      </Link>
                    </td>
                    <td className="table-cell text-gray-600">
                      {r.campaign.client_name}
                    </td>
                    <td className="table-cell font-medium text-gray-900">
                      {r.influencer.name}
                    </td>
                    <td className="table-cell text-right">
                      <Money
                        krw={r.sales_amount}
                        rate={r.campaign.exchange_rate}
                      />
                    </td>
                    <td className="table-cell text-right font-semibold text-orange-700">
                      <Money
                        krw={r.settlement_amount}
                        rate={r.campaign.exchange_rate}
                        className="font-semibold text-orange-700"
                      />
                    </td>
                    <td className="table-cell text-gray-500 text-xs hidden md:table-cell">
                      {r.settlement_method || "-"}
                    </td>
                    <td className="table-cell hidden md:table-cell">
                      {hasBankDetails(r.influencer) ? (
                        <span
                          className="text-xs text-gray-600"
                          title={`${r.influencer.bank_account_holder} · ${r.influencer.bank_name} ${r.influencer.bank_account_number}${r.influencer.bank_swift_code ? ` · SWIFT ${r.influencer.bank_swift_code}` : ""}`}
                        >
                          {r.influencer.bank_name} {r.influencer.bank_account_number}
                        </span>
                      ) : (
                        <span className="badge bg-orange-100 text-orange-700 text-xs">
                          미등록
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_COLORS[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="table-cell text-gray-500 text-xs hidden md:table-cell">
                      {formatDate(r.settled_date)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            총 {filtered.length}건 · 정산금액 합계{" "}
            {anyRate
              ? `${formatTwd(totalSettlementTwd)} (${fmt(totalSettlement)}원)`
              : `${fmt(totalSettlement)}원`}
          </p>
        </div>
      </div>
    </div>
  );
}
