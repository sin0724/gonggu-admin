"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  Manager,
  ProspectWithManager,
  ProspectStatus,
  PROSPECT_STATUS_COLORS,
} from "@/types/database";
import ProspectModal from "./prospect-modal";
import { CampaignStage, STAGE_LABEL } from "@/lib/campaign-stage";
import {
  ACCOUNT_STAGES,
  ACCOUNT_STAGE_COLOR,
  ACCOUNT_STAGE_DESCRIPTION,
  AccountStage,
  resolveAccountStage,
} from "@/lib/account-stage";

/** 거래처에 연결된 캠페인 요약 */
export interface LinkedCampaign {
  id: string;
  campaign_name: string;
  stage: CampaignStage;
}

interface ProspectTableProps {
  initialProspects: ProspectWithManager[];
  managers: Manager[];
  /** 가망건 id → 연결된 캠페인들. 거래 단계를 여기서 파생한다 */
  campaignsByProspect: Record<string, LinkedCampaign[]>;
}

const ALL_STATUSES: (ProspectStatus | "전체")[] = ["전체", "발송완료", "입점완료", "무응답", "거절"];

export default function ProspectTable({
  initialProspects,
  managers,
  campaignsByProspect,
}: ProspectTableProps) {
  const [prospects, setProspects] = useState<ProspectWithManager[]>(initialProspects);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "전체">("전체");
  const [stageFilter, setStageFilter] = useState<AccountStage | "전체">("전체");
  const [managerFilter, setManagerFilter] = useState<string>("전체");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProspectWithManager | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const duplicateNumbers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of prospects) {
      counts.set(p.business_number, (counts.get(p.business_number) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([num]) => num)
    );
  }, [prospects]);

  /** 거래 단계 — 연결된 캠페인에서 파생 (사람이 고치는 값이 아님) */
  const stageOf = useMemo(() => {
    const map = new Map<string, AccountStage>();
    for (const p of prospects) {
      const linked = campaignsByProspect[p.id] ?? [];
      map.set(p.id, resolveAccountStage(linked.map((c) => c.stage)));
    }
    return map;
  }, [prospects, campaignsByProspect]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { 전체: prospects.length };
    for (const s of ACCOUNT_STAGES) counts[s] = 0;
    for (const p of prospects) counts[stageOf.get(p.id) ?? "가망"]++;
    return counts;
  }, [prospects, stageOf]);

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      const matchSearch =
        search === "" ||
        p.company_name.toLowerCase().includes(search.toLowerCase()) ||
        p.business_number.includes(search);
      const matchStatus = statusFilter === "전체" || p.status === statusFilter;
      const matchStage =
        stageFilter === "전체" || stageOf.get(p.id) === stageFilter;
      const matchManager =
        managerFilter === "전체" ||
        (managerFilter === "미배정" ? !p.manager_id : p.manager_id === managerFilter);
      const matchDuplicate = !showDuplicatesOnly || duplicateNumbers.has(p.business_number);
      return matchSearch && matchStatus && matchStage && matchManager && matchDuplicate;
    });
  }, [prospects, search, statusFilter, stageFilter, stageOf, managerFilter, showDuplicatesOnly, duplicateNumbers]);

  const handleSaved = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("prospects")
      .select("*, manager:managers(*)")
      .order("created_at", { ascending: false });
    setProspects((data as ProspectWithManager[]) ?? []);
    setModalOpen(false);
    setEditTarget(undefined);
  };

  const handleEdit = (prospect: ProspectWithManager) => {
    setEditTarget(prospect);
    setModalOpen(true);
  };

  const handleExport = () => {
    const rows = filtered.map((p) => ({
      상호명: p.company_name,
      사업자번호: p.business_number,
      담당자명: p.contact_name ?? "",
      전화번호: p.phone ?? "",
      우리측담당자: p.manager?.name ?? "",
      거래단계: stageOf.get(p.id) ?? "가망",
      연결캠페인: (campaignsByProspect[p.id] ?? [])
        .map((c) => c.campaign_name)
        .join(", "),
      컨택상태: p.status,
      특이사항: p.notes ?? "",
      등록일: new Date(p.created_at).toLocaleDateString("ko-KR"),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
      { wch: 10 }, { wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래처");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `거래처_${date}.xlsx`);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    await supabase.from("prospects").delete().eq("id", id);
    setProspects((prev) => prev.filter((p) => p.id !== id));
    setDeleteId(null);
  };

  return (
    <>
      {/* 상단 컨트롤 */}
      <div className="flex flex-col gap-3">
        {/* 거래 단계 — 캠페인 연결에서 자동 파생 */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-semibold text-gray-400 mr-1">거래 단계</span>
          {(["전체", ...ACCOUNT_STAGES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              title={s === "전체" ? undefined : ACCOUNT_STAGE_DESCRIPTION[s]}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                stageFilter === s
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold ${
                  stageFilter === s ? "bg-white/25 text-white" : "bg-white text-gray-500"
                }`}
              >
                {stageCounts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs font-semibold text-gray-400 mr-1">컨택 상태</span>
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-300 mx-1" />
            <button
              onClick={() => setShowDuplicatesOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                showDuplicatesOnly
                  ? "bg-amber-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              중복
              {duplicateNumbers.size > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${showDuplicatesOnly ? "bg-white text-amber-600" : "bg-amber-500 text-white"}`}>
                  {duplicateNumbers.size}
                </span>
              )}
            </button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상호명 또는 사업자번호 검색"
              className="input text-sm flex-1 sm:w-56"
            />
            <button
              onClick={handleExport}
              className="btn-secondary whitespace-nowrap flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              엑셀 내보내기
            </button>
            <button
              onClick={() => { setEditTarget(undefined); setModalOpen(true); }}
              className="btn-primary whitespace-nowrap"
            >
              + 신규 등록
            </button>
          </div>
        </div>

        {/* 담당자 필터 */}
        {managers.length > 0 && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-gray-500 font-medium">담당자:</span>
            <button
              onClick={() => setManagerFilter("전체")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                managerFilter === "전체"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              전체
            </button>
            {managers.map((m) => (
              <button
                key={m.id}
                onClick={() => setManagerFilter(m.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  managerFilter === m.id
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {m.name}
              </button>
            ))}
            <button
              onClick={() => setManagerFilter("미배정")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                managerFilter === "미배정"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              미배정
            </button>
          </div>
        )}
      </div>

      {/* 테이블 */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">상호명</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">사업자번호</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">업체 담당자</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">전화번호</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">우리측 담당자</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">거래 단계</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">컨택 상태</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">특이사항</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">등록일</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {showDuplicatesOnly
                      ? "중복된 사업자번호가 없습니다."
                      : search ||
                          statusFilter !== "전체" ||
                          stageFilter !== "전체" ||
                          managerFilter !== "전체"
                        ? "검색 결과가 없습니다."
                        : "등록된 거래처가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.company_name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="flex items-center gap-1">
                        {p.business_number}
                        {duplicateNumbers.has(p.business_number) && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">중복</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.contact_name ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{p.phone ?? "-"}</td>
                    <td className="px-4 py-3">
                      {p.manager ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {p.manager.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">미배정</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const stage = stageOf.get(p.id) ?? "가망";
                        const linked = campaignsByProspect[p.id] ?? [];
                        return (
                          <div>
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACCOUNT_STAGE_COLOR[stage]}`}
                              title={ACCOUNT_STAGE_DESCRIPTION[stage]}
                            >
                              {stage}
                            </span>
                            {linked.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {linked.slice(0, 2).map((c) => (
                                  <Link
                                    key={c.id}
                                    href={`/campaigns/${c.id}`}
                                    className="block text-[11px] text-primary-600 hover:underline truncate max-w-[150px]"
                                    title={`${c.campaign_name} (${STAGE_LABEL[c.stage]})`}
                                  >
                                    {c.campaign_name}
                                  </Link>
                                ))}
                                {linked.length > 2 && (
                                  <span className="text-[11px] text-gray-400">
                                    외 {linked.length - 2}건
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PROSPECT_STATUS_COLORS[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{p.notes ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {/* 가망건 → 캠페인 전환. 클라이언트명이 채워진 채로 열린다 */}
                        <Link
                          href={`/campaigns/new?prospect=${p.id}`}
                          className="text-xs text-primary-600 hover:text-primary-700 hover:underline transition-colors whitespace-nowrap"
                          title="이 업체로 캠페인을 등록합니다"
                        >
                          캠페인 등록
                        </Link>
                        <button
                          onClick={() => handleEdit(p)}
                          className="text-xs text-gray-500 hover:text-primary-600 transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => setDeleteId(p.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            총 {filtered.length}건{prospects.length !== filtered.length && ` (전체 ${prospects.length}건)`}
          </div>
        )}
      </div>

      {/* 등록/수정 모달 */}
      {modalOpen && (
        <ProspectModal
          prospect={editTarget}
          managers={managers}
          onClose={() => { setModalOpen(false); setEditTarget(undefined); }}
          onSaved={handleSaved}
        />
      )}

      {/* 삭제 확인 모달 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">삭제 확인</h3>
            <p className="text-sm text-gray-500 mb-5">이 거래처를 삭제하시겠습니까? 복구할 수 없습니다.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-secondary">취소</button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
