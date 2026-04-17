"use client";

import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import {
  Prospect,
  ProspectStatus,
  PROSPECT_STATUS_COLORS,
} from "@/types/database";
import ProspectModal from "./prospect-modal";

interface ProspectTableProps {
  initialProspects: Prospect[];
}

const ALL_STATUSES: (ProspectStatus | "전체")[] = ["전체", "발송완료", "입점완료", "무응답", "거절"];

export default function ProspectTable({ initialProspects }: ProspectTableProps) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "전체">("전체");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Prospect | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      const matchSearch =
        search === "" ||
        p.company_name.toLowerCase().includes(search.toLowerCase()) ||
        p.business_number.includes(search);
      const matchStatus = statusFilter === "전체" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [prospects, search, statusFilter]);

  const handleSaved = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .order("created_at", { ascending: false });
    setProspects(data ?? []);
    setModalOpen(false);
    setEditTarget(undefined);
  };

  const handleEdit = (prospect: Prospect) => {
    setEditTarget(prospect);
    setModalOpen(true);
  };

  const handleExport = () => {
    const rows = filtered.map((p) => ({
      상호명: p.company_name,
      사업자번호: p.business_number,
      담당자명: p.contact_name ?? "",
      전화번호: p.phone ?? "",
      상태: p.status,
      특이사항: p.notes ?? "",
      등록일: new Date(p.created_at).toLocaleDateString("ko-KR"),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 16 }, { wch: 12 },
      { wch: 16 }, { wch: 10 }, { wch: 30 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "가망건");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `가망건_${date}.xlsx`);
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
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
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
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명 또는 사업자번호 검색"
            className="input text-sm flex-1 sm:w-64"
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

      {/* 테이블 */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">상호명</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">사업자번호</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">담당자명</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">전화번호</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">상태</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">특이사항</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">등록일</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search || statusFilter !== "전체" ? "검색 결과가 없습니다." : "등록된 가망건이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.company_name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.business_number}</td>
                    <td className="px-4 py-3 text-gray-600">{p.contact_name ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{p.phone ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PROSPECT_STATUS_COLORS[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{p.notes ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
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
            <p className="text-sm text-gray-500 mb-5">이 가망건을 삭제하시겠습니까? 복구할 수 없습니다.</p>
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
