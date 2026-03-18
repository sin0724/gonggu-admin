"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types/database";
import { formatDate, isCampaignActive } from "@/lib/utils";

interface CampaignTableProps {
  campaigns: Campaign[];
}

export default function CampaignTable({ campaigns }: CampaignTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = campaigns.filter(
    (c) =>
      c.campaign_name.toLowerCase().includes(search.toLowerCase()) ||
      c.client_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 캠페인을 삭제하시겠습니까?\n관련된 모든 인플루언서 데이터도 함께 삭제됩니다.`)) return;

    setDeletingId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
      router.refresh();
    } catch (e) {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 검색 + 등록 버튼 */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
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
            placeholder="캠페인명 또는 클라이언트명 검색"
            className="input pl-9"
          />
        </div>
        <Link href="/campaigns/new" className="btn-primary whitespace-nowrap">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          신규 캠페인 등록
        </Link>
      </div>

      {/* 테이블 */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">캠페인명</th>
                <th className="table-header">클라이언트</th>
                <th className="table-header">RS</th>
                <th className="table-header">시작일</th>
                <th className="table-header">종료일</th>
                <th className="table-header">상태</th>
                <th className="table-header">등록일</th>
                <th className="table-header text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400 text-sm">
                    {search ? "검색 결과가 없습니다." : "등록된 캠페인이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((campaign) => {
                  const active = isCampaignActive(campaign.start_date, campaign.end_date);
                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="font-medium text-primary-600 hover:text-primary-700"
                        >
                          {campaign.campaign_name}
                        </Link>
                      </td>
                      <td className="table-cell text-gray-600">{campaign.client_name}</td>
                      <td className="table-cell text-gray-500">{campaign.rs || "-"}</td>
                      <td className="table-cell text-gray-500 text-xs">{formatDate(campaign.start_date)}</td>
                      <td className="table-cell text-gray-500 text-xs">{formatDate(campaign.end_date)}</td>
                      <td className="table-cell">
                        <span className={`badge ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                          {active ? "진행중" : "종료"}
                        </span>
                      </td>
                      <td className="table-cell text-gray-500 text-xs">{formatDate(campaign.created_at)}</td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/campaigns/${campaign.id}`}
                            className="btn-secondary btn-sm"
                          >
                            상세
                          </Link>
                          <Link
                            href={`/campaigns/${campaign.id}/edit`}
                            className="btn-secondary btn-sm"
                          >
                            수정
                          </Link>
                          <button
                            onClick={() => handleDelete(campaign.id, campaign.campaign_name)}
                            disabled={deletingId === campaign.id}
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

        {/* 결과 카운트 */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            총 {filtered.length}개 캠페인
            {search && ` (전체 ${campaigns.length}개 중)`}
          </p>
        </div>
      </div>
    </div>
  );
}
