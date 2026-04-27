"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Manager } from "@/types/database";
import ManagerModal from "./manager-modal";

interface ManagerTableProps {
  initialManagers: Manager[];
}

export default function ManagerTable({ initialManagers }: ManagerTableProps) {
  const [managers, setManagers] = useState<Manager[]>(initialManagers);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Manager | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleSaved = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("managers")
      .select("*")
      .order("created_at", { ascending: false });
    setManagers(data ?? []);
    setModalOpen(false);
    setEditTarget(undefined);
  };

  const handleEdit = (manager: Manager) => {
    setEditTarget(manager);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    await supabase.from("managers").delete().eq("id", id);
    setManagers((prev) => prev.filter((m) => m.id !== id));
    setDeleteId(null);
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => { setEditTarget(undefined); setModalOpen(true); }}
          className="btn-primary"
        >
          + 담당자 등록
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">이름</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">이메일</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">전화번호</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">등록일</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {managers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">
                    등록된 담당자가 없습니다.
                  </td>
                </tr>
              ) : (
                managers.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                    <td className="px-4 py-3 text-gray-600">{m.email ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{m.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(m)}
                          className="text-xs text-gray-500 hover:text-primary-600 transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => setDeleteId(m.id)}
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
        {managers.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            총 {managers.length}명
          </div>
        )}
      </div>

      {modalOpen && (
        <ManagerModal
          manager={editTarget}
          onClose={() => { setModalOpen(false); setEditTarget(undefined); }}
          onSaved={handleSaved}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">삭제 확인</h3>
            <p className="text-sm text-gray-500 mb-5">
              이 담당자를 삭제하시겠습니까? 해당 담당자로 지정된 가망건의 담당자 정보가 초기화됩니다.
            </p>
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
