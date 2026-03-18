"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Influencer } from "@/types/database";
import { formatDate } from "@/lib/utils";

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Influencer | null>(null);
  const [name, setName] = useState("");
  const [accountUrl, setAccountUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchInfluencers = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("influencers")
      .select("*")
      .order("name");
    setInfluencers(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchInfluencers();
  }, []);

  const filtered = influencers.filter((inf) =>
    inf.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditTarget(null);
    setName("");
    setAccountUrl("");
    setShowForm(true);
  };

  const openEdit = (inf: Influencer) => {
    setEditTarget(inf);
    setName(inf.name);
    setAccountUrl(inf.account_url ?? "");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    if (editTarget) {
      await supabase
        .from("influencers")
        .update({ name, account_url: accountUrl || null })
        .eq("id", editTarget.id);
    } else {
      await supabase
        .from("influencers")
        .insert({ name, account_url: accountUrl || null });
    }

    await fetchInfluencers();
    setShowForm(false);
    setSaving(false);
  };

  const handleDelete = async (id: string, infName: string) => {
    if (!confirm(`"${infName}" 인플루언서를 삭제하시겠습니까?`)) return;
    setDeletingId(id);
    const supabase = createClient();
    await supabase.from("influencers").delete().eq("id", id);
    await fetchInfluencers();
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">인플루언서 관리</h1>
        <p className="text-sm text-gray-500 mt-1">등록된 인플루언서를 관리합니다.</p>
      </div>

      {/* 검색 + 등록 */}
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
            placeholder="인플루언서명 검색"
            className="input pl-9"
          />
        </div>
        <button onClick={openCreate} className="btn-primary whitespace-nowrap">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          인플루언서 등록
        </button>
      </div>

      {/* 테이블 */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">이름</th>
                  <th className="table-header">계정 URL</th>
                  <th className="table-header">등록일</th>
                  <th className="table-header text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-gray-400 text-sm">
                      {search ? "검색 결과가 없습니다." : "등록된 인플루언서가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((inf) => (
                    <tr key={inf.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell font-medium text-gray-900">
                        {inf.name}
                      </td>
                      <td className="table-cell">
                        {inf.account_url ? (
                          <a
                            href={inf.account_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline text-sm"
                          >
                            {inf.account_url}
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 text-xs">
                        {formatDate(inf.created_at)}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(inf)}
                            className="btn-secondary btn-sm"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(inf.id, inf.name)}
                            disabled={deletingId === inf.id}
                            className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
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
        )}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">총 {filtered.length}명</p>
        </div>
      </div>

      {/* 등록/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {editTarget ? "인플루언서 수정" : "인플루언서 등록"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="인플루언서 이름"
                  required
                />
              </div>
              <div>
                <label className="label">계정 URL</label>
                <input
                  type="url"
                  value={accountUrl}
                  onChange={(e) => setAccountUrl(e.target.value)}
                  className="input"
                  placeholder="https://instagram.com/..."
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn-secondary"
                >
                  취소
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "저장 중..." : editTarget ? "수정 완료" : "등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
