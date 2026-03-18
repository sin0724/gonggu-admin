"use client";

import { useState, useEffect } from "react";
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
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  useEffect(() => {
    const saved = localStorage.getItem("campaignViewMode");
    if (saved === "card" || saved === "table") setViewMode(saved);
  }, []);

  const handleViewMode = (mode: "table" | "card") => {
    setViewMode(mode);
    localStorage.setItem("campaignViewMode", mode);
  };

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
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async (campaign: Campaign) => {
    if (!confirm(`"${campaign.campaign_name}" 캠페인을 복사하시겠습니까?`)) return;

    setCopyingId(campaign.id);
    try {
      const supabase = createClient();
      const { data: newCampaign, error } = await supabase
        .from("campaigns")
        .insert({
          campaign_name: `${campaign.campaign_name} (복사)`,
          client_name: campaign.client_name,
          gonggu_price: campaign.gonggu_price,
          vendor_fee_rate: campaign.vendor_fee_rate,
          influencer_rs_rate: campaign.influencer_rs_rate,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          purchase_form_url: campaign.purchase_form_url,
          drive_url: campaign.drive_url,
        })
        .select()
        .single();
      if (error) throw error;
      router.push(`/campaigns/${newCampaign.id}`);
    } catch {
      alert("복사 중 오류가 발생했습니다.");
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 검색 + 뷰 토글 + 등록 버튼 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
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
        <div className="flex items-center gap-2">
          {/* 뷰 토글 버튼 */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewMode("table")}
              title="테이블뷰"
              className={`p-2 transition-colors ${viewMode === "table" ? "bg-primary-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
              </svg>
            </button>
            <button
              onClick={() => handleViewMode("card")}
              title="카드뷰"
              className={`p-2 transition-colors ${viewMode === "card" ? "bg-primary-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>
          <Link href="/campaigns/new" className="btn-primary whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            신규 캠페인 등록
          </Link>
        </div>
      </div>

      {/* 카드뷰 */}
      {viewMode === "card" ? (
        <>
          {filtered.length === 0 ? (
            <div className="card py-16 text-center text-gray-400 text-sm">
              {search ? "검색 결과가 없습니다." : "등록된 캠페인이 없습니다."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((campaign) => {
                const active = isCampaignActive(campaign.start_date, campaign.end_date);
                return (
                  <div key={campaign.id} className="card p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{campaign.campaign_name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{campaign.client_name}</p>
                      </div>
                      <span className={`badge ml-2 shrink-0 ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {active ? "진행중" : "종료"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>
                        공구 기간:{" "}
                        {campaign.start_date && campaign.end_date
                          ? `${formatDate(campaign.start_date)} ~ ${formatDate(campaign.end_date)}`
                          : campaign.start_date
                          ? `${formatDate(campaign.start_date)} ~`
                          : "-"}
                      </p>
                      <p>
                        공구가:{" "}
                        {campaign.gonggu_price
                          ? `${campaign.gonggu_price.toLocaleString("ko-KR")}원`
                          : "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-100">
                      <Link href={`/campaigns/${campaign.id}`} className="btn-primary btn-sm flex-1 text-center">
                        상세보기
                      </Link>
                      <Link href={`/campaigns/${campaign.id}/edit`} className="btn-secondary btn-sm">
                        수정
                      </Link>
                      <button
                        onClick={() => handleCopy(campaign)}
                        disabled={copyingId === campaign.id}
                        className="btn-secondary btn-sm"
                        title="캠페인 복사"
                      >
                        복사
                      </button>
                      <button
                        onClick={() => handleDelete(campaign.id, campaign.campaign_name)}
                        disabled={deletingId === campaign.id}
                        className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-xs text-gray-500 px-1">
            총 {filtered.length}개 캠페인{search && ` (전체 ${campaigns.length}개 중)`}
          </div>
        </>
      ) : (
        /* 테이블뷰 */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">캠페인명</th>
                  <th className="table-header">클라이언트</th>
                  <th className="table-header">공구가</th>
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
                        <td className="table-cell text-gray-500">
                          {campaign.gonggu_price ? `${campaign.gonggu_price.toLocaleString("ko-KR")}원` : "-"}
                        </td>
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
                              onClick={() => handleCopy(campaign)}
                              disabled={copyingId === campaign.id}
                              className="btn-secondary btn-sm"
                              title="캠페인 복사"
                            >
                              복사
                            </button>
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
      )}
    </div>
  );
}
