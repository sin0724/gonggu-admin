"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CampaignInfluencer,
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
}

const STATUS_OPTIONS: ProgressStatus[] = [
  "발송대기",
  "업로드대기",
  "판매중",
  "정산대기",
  "정산완료",
];

export default function InfluencerTable({
  campaignId,
  records,
}: InfluencerTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProgressStatus | "전체">("전체");
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<
    CampaignInfluencerWithDetails | undefined
  >(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = records.filter((r) => {
    const matchName = r.influencer.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const status = getProgressStatus(r);
    const matchStatus = statusFilter === "전체" || status === statusFilter;
    return matchName && matchStatus;
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

  return (
    <>
      <div className="space-y-4">
        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500">참여 인플루언서</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {records.length}명
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500">총 판매금액</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(totalSales)}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500">총 정산금액</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(totalSettlement)}
            </p>
          </div>
        </div>

        {/* 필터 + 추가 버튼 */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            {/* 검색 */}
            <div className="relative min-w-[200px]">
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

            {/* 상태 필터 */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setStatusFilter("전체")}
                className={`btn btn-sm ${
                  statusFilter === "전체"
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
              >
                전체
              </button>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`btn btn-sm ${
                    statusFilter === s ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleAdd} className="btn-primary whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            인플루언서 추가
          </button>
        </div>

        {/* 테이블 */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">인플루언서</th>
                  <th className="table-header">개인코드</th>
                  <th className="table-header">진행상태</th>
                  <th className="table-header">발송일</th>
                  <th className="table-header">콘텐츠</th>
                  <th className="table-header">판매금액</th>
                  <th className="table-header">정산금액</th>
                  <th className="table-header">정산방법</th>
                  <th className="table-header">메모</th>
                  <th className="table-header text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
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
                        <td className="table-cell">
                          {r.personal_code ? (
                            <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">
                              {r.personal_code}
                            </code>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${STATUS_COLORS[status]}`}>
                            {status}
                          </span>
                        </td>
                        <td className="table-cell text-gray-500 text-xs">
                          {formatDate(r.sent_date)}
                        </td>
                        <td className="table-cell">
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
                        <td className="table-cell text-right font-medium">
                          {r.sales_amount > 0
                            ? formatCurrency(r.sales_amount)
                            : "-"}
                        </td>
                        <td className="table-cell text-right font-medium text-green-700">
                          {r.settlement_amount > 0
                            ? formatCurrency(r.settlement_amount)
                            : "-"}
                        </td>
                        <td className="table-cell text-gray-500 text-xs">
                          {r.settlement_method || "-"}
                        </td>
                        <td className="table-cell text-gray-500 text-xs max-w-[120px] truncate">
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
        />
      )}
    </>
  );
}
