"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CampaignInfluencerWithDetails,
  ProgressStatus,
  getProgressStatus,
  STATUS_COLORS,
} from "@/types/database";
import { formatDate, formatCurrency } from "@/lib/utils";
import InfluencerModal from "./influencer-modal";

interface InfluencerTableProps {
  campaignId: string;
  records: CampaignInfluencerWithDetails[];
  campaignInfluencerRsRate?: number;
  campaignPurchaseFormUrl?: string;
}

const STATUS_OPTIONS: ProgressStatus[] = [
  "발송대기",
  "업로드대기",
  "판매중",
  "정산대기",
  "정산완료",
];

type CheckboxField = "is_product_sent" | "is_uploaded" | "is_settled";

export default function InfluencerTable({
  campaignId,
  records,
  campaignInfluencerRsRate,
  campaignPurchaseFormUrl,
}: InfluencerTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProgressStatus | "전체">("전체");
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<
    CampaignInfluencerWithDetails | undefined
  >(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filtered = records.filter((r) => {
    const matchName = r.influencer.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const status = getProgressStatus(r);
    const matchStatus = statusFilter === "전체" || status === statusFilter;
    return matchName && matchStatus;
  });

  // 각 탭별 건수
  const statusCounts: Record<ProgressStatus | "전체", number> = {
    전체: records.length,
    발송대기: 0,
    업로드대기: 0,
    판매중: 0,
    정산대기: 0,
    정산완료: 0,
  };
  records.forEach((r) => {
    const s = getProgressStatus(r);
    statusCounts[s]++;
  });

  const totalSales = records.reduce((sum, r) => sum + (r.sales_amount || 0), 0);
  const totalSettlement = records.reduce(
    (sum, r) => sum + (r.settlement_amount || 0),
    0
  );

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(`"${name}" 인플루언서를 이 캠페인에서 제거하시겠습니까?`)
    )
      return;

    setDeletingId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("campaign_influencers")
        .delete()
        .eq("id", id);
      if (error) throw error;
      router.refresh();
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleCheckbox = async (
    record: CampaignInfluencerWithDetails,
    field: CheckboxField
  ) => {
    const currentValue = record[field];
    setTogglingId(record.id + field);
    try {
      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);
      const payload: Record<string, boolean | string | null> = {
        [field]: !currentValue,
      };
      // 체크 시 날짜 자동 기록, 해제 시 날짜 제거
      if (field === "is_product_sent") {
        payload.sent_date = !currentValue ? record.sent_date || today : null;
      }
      if (field === "is_settled") {
        payload.settled_date = !currentValue ? record.settled_date || today : null;
      }
      const { error } = await supabase
        .from("campaign_influencers")
        .update(payload)
        .eq("id", record.id);
      if (error) throw error;
      router.refresh();
    } catch {
      alert("업데이트 중 오류가 발생했습니다.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleEdit = (record: CampaignInfluencerWithDetails) => {
    setEditRecord(record);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditRecord(undefined);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditRecord(undefined);
  };

  const handleExportCSV = () => {
    const headers = [
      "인플루언서명",
      "계정링크",
      "구매링크",
      "주문시트링크",
      "발송여부",
      "발송일",
      "콘텐츠URL",
      "업로드여부",
      "판매액",
      "판매수량",
      "정산방식",
      "정산금액",
      "정산여부",
      "정산일",
      "진행상태",
      "메모",
    ];

    const rows = filtered.map((r) => {
      const status = getProgressStatus(r);
      return [
        r.influencer.name,
        r.influencer.account_url ?? "",
        r.purchase_url || campaignPurchaseFormUrl || "",
        r.sheet_url ?? "",
        r.is_product_sent ? "Y" : "N",
        r.sent_date ?? "",
        r.content_url ?? "",
        r.is_uploaded ? "Y" : "N",
        r.sales_amount?.toString() ?? "0",
        r.quantity?.toString() ?? "0",
        r.settlement_method ?? "",
        r.settlement_amount?.toString() ?? "0",
        r.is_settled ? "Y" : "N",
        r.settled_date ?? "",
        status,
        r.notes ?? "",
      ];
    });

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csvContent =
      "\uFEFF" +
      [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join(
        "\n"
      );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `influencers_${campaignId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="space-y-4">
        {/* 검색 + 버튼 */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="인플루언서명 검색"
              className="input pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="btn-secondary whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              CSV 내보내기
            </button>
            <button onClick={handleAdd} className="btn-primary whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              인플루언서 추가
            </button>
          </div>
        </div>

        {/* 상태 탭 필터 */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setStatusFilter("전체")}
            className={`btn btn-sm flex items-center gap-1.5 ${
              statusFilter === "전체" ? "btn-primary" : "btn-secondary"
            }`}
          >
            전체
            <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
              statusFilter === "전체" ? "bg-white/30 text-white" : "bg-gray-100 text-gray-600"
            }`}>
              {statusCounts["전체"]}
            </span>
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`btn btn-sm flex items-center gap-1.5 ${
                statusFilter === s ? "btn-primary" : "btn-secondary"
              }`}
            >
              {s}
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                statusFilter === s ? "bg-white/30 text-white" : "bg-gray-100 text-gray-600"
              }`}>
                {statusCounts[s]}
              </span>
            </button>
          ))}
        </div>

        {/* 테이블 */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">인플루언서</th>
                  <th className="table-header hidden md:table-cell">구매링크</th>
                  <th className="table-header hidden md:table-cell">시트</th>
                  <th className="table-header">진행상태</th>
                  <th className="table-header hidden md:table-cell">발송일</th>
                  <th className="table-header hidden md:table-cell">콘텐츠</th>
                  <th className="table-header hidden md:table-cell">판매금액</th>
                  <th className="table-header hidden md:table-cell">수량</th>
                  <th className="table-header hidden md:table-cell">정산금액</th>
                  <th className="table-header hidden md:table-cell">정산방법</th>
                  <th className="table-header">발송</th>
                  <th className="table-header">업로드</th>
                  <th className="table-header">정산</th>
                  <th className="table-header hidden md:table-cell">메모</th>
                  <th className="table-header text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={15}
                      className="py-16 text-center text-gray-400 text-sm"
                    >
                      {search || statusFilter !== "전체"
                        ? "검색 결과가 없습니다."
                        : "등록된 인플루언서가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const status = getProgressStatus(r);
                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="table-cell">
                          <div>
                            <p className="font-medium text-gray-900">
                              {r.influencer.name}
                            </p>
                            {r.influencer.account_url && (
                              <a
                                href={r.influencer.account_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary-500 hover:underline"
                              >
                                계정 보기
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="table-cell hidden md:table-cell">
                          {r.purchase_url ? (
                            <a href={r.purchase_url} target="_blank" rel="noopener noreferrer"
                              className="text-primary-600 hover:underline text-xs">
                              개별 링크
                            </a>
                          ) : campaignPurchaseFormUrl ? (
                            <a href={campaignPurchaseFormUrl} target="_blank" rel="noopener noreferrer"
                              className="text-gray-500 hover:underline text-xs">
                              공통 링크
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">-</span>
                          )}
                        </td>
                        <td className="table-cell hidden md:table-cell">
                          {r.sheet_url ? (
                            <a href={r.sheet_url} target="_blank" rel="noopener noreferrer"
                              className="text-primary-600 hover:underline text-xs">
                              시트
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">-</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${STATUS_COLORS[status]}`}>
                            {status}
                          </span>
                        </td>
                        <td className="table-cell text-gray-500 text-xs hidden md:table-cell">
                          {formatDate(r.sent_date)}
                        </td>
                        <td className="table-cell hidden md:table-cell">
                          {r.content_url ? (
                            <a
                              href={r.content_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-600 hover:underline text-xs"
                            >
                              보기
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="table-cell text-right font-medium hidden md:table-cell">
                          {r.sales_amount > 0
                            ? formatCurrency(r.sales_amount)
                            : "-"}
                        </td>
                        <td className="table-cell text-right text-gray-600 hidden md:table-cell">
                          {r.quantity > 0 ? `${r.quantity}개` : "-"}
                        </td>
                        <td className="table-cell text-right font-medium text-green-700 hidden md:table-cell">
                          {r.settlement_amount > 0
                            ? formatCurrency(r.settlement_amount)
                            : "-"}
                        </td>
                        <td className="table-cell text-gray-500 text-xs hidden md:table-cell">
                          {r.settlement_method || "-"}
                        </td>
                        {/* 인라인 체크박스 - 발송여부 */}
                        <td className="table-cell text-center">
                          <input
                            type="checkbox"
                            checked={r.is_product_sent}
                            disabled={togglingId === r.id + "is_product_sent"}
                            onChange={() =>
                              handleToggleCheckbox(r, "is_product_sent")
                            }
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        {/* 인라인 체크박스 - 업로드여부 */}
                        <td className="table-cell text-center">
                          <input
                            type="checkbox"
                            checked={r.is_uploaded}
                            disabled={togglingId === r.id + "is_uploaded"}
                            onChange={() =>
                              handleToggleCheckbox(r, "is_uploaded")
                            }
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        {/* 인라인 체크박스 - 정산여부 */}
                        <td className="table-cell text-center">
                          <input
                            type="checkbox"
                            checked={r.is_settled}
                            disabled={togglingId === r.id + "is_settled"}
                            onChange={() =>
                              handleToggleCheckbox(r, "is_settled")
                            }
                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="table-cell text-gray-500 text-xs max-w-[120px] truncate hidden md:table-cell">
                          {r.notes || "-"}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(r)}
                              className="btn-secondary btn-sm"
                            >
                              수정
                            </button>
                            <button
                              onClick={() =>
                                handleDelete(r.id, r.influencer.name)
                              }
                              disabled={deletingId === r.id}
                              className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                            >
                              삭제
                            </button>
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
              총 {filtered.length}명
              {(search || statusFilter !== "전체") &&
                ` (전체 ${records.length}명 중)`}
            </p>
          </div>
        </div>
      </div>

      {showModal && (
        <InfluencerModal
          campaignId={campaignId}
          record={editRecord}
          onClose={handleCloseModal}
          campaignInfluencerRsRate={campaignInfluencerRsRate}
          campaignPurchaseFormUrl={campaignPurchaseFormUrl}
        />
      )}
    </>
  );
}
