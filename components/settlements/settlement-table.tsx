"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CampaignInfluencer,
  Influencer,
  getProgressStatus,
  STATUS_COLORS,
} from "@/types/database";
import { formatDate } from "@/lib/utils";

export interface SettlementRecord extends CampaignInfluencer {
  influencer: Influencer;
  campaign: {
    id: string;
    campaign_name: string;
    client_name: string;
    influencer_rs_rate: number | null;
  };
}

type Filter = "전체" | "정산대기" | "정산완료" | "판매중";

const fmt = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

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

  const handleExportCSV = () => {
    const headers = [
      "캠페인",
      "클라이언트",
      "인플루언서",
      "판매액",
      "수량",
      "RS율(%)",
      "정산금액",
      "정산방식",
      "정산여부",
      "정산일",
      "진행상태",
      "메모",
    ];
    const rows = filtered.map(({ r, status }) => [
      r.campaign.campaign_name,
      r.campaign.client_name,
      r.influencer.name,
      (r.sales_amount ?? 0).toString(),
      (r.quantity ?? 0).toString(),
      (r.campaign.influencer_rs_rate ?? 0).toString(),
      (r.settlement_amount ?? 0).toString(),
      r.settlement_method ?? "",
      r.is_settled ? "Y" : "N",
      r.settled_date ?? "",
      status,
      r.notes ?? "",
    ]);
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
          <p className="text-xl font-bold text-gray-900">{fmt(totalSales)}원</p>
        </div>
        <div className="card p-4 border-orange-200 bg-orange-50">
          <p className="text-xs text-orange-500 font-medium mb-1">
            선택 조건 정산금액 합계
          </p>
          <p className="text-xl font-bold text-orange-700">
            {fmt(totalSettlement)}원
          </p>
        </div>
      </div>

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
                <th className="table-header">상태</th>
                <th className="table-header hidden md:table-cell">정산일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400 text-sm">
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
                      {r.sales_amount > 0 ? `${fmt(r.sales_amount)}원` : "-"}
                    </td>
                    <td className="table-cell text-right font-semibold text-orange-700">
                      {r.settlement_amount > 0
                        ? `${fmt(r.settlement_amount)}원`
                        : "-"}
                    </td>
                    <td className="table-cell text-gray-500 text-xs hidden md:table-cell">
                      {r.settlement_method || "-"}
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
            총 {filtered.length}건 · 정산금액 합계 {fmt(totalSettlement)}원
          </p>
        </div>
      </div>
    </div>
  );
}
