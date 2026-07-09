"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CampaignSeller, PriceTier } from "@/types/database";
import { formatWon, formatTwd, krwToTwd } from "@/lib/utils";
import { resolveTierPrice } from "@/lib/economics";

// 캠페인별 셀러 관리 — 대만 총판/개별 셀러/공동구매 업체를 "셀러"로 통일.
// 셀러가 우리에게 견적 단가(수출 영세율 0%)로 구매해가서 판매하는 채널.
// 공급액(우리 매출) = 수량 × 견적 단가,
// 마진 = 수량 × (견적 단가 − 공급 실질 원가[부가세 매입이면 ÷1.1]).

interface SellerTableProps {
  campaignId: string;
  sellers: CampaignSeller[];
  /** 캠페인 기본 셀러 견적가 (영세율 0%, 원). 0이면 미설정 */
  campaignQuotePrice: number;
  /** 캠페인 견적가 수량 구간 */
  quoteTiers: PriceTier[];
  /** 구간·과세 구분 반영된 공급 실질 원가/개 (총수량 기준). 0이면 마진 계산 불가 */
  effectiveSupplyCost: number;
  exchangeRate: number | null;
}

/** 금액 셀 — TWD 메인 · 원화 보조. 환율 없으면 원화만. */
function Money({
  krw,
  rate,
  className,
}: {
  krw: number;
  rate: number | null;
  className?: string;
}) {
  if (krw === 0) return <span className="text-gray-300">-</span>;
  const twd = krwToTwd(krw, rate);
  if (twd === null) return <span className={className}>{formatWon(krw)}</span>;
  return (
    <span className={className}>
      {formatTwd(twd)}
      <span className="block text-xs font-normal text-gray-400">
        {formatWon(krw)}
      </span>
    </span>
  );
}

const fmt = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

export default function SellerTable({
  campaignId,
  sellers,
  campaignQuotePrice,
  quoteTiers,
  effectiveSupplyCost,
  exchangeRate,
}: SellerTableProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<CampaignSeller | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    quantity: "",
    quote_price: "",
    is_paid: false,
    notes: "",
  });

  // 셀러별 적용 견적 단가 — 개별 단가 우선, 없으면 캠페인 구간 단가를 수량에 맞춰 자동 적용
  const effQuoteFor = (s: CampaignSeller) =>
    s.quote_price ??
    resolveTierPrice(campaignQuotePrice, quoteTiers, s.quantity || 0);

  const totalQty = sellers.reduce((sum, s) => sum + (s.quantity || 0), 0);
  const totalRevenue = sellers.reduce(
    (sum, s) => sum + (s.quantity || 0) * effQuoteFor(s),
    0
  );
  const totalMargin =
    effectiveSupplyCost > 0
      ? sellers.reduce(
          (sum, s) =>
            sum + (s.quantity || 0) * (effQuoteFor(s) - effectiveSupplyCost),
          0
        )
      : 0;
  const unpaidCount = sellers.filter((s) => !s.is_paid).length;

  const openAdd = () => {
    setEditRecord(undefined);
    setForm({
      name: "",
      contact: "",
      quantity: "",
      quote_price: "",
      is_paid: false,
      notes: "",
    });
    setShowModal(true);
  };

  const openEdit = (s: CampaignSeller) => {
    setEditRecord(s);
    setForm({
      name: s.name,
      contact: s.contact ?? "",
      quantity: s.quantity ? s.quantity.toString() : "",
      quote_price: s.quote_price != null ? s.quote_price.toString() : "",
      is_paid: s.is_paid,
      notes: s.notes ?? "",
    });
    setShowModal(true);
  };

  // 입금 상태 변경은 API 경유 — 재무관리(공구 사업부 실적)에 자동 기록/제거
  const syncPaid = async (sellerId: string, paid: boolean) => {
    const res = await fetch("/api/seller-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellerId, paid }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "입금 처리 실패");
    if (json.warning) alert(json.warning);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const supabase = createClient();
      // is_paid는 API(재무 연동)가 관리 — 저장 후 변경분만 동기화
      const payload = {
        campaign_id: campaignId,
        name: form.name.trim(),
        contact: form.contact.trim() || null,
        quantity: parseInt(form.quantity, 10) || 0,
        quote_price: form.quote_price ? Math.round(parseFloat(form.quote_price)) : null,
        notes: form.notes.trim() || null,
      };
      let sellerId = editRecord?.id;
      if (editRecord) {
        const { error } = await supabase
          .from("campaign_sellers")
          .update(payload)
          .eq("id", editRecord.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("campaign_sellers")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        sellerId = data.id;
      }
      // 입금 체크가 바뀌었으면 재무 실적 동기화. 수량·단가가 바뀐 기존 입금 건도
      // 재기록해서 재무 금액이 최신 조건을 따라가게 한다.
      const wasPaid = editRecord?.is_paid ?? false;
      if (sellerId && (form.is_paid !== wasPaid || form.is_paid)) {
        await syncPaid(sellerId, form.is_paid);
      }
      setShowModal(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: CampaignSeller) => {
    if (!confirm(`"${s.name}" 셀러를 이 캠페인에서 제거하시겠습니까?`)) return;
    setDeletingId(s.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("campaign_sellers")
        .delete()
        .eq("id", s.id);
      if (error) throw error;
      router.refresh();
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleTogglePaid = async (s: CampaignSeller) => {
    setTogglingId(s.id);
    try {
      await syncPaid(s.id, !s.is_paid);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "업데이트 중 오류가 발생했습니다.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            셀러 관리
            <span className="ml-2 text-xs font-normal text-gray-400">
              총판 · 개별 셀러 · 공동구매 업체 (견적 단가 영세율 0%) · 입금 체크
              시 재무 공구 사업부 실적에 자동 반영
            </span>
          </h2>
        </div>
        <button onClick={openAdd} className="btn-primary whitespace-nowrap">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          셀러 추가
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">셀러</th>
                <th className="table-header text-right">수량 (세트)</th>
                <th className="table-header text-right">견적 단가/개</th>
                <th className="table-header text-right">공급액 (우리 매출)</th>
                <th className="table-header text-right">마진 (−실질 원가)</th>
                <th className="table-header text-center">입금</th>
                <th className="table-header hidden md:table-cell">메모</th>
                <th className="table-header text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sellers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 text-sm">
                    등록된 셀러가 없습니다. 총판·개별 셀러·공동구매 업체 모두
                    &quot;셀러&quot;로 등록하세요.
                  </td>
                </tr>
              ) : (
                sellers.map((s) => {
                  const quote = effQuoteFor(s);
                  const revenue = (s.quantity || 0) * quote;
                  const margin =
                    effectiveSupplyCost > 0
                      ? (s.quantity || 0) * (quote - effectiveSupplyCost)
                      : null;
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <p className="font-medium text-gray-900">{s.name}</p>
                        {s.contact && (
                          <p className="text-xs text-gray-400">{s.contact}</p>
                        )}
                      </td>
                      <td className="table-cell text-right text-gray-700">
                        {s.quantity > 0 ? fmt(s.quantity) : "-"}
                      </td>
                      <td className="table-cell text-right">
                        {quote > 0 ? (
                          <>
                            <Money krw={quote} rate={exchangeRate} />
                            <span
                              className={`block text-[10px] mt-0.5 ${
                                s.quote_price != null
                                  ? "text-blue-500"
                                  : "text-gray-400"
                              }`}
                            >
                              {s.quote_price != null ? "개별 단가" : "구간 단가 자동"}
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-300 text-xs">
                            견적가 미설정
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-right font-medium">
                        <Money krw={revenue} rate={exchangeRate} />
                      </td>
                      <td className="table-cell text-right">
                        {margin === null ? (
                          <span className="text-gray-300 text-xs">공급가 미설정</span>
                        ) : (
                          <Money
                            krw={margin}
                            rate={exchangeRate}
                            className={`font-medium ${
                              margin >= 0 ? "text-blue-700" : "text-red-600"
                            }`}
                          />
                        )}
                      </td>
                      <td className="table-cell text-center">
                        <input
                          type="checkbox"
                          checked={s.is_paid}
                          disabled={togglingId === s.id}
                          onChange={() => handleTogglePaid(s)}
                          className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:opacity-50"
                        />
                        {s.is_paid && s.paid_date && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {s.paid_date}
                          </p>
                        )}
                      </td>
                      <td className="table-cell text-gray-500 text-xs max-w-[140px] truncate hidden md:table-cell">
                        {s.notes || "-"}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(s)}
                            className="btn-secondary btn-sm"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            disabled={deletingId === s.id}
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
            {sellers.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200 text-sm font-medium">
                <tr>
                  <td className="table-cell text-gray-500">
                    합계 {sellers.length}개 셀러
                    {unpaidCount > 0 && (
                      <span className="ml-1.5 text-xs text-orange-500">
                        미입금 {unpaidCount}
                      </span>
                    )}
                  </td>
                  <td className="table-cell text-right text-gray-900">
                    {fmt(totalQty)}
                  </td>
                  <td className="table-cell" />
                  <td className="table-cell text-right text-gray-900">
                    <Money krw={totalRevenue} rate={exchangeRate} />
                  </td>
                  <td className="table-cell text-right">
                    {effectiveSupplyCost > 0 ? (
                      <Money
                        krw={totalMargin}
                        rate={exchangeRate}
                        className={totalMargin >= 0 ? "text-blue-700" : "text-red-600"}
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="table-cell" colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-gray-900">
              {editRecord ? "셀러 수정" : "셀러 추가"}
            </h3>
            <div>
              <label className="label">
                셀러명 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="예: ○○총판, ○○공동구매"
                required
              />
            </div>
            <div>
              <label className="label">연락처</label>
              <input
                type="text"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                className="input"
                placeholder="담당자 · 전화/LINE 등"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">수량 (세트)</label>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="input"
                  placeholder="예: 500"
                  min="0"
                />
              </div>
              <div>
                <label className="label">견적 단가 (원 · 영세율 0%)</label>
                <input
                  type="number"
                  value={form.quote_price}
                  onChange={(e) =>
                    setForm({ ...form, quote_price: e.target.value })
                  }
                  className="input"
                  placeholder={(() => {
                    const auto = resolveTierPrice(
                      campaignQuotePrice,
                      quoteTiers,
                      parseInt(form.quantity, 10) || 0
                    );
                    return auto > 0 ? `자동: ${fmt(auto)}원` : "개당 단가";
                  })()}
                  min="0"
                />
                <p className="text-xs text-gray-400 mt-1">
                  비워두면 캠페인 구간 단가를 수량에 맞춰 자동 적용
                </p>
              </div>
            </div>
            <div>
              <label className="label">메모</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input"
                placeholder="예: 총판 · 재주문 예정"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_paid}
                onChange={(e) => setForm({ ...form, is_paid: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              입금 완료{" "}
              <span className="text-xs text-gray-400">
                — 체크 시 재무관리 공구 사업부 실적에 공급액·마진 자동 기록
              </span>
            </label>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn-secondary"
              >
                취소
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "저장 중..." : editRecord ? "수정" : "추가"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
