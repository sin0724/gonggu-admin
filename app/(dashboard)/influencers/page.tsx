"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Influencer, hasBankDetails } from "@/types/database";
import { formatDate, formatCurrency } from "@/lib/utils";

const EMPTY_BANK = {
  bank_account_holder: "",
  bank_account_type: "",
  bank_swift_code: "",
  bank_account_number: "",
  bank_email: "",
  bank_name: "",
  bank_address: "",
};

interface InfluencerStats {
  campaignCount: number;
  totalSales: number;
  totalSettlement: number;
  unsettledCount: number;
  campaigns: {
    id: string;
    campaign_id: string;
    campaign_name: string;
    client_name: string;
    sales_amount: number;
    settlement_amount: number;
    is_settled: boolean;
    created_at: string;
  }[];
}

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, InfluencerStats>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Influencer | null>(null);
  const [name, setName] = useState("");
  const [accountUrl, setAccountUrl] = useState("");
  const [bank, setBank] = useState({ ...EMPTY_BANK });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchInfluencers = async () => {
    const supabase = createClient();
    const { data: infData } = await supabase
      .from("influencers")
      .select("*")
      .order("name");

    const influencerList = infData ?? [];
    setInfluencers(influencerList);

    // campaign_influencers JOIN campaigns로 집계 데이터 조회
    const { data: ciRaw } = await supabase
      .from("campaign_influencers")
      .select("id, influencer_id, campaign_id, sales_amount, settlement_amount, is_settled, is_uploaded, created_at, campaigns:campaign_id(campaign_name, client_name)");

    type CiRow = {
      id: string;
      influencer_id: string;
      campaign_id: string;
      sales_amount: number;
      settlement_amount: number;
      is_settled: boolean;
      is_uploaded: boolean;
      created_at: string;
      campaigns: { campaign_name: string; client_name: string } | { campaign_name: string; client_name: string }[] | null;
    };

    const ciData = (ciRaw ?? []) as CiRow[];

    const newStatsMap: Record<string, InfluencerStats> = {};
    ciData.forEach((ci) => {
      const campaignInfo = Array.isArray(ci.campaigns) ? ci.campaigns[0] : ci.campaigns;
      const infId = ci.influencer_id;
      if (!newStatsMap[infId]) {
        newStatsMap[infId] = {
          campaignCount: 0,
          totalSales: 0,
          totalSettlement: 0,
          unsettledCount: 0,
          campaigns: [],
        };
      }
      const stats = newStatsMap[infId];
      stats.campaignCount++;
      stats.totalSales += ci.sales_amount || 0;
      stats.totalSettlement += ci.settlement_amount || 0;
      if (!ci.is_settled) stats.unsettledCount++;
      stats.campaigns.push({
        id: ci.id,
        campaign_id: ci.campaign_id,
        campaign_name: campaignInfo?.campaign_name ?? "(알 수 없음)",
        client_name: campaignInfo?.client_name ?? "",
        sales_amount: ci.sales_amount || 0,
        settlement_amount: ci.settlement_amount || 0,
        is_settled: ci.is_settled,
        created_at: ci.created_at,
      });
    });

    setStatsMap(newStatsMap);
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
    setBank({ ...EMPTY_BANK });
    setShowForm(true);
  };

  const openEdit = (inf: Influencer) => {
    setEditTarget(inf);
    setName(inf.name);
    setAccountUrl(inf.account_url ?? "");
    setBank({
      bank_account_holder: inf.bank_account_holder ?? "",
      bank_account_type: inf.bank_account_type ?? "",
      bank_swift_code: inf.bank_swift_code ?? "",
      bank_account_number: inf.bank_account_number ?? "",
      bank_email: inf.bank_email ?? "",
      bank_name: inf.bank_name ?? "",
      bank_address: inf.bank_address ?? "",
    });
    setShowForm(true);
  };

  const handleBankChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name: field, value } = e.target;
    setBank((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name,
      account_url: accountUrl || null,
      bank_account_holder: bank.bank_account_holder || null,
      bank_account_type: bank.bank_account_type || null,
      bank_swift_code: bank.bank_swift_code || null,
      bank_account_number: bank.bank_account_number || null,
      bank_email: bank.bank_email || null,
      bank_name: bank.bank_name || null,
      bank_address: bank.bank_address || null,
    };

    if (editTarget) {
      await supabase.from("influencers").update(payload).eq("id", editTarget.id);
    } else {
      await supabase.from("influencers").insert(payload);
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

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
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
                  <th className="table-header hidden md:table-cell">계정 URL</th>
                  <th className="table-header hidden md:table-cell">계좌정보</th>
                  <th className="table-header">참여 캠페인</th>
                  <th className="table-header hidden md:table-cell">누적 판매액</th>
                  <th className="table-header hidden md:table-cell">누적 정산금액</th>
                  <th className="table-header">미정산 건수</th>
                  <th className="table-header hidden md:table-cell">등록일</th>
                  <th className="table-header text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-gray-400 text-sm">
                      {search ? "검색 결과가 없습니다." : "등록된 인플루언서가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((inf) => {
                    const stats = statsMap[inf.id];
                    const isExpanded = expandedId === inf.id;
                    return (
                      <>
                        <tr key={inf.id} className="hover:bg-gray-50 transition-colors">
                          <td className="table-cell">
                            <button
                              onClick={() => toggleExpand(inf.id)}
                              className="flex items-center gap-1.5 font-medium text-gray-900 hover:text-primary-600 transition-colors"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform text-gray-400 ${isExpanded ? "rotate-90" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {inf.name}
                            </button>
                          </td>
                          <td className="table-cell hidden md:table-cell">
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
                          <td className="table-cell hidden md:table-cell">
                            {hasBankDetails(inf) ? (
                              <span className="badge bg-green-100 text-green-700">등록됨</span>
                            ) : (
                              <span className="badge bg-gray-100 text-gray-500">미등록</span>
                            )}
                          </td>
                          <td className="table-cell text-center">
                            <span className="badge bg-blue-50 text-blue-700">
                              {stats?.campaignCount ?? 0}건
                            </span>
                          </td>
                          <td className="table-cell font-medium hidden md:table-cell">
                            {stats?.totalSales ? formatCurrency(stats.totalSales) : "-"}
                          </td>
                          <td className="table-cell font-medium text-green-700 hidden md:table-cell">
                            {stats?.totalSettlement ? formatCurrency(stats.totalSettlement) : "-"}
                          </td>
                          <td className="table-cell text-center">
                            {(stats?.unsettledCount ?? 0) > 0 ? (
                              <span className="badge bg-orange-100 text-orange-700">
                                {stats.unsettledCount}건
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </td>
                          <td className="table-cell text-gray-500 text-xs hidden md:table-cell">
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
                        {/* 아코디언: 캠페인 참여 이력 */}
                        {isExpanded && (
                          <tr key={`${inf.id}-accordion`}>
                            <td colSpan={9} className="bg-blue-50 px-6 py-3">
                              {!stats || stats.campaigns.length === 0 ? (
                                <p className="text-sm text-gray-400 py-2">참여한 캠페인이 없습니다.</p>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-gray-600 mb-2">캠페인 참여 이력</p>
                                  <div className="grid gap-2">
                                    {stats.campaigns.map((ci) => (
                                      <div
                                        key={ci.id}
                                        className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-blue-100 text-sm"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="font-medium text-gray-900">{ci.campaign_name}</span>
                                          <span className="text-gray-400 text-xs">{ci.client_name}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs">
                                          <span className="text-gray-600">
                                            판매: {ci.sales_amount > 0 ? formatCurrency(ci.sales_amount) : "-"}
                                          </span>
                                          <span className="text-green-700">
                                            정산: {ci.settlement_amount > 0 ? formatCurrency(ci.settlement_amount) : "-"}
                                          </span>
                                          <span className={`badge text-xs ${ci.is_settled ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                            {ci.is_settled ? "정산완료" : "미정산"}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
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

              {/* 정산 계좌 정보 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  정산 계좌 정보{" "}
                  <span className="text-xs font-normal text-gray-400">
                    (Bank Account Details — 정산 시 자동 표시)
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">예금주 (Account Holder)</label>
                    <input
                      type="text"
                      name="bank_account_holder"
                      value={bank.bank_account_holder}
                      onChange={handleBankChange}
                      className="input text-sm"
                      placeholder="예: HONG GILDONG"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">계좌 유형 (Account Type)</label>
                    <input
                      type="text"
                      name="bank_account_type"
                      value={bank.bank_account_type}
                      onChange={handleBankChange}
                      className="input text-sm"
                      placeholder="예: Checking / Savings"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">은행명 (Bank Name)</label>
                    <input
                      type="text"
                      name="bank_name"
                      value={bank.bank_name}
                      onChange={handleBankChange}
                      className="input text-sm"
                      placeholder="예: 국민은행 / Bank of America"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">계좌번호 (Account Number)</label>
                    <input
                      type="text"
                      name="bank_account_number"
                      value={bank.bank_account_number}
                      onChange={handleBankChange}
                      className="input text-sm"
                      placeholder="계좌번호 / IBAN"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">SWIFT / BIC Code</label>
                    <input
                      type="text"
                      name="bank_swift_code"
                      value={bank.bank_swift_code}
                      onChange={handleBankChange}
                      className="input text-sm"
                      placeholder="해외 송금 시 (예: CZNBKRSE)"
                    />
                  </div>
                  <div>
                    <label className="label text-xs">이메일 (Email)</label>
                    <input
                      type="email"
                      name="bank_email"
                      value={bank.bank_email}
                      onChange={handleBankChange}
                      className="input text-sm"
                      placeholder="정산 연락용 이메일"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label text-xs">주소 (Address)</label>
                    <input
                      type="text"
                      name="bank_address"
                      value={bank.bank_address}
                      onChange={handleBankChange}
                      className="input text-sm"
                      placeholder="해외 송금 시 수취인 주소"
                    />
                  </div>
                </div>
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
