"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Seller, SellerSale } from "@/types/database";
import { formatDate, formatNumber, formatWon } from "@/lib/utils";
import SellerModal from "@/components/sellers/seller-modal";
import SellerSaleModal, {
  SaleCampaignOption,
} from "@/components/sellers/seller-sale-modal";

interface SellerDirectoryProps {
  sellers: Seller[];
  /** 셀러별 과거 공구 실적 */
  sales: SellerSale[];
  campaigns: SaleCampaignOption[];
}

type SortKey = "sales" | "name" | "recent";

export default function SellerDirectory({
  sellers,
  sales,
  campaigns,
}: SellerDirectoryProps) {
  const router = useRouter();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [sellerModal, setSellerModal] = useState<
    { mode: "create" } | { mode: "edit"; seller: Seller } | null
  >(null);
  const [saleModal, setSaleModal] = useState<{
    seller: Seller;
    sale?: SellerSale;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Seller | null>(null);
  const [working, setWorking] = useState(false);

  /** 셀러별 실적 집계 — 누적 매출과 건수 */
  const salesBySeller = useMemo(() => {
    const map = new Map<string, SellerSale[]>();
    for (const s of sales) {
      const list = map.get(s.seller_id) ?? [];
      list.push(s);
      map.set(s.seller_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.sale_date ?? "").localeCompare(a.sale_date ?? ""));
    }
    return map;
  }, [sales]);

  const totalOf = (sellerId: string) =>
    (salesBySeller.get(sellerId) ?? []).reduce((sum, s) => sum + (s.amount || 0), 0);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of sellers) for (const c of s.categories ?? []) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [sellers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = sellers.filter((s) => {
      if (activeOnly && !s.is_active) return false;
      if (category !== "all" && !(s.categories ?? []).includes(category)) return false;
      if (q) {
        const hay = [s.name, s.contact_name, s.channel, s.region, s.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return out.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "ko");
        case "recent":
          return b.created_at.localeCompare(a.created_at);
        case "sales":
        default:
          return totalOf(b.id) - totalOf(a.id);
      }
    });
    // totalOf는 salesBySeller에서 파생 — 의존성으로 salesBySeller를 넣는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellers, search, category, activeOnly, sortKey, salesBySeller]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("sellers")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`"${deleteTarget.name}" 셀러가 삭제되었습니다.`);
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  const refresh = () => {
    setSellerModal(null);
    setSaleModal(null);
    router.refresh();
  };

  const grandTotal = filtered.reduce((sum, s) => sum + totalOf(s.id), 0);

  return (
    <div className="space-y-4">
      {/* 검색 · 필터 · 등록 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="셀러명 · 담당자 · 채널 검색"
              className="input pl-9"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input w-auto"
          >
            <option value="all">전체 카테고리</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="input w-auto"
          >
            <option value="sales">누적 매출순</option>
            <option value="name">이름순</option>
            <option value="recent">최근 등록순</option>
          </select>

          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            거래중만
          </label>
        </div>

        <button
          onClick={() => setSellerModal({ mode: "create" })}
          className="btn-primary whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          셀러 등록
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">셀러</th>
                <th className="table-header">공구 카테고리</th>
                <th className="table-header text-right">고정비</th>
                <th className="table-header text-right">RS</th>
                <th className="table-header text-right">누적 매출</th>
                <th className="table-header text-center">실적</th>
                <th className="table-header text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400 text-sm">
                    {sellers.length === 0
                      ? "등록된 셀러가 없습니다. 우측 상단에서 추가하세요."
                      : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const sellerSales = salesBySeller.get(s.id) ?? [];
                  const total = totalOf(s.id);
                  const isOpen = expanded === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr
                        className={`hover:bg-gray-50 transition-colors ${
                          s.is_active ? "" : "opacity-60"
                        }`}
                      >
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{s.name}</p>
                            {!s.is_active && (
                              <span className="badge bg-gray-100 text-gray-500">
                                비활성
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[s.contact_name, s.region, s.channel]
                              .filter(Boolean)
                              .join(" · ") || "-"}
                          </p>
                          {s.channel_url && (
                            <a
                              href={s.channel_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary-600 hover:underline"
                            >
                              채널 열기
                            </a>
                          )}
                        </td>
                        <td className="table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(s.categories ?? []).length === 0 ? (
                              <span className="text-gray-300 text-xs">-</span>
                            ) : (
                              (s.categories ?? []).map((c) => (
                                <span key={c} className="badge bg-gray-100 text-gray-600">
                                  {c}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="table-cell text-right whitespace-nowrap">
                          {s.fixed_fee ? (
                            formatWon(s.fixed_fee)
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="table-cell text-right whitespace-nowrap">
                          {s.rs_rate !== null ? (
                            <span className="font-medium">{s.rs_rate}%</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="table-cell text-right whitespace-nowrap">
                          {total > 0 ? (
                            <span className="font-semibold text-gray-900">
                              {formatWon(total)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="table-cell text-center">
                          <button
                            onClick={() => setExpanded(isOpen ? null : s.id)}
                            className="btn-secondary btn-sm"
                          >
                            {sellerSales.length}건 {isOpen ? "▲" : "▼"}
                          </button>
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSaleModal({ seller: s })}
                              className="btn-secondary btn-sm"
                              title="지난 공구 매출 기입"
                            >
                              실적 추가
                            </button>
                            <button
                              onClick={() => setSellerModal({ mode: "edit", seller: s })}
                              className="btn-secondary btn-sm"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => setDeleteTarget(s)}
                              className="btn btn-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* 실적 상세 */}
                      {isOpen && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={7} className="px-4 py-3">
                            {sellerSales.length === 0 ? (
                              <p className="text-xs text-gray-400 py-4 text-center">
                                등록된 공구 실적이 없습니다. &quot;실적 추가&quot;로
                                지난 공구 매출을 기입하세요.
                              </p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-gray-500">
                                    <th className="text-left py-1.5 font-medium">진행일</th>
                                    <th className="text-left py-1.5 font-medium">공구명</th>
                                    <th className="text-right py-1.5 font-medium">수량</th>
                                    <th className="text-right py-1.5 font-medium">매출액</th>
                                    <th className="text-left py-1.5 font-medium pl-4">메모</th>
                                    <th />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {sellerSales.map((sale) => (
                                    <tr key={sale.id}>
                                      <td className="py-1.5 text-xs text-gray-600 whitespace-nowrap">
                                        {sale.sale_date ? formatDate(sale.sale_date) : "-"}
                                      </td>
                                      <td className="py-1.5">
                                        {sale.campaign_id ? (
                                          <Link
                                            href={`/campaigns/${sale.campaign_id}`}
                                            className="text-primary-600 hover:underline"
                                          >
                                            {sale.title}
                                          </Link>
                                        ) : (
                                          sale.title
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">
                                        {sale.quantity ? formatNumber(sale.quantity) : "-"}
                                      </td>
                                      <td className="py-1.5 text-right font-medium whitespace-nowrap">
                                        {formatWon(sale.amount)}
                                      </td>
                                      <td className="py-1.5 pl-4 text-xs text-gray-500 max-w-[220px] truncate">
                                        {sale.notes || "-"}
                                      </td>
                                      <td className="py-1.5 text-right">
                                        <button
                                          onClick={() => setSaleModal({ seller: s, sale })}
                                          className="text-xs text-gray-500 hover:text-gray-800 underline"
                                        >
                                          수정
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            총 {filtered.length}개 셀러
            {filtered.length !== sellers.length && ` (전체 ${sellers.length}개 중)`}
          </p>
          {grandTotal > 0 && (
            <p className="text-xs text-gray-600">
              누적 매출 합계{" "}
              <span className="font-semibold text-gray-900">
                {formatWon(grandTotal)}
              </span>
            </p>
          )}
        </div>
      </div>

      {sellerModal && (
        <SellerModal
          seller={sellerModal.mode === "edit" ? sellerModal.seller : undefined}
          onClose={() => setSellerModal(null)}
          onSaved={refresh}
        />
      )}

      {saleModal && (
        <SellerSaleModal
          sellerId={saleModal.seller.id}
          sellerName={saleModal.seller.name}
          sale={saleModal.sale}
          campaigns={campaigns}
          onClose={() => setSaleModal(null)}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="셀러 삭제"
        danger
        description={
          <>
            <b className="text-gray-800">&quot;{deleteTarget?.name}&quot;</b> 셀러와{" "}
            <b className="text-red-600">등록된 공구 실적이 모두 삭제</b>됩니다.
            캠페인별 셀러 거래 기록은 남습니다.
          </>
        }
        confirmLabel="영구 삭제"
        requireText={deleteTarget?.name}
        loading={working}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
