"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CampaignInfluencer,
  CampaignInfluencerInsert,
  Influencer,
  ContentItem,
  ContentType,
  CONTENT_TYPE_LABEL,
  hasBankDetails,
} from "@/types/database";
import type { CrmKol } from "@/lib/supabase/crm";
import { formatCrmMoney } from "@/lib/supabase/crm";
import { formatTwd, formatWon, krwToTwd } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const CONTENT_TYPE_OPTIONS = Object.entries(CONTENT_TYPE_LABEL) as [
  ContentType,
  string
][];

const SETTLEMENT_METHOD_SUGGESTIONS = [
  "계좌이체",
  "해외송금 (SWIFT)",
  "PayPal",
  "현금",
  "기타",
];

interface InfluencerModalProps {
  campaignId: string;
  record?: CampaignInfluencer & { influencer: Influencer };
  onClose: () => void;
  campaignInfluencerRsRate?: number;
  campaignPurchaseFormUrl?: string;
  campaignExchangeRate?: number | null;
}

export default function InfluencerModal({
  campaignId,
  record,
  onClose,
  campaignInfluencerRsRate,
  campaignPurchaseFormUrl,
  campaignExchangeRate = null,
}: InfluencerModalProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 금액 입력 통화 — 환율이 있으면 NT$ 입력 지원 (저장은 항상 KRW).
  // 판매금액·정산금액에 함께 적용된다.
  const [amountCurrency, setAmountCurrency] = useState<"krw" | "twd">("krw");
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  // tianxia-crm KOL DB 검색 결과 — CRM에서 선택하면 저장 시 로컬 influencers에 자동 등록
  const [crmResults, setCrmResults] = useState<CrmKol[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmUnavailable, setCrmUnavailable] = useState(false);
  const [selectedCrmKol, setSelectedCrmKol] = useState<CrmKol | null>(null);
  const [isNewInfluencer, setIsNewInfluencer] = useState(false);
  // 정산 계좌 정보 편집 (influencers 마스터에 저장)
  const [bankEditOpen, setBankEditOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_account_holder: "",
    bank_name: "",
    bank_account_number: "",
    bank_account_type: "",
    bank_swift_code: "",
    bank_email: "",
    bank_address: "",
  });
  const [isAutoCalc, setIsAutoCalc] = useState(false);
  const [utmCode, setUtmCode] = useState("");
  const [utmSource, setUtmSource] = useState("instagram");
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const buildUtmUrl = () => {
    if (!campaignPurchaseFormUrl || !utmCode.trim()) return "";
    const base = campaignPurchaseFormUrl;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}utm_source=${encodeURIComponent(utmSource)}&utm_medium=influencer&utm_content=${encodeURIComponent(utmCode.trim())}`;
  };

  const generatedUrl = buildUtmUrl();

  const handleCopyUtm = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyUtm = () => {
    if (!generatedUrl) return;
    setFormData((prev) => ({ ...prev, purchase_url: generatedUrl }));
  };

  // 콘텐츠 다건 (기존 단일 content_url 데이터는 '기타'로 변환해 표시)
  const [contents, setContents] = useState<ContentItem[]>(
    record?.contents && record.contents.length > 0
      ? record.contents
      : record?.content_url
      ? [{ type: "other", url: record.content_url }]
      : []
  );

  const [formData, setFormData] = useState({
    influencer_id: record?.influencer_id ?? "",
    new_influencer_name: "",
    new_influencer_account_url: "",
    purchase_url: record?.purchase_url ?? "",
    is_product_sent: record?.is_product_sent ?? false,
    sent_date: record?.sent_date ?? "",
    is_uploaded: record?.is_uploaded ?? false,
    sales_amount: record?.sales_amount?.toString() ?? "0",
    quantity: record?.quantity?.toString() ?? "0",
    settlement_method: record?.settlement_method ?? "",
    settlement_amount: record?.settlement_amount?.toString() ?? "0",
    is_settled: record?.is_settled ?? false,
    settled_date: record?.settled_date ?? "",
    notes: record?.notes ?? "",
  });

  useEffect(() => {
    const fetchInfluencers = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("influencers")
        .select("*")
        .order("name");
      setInfluencers(data ?? []);

      // 수정 모드일 때 선택된 인플루언서 세팅
      if (record && data) {
        const found = data.find((inf) => inf.id === record.influencer_id);
        if (found) setSelectedInfluencer(found);
      }
    };
    fetchInfluencers();
  }, [record]);

  // CRM KOL DB 검색 (디바운스) — 추가 모드에서만
  useEffect(() => {
    if (record || isNewInfluencer) return;
    const q = searchQuery.trim();
    const timer = setTimeout(async () => {
      setCrmLoading(true);
      try {
        const res = await fetch(`/api/crm-kols?q=${encodeURIComponent(q)}`);
        if (res.status === 503) {
          setCrmUnavailable(true);
          setCrmResults([]);
          return;
        }
        if (!res.ok) throw new Error();
        const json = await res.json();
        setCrmUnavailable(false);
        setCrmResults(json.kols ?? []);
      } catch {
        setCrmResults([]);
      } finally {
        setCrmLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, record, isNewInfluencer]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredInfluencers = influencers.filter((inf) =>
    inf.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectInfluencer = (inf: Influencer) => {
    setSelectedInfluencer(inf);
    setSelectedCrmKol(null);
    setFormData((prev) => ({ ...prev, influencer_id: inf.id }));
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleSelectCrmKol = (kol: CrmKol) => {
    // CRM KOL이 이미 로컬에 등록돼 있으면 로컬 레코드를 우선 사용 (계좌 정보 유지)
    const handle = kol.instagram_handle?.toLowerCase();
    const existing = influencers.find(
      (inf) =>
        (handle && inf.account_url?.toLowerCase().includes(handle)) ||
        inf.name.toLowerCase() === kol.name.toLowerCase()
    );
    if (existing) {
      handleSelectInfluencer(existing);
      return;
    }
    setSelectedCrmKol(kol);
    setSelectedInfluencer(null);
    setFormData((prev) => ({ ...prev, influencer_id: "" }));
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleClearInfluencer = () => {
    setSelectedInfluencer(null);
    setSelectedCrmKol(null);
    setFormData((prev) => ({ ...prev, influencer_id: "" }));
  };

  // 입력값(현재 통화 기준) → KRW 환산
  const toKrw = (value: string): number => {
    const v = parseFloat(value) || 0;
    return amountCurrency === "twd" && campaignExchangeRate
      ? Math.round(v * campaignExchangeRate)
      : v;
  };

  const switchAmountCurrency = (next: "krw" | "twd") => {
    if (next === amountCurrency || !campaignExchangeRate) return;
    // 입력 중인 금액을 새 통화로 환산해 유지
    const convert = (s: string) => {
      const v = parseFloat(s);
      if (!(v > 0)) return s;
      const converted =
        next === "twd" ? v / campaignExchangeRate : v * campaignExchangeRate;
      return String(Math.round(converted));
    };
    setFormData((prev) => ({
      ...prev,
      sales_amount: convert(prev.sales_amount),
      settlement_amount: convert(prev.settlement_amount),
    }));
    setAmountCurrency(next);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (name === "sales_amount") {
      const salesVal = parseFloat(value) || 0;
      if (campaignInfluencerRsRate !== undefined && campaignInfluencerRsRate > 0) {
        const autoSettlement = Math.round(salesVal * (campaignInfluencerRsRate / 100));
        setIsAutoCalc(true);
        setFormData((prev) => ({
          ...prev,
          sales_amount: value,
          settlement_amount: autoSettlement.toString(),
        }));
        return;
      }
    }

    if (name === "settlement_amount") {
      setIsAutoCalc(false);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      let influencerId = formData.influencer_id;

      if (isNewInfluencer) {
        if (!formData.new_influencer_name.trim()) {
          setError("인플루언서 이름을 입력해주세요.");
          setLoading(false);
          return;
        }
        const { data: newInf, error: infError } = await supabase
          .from("influencers")
          .insert({
            name: formData.new_influencer_name,
            account_url: formData.new_influencer_account_url || null,
          })
          .select()
          .single();
        if (infError) throw infError;
        influencerId = newInf.id;
      }

      // CRM KOL DB에서 선택한 경우 — 로컬 influencers에 자동 등록 후 연결
      if (!influencerId && selectedCrmKol) {
        const handle = selectedCrmKol.instagram_handle;
        const { data: newInf, error: infError } = await supabase
          .from("influencers")
          .insert({
            name: selectedCrmKol.name,
            account_url: handle ? `https://instagram.com/${handle}` : null,
          })
          .select()
          .single();
        if (infError) throw infError;
        influencerId = newInf.id;
      }

      if (!influencerId) {
        setError("인플루언서를 선택해주세요.");
        setLoading(false);
        return;
      }

      // 정산 계좌 정보 편집분 저장 (influencers 마스터)
      if (bankEditOpen) {
        const { error: bankError } = await supabase
          .from("influencers")
          .update({
            bank_account_holder: bankForm.bank_account_holder.trim() || null,
            bank_name: bankForm.bank_name.trim() || null,
            bank_account_number: bankForm.bank_account_number.trim() || null,
            bank_account_type: bankForm.bank_account_type.trim() || null,
            bank_swift_code: bankForm.bank_swift_code.trim() || null,
            bank_email: bankForm.bank_email.trim() || null,
            bank_address: bankForm.bank_address.trim() || null,
          })
          .eq("id", influencerId);
        if (bankError) throw bankError;
      }

      const validContents = contents.filter((c) => c.url.trim() !== "");

      const payload: CampaignInfluencerInsert = {
        campaign_id: campaignId,
        influencer_id: influencerId,
        purchase_url: formData.purchase_url.trim() || null,
        // 주문 시트는 더 이상 사용하지 않음 — 기존 값만 보존
        sheet_url: record?.sheet_url ?? null,
        is_product_sent: formData.is_product_sent,
        sent_date: formData.sent_date || null,
        contents: validContents,
        content_url: validContents[0]?.url ?? null,
        is_uploaded: formData.is_uploaded,
        sales_amount: toKrw(formData.sales_amount),
        quantity: parseInt(formData.quantity, 10) || 0,
        settlement_method: formData.settlement_method || null,
        settlement_amount: toKrw(formData.settlement_amount),
        is_settled: formData.is_settled,
        settled_date: formData.settled_date || null,
        notes: formData.notes || null,
      };

      if (record) {
        const { error } = await supabase
          .from("campaign_influencers")
          .update(payload)
          .eq("id", record.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("campaign_influencers")
          .insert(payload);
        if (error) throw error;
      }

      toast.success(
        record ? "인플루언서 정보가 수정되었습니다." : "인플루언서가 추가되었습니다."
      );
      router.refresh();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message;
      setError(msg ?? "저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {record ? "인플루언서 정보 수정" : "인플루언서 추가"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 인플루언서 선택 */}
          {!record && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setIsNewInfluencer(false); handleClearInfluencer(); }}
                  className={`btn btn-sm ${!isNewInfluencer ? "btn-primary" : "btn-secondary"}`}
                >
                  KOL 검색 (CRM DB)
                </button>
                <button
                  type="button"
                  onClick={() => { setIsNewInfluencer(true); handleClearInfluencer(); }}
                  className={`btn btn-sm ${isNewInfluencer ? "btn-primary" : "btn-secondary"}`}
                >
                  직접 입력
                </button>
              </div>

              {!isNewInfluencer ? (
                <div ref={searchRef} className="relative">
                  <label className="label">
                    KOL 검색 *{" "}
                    <span className="text-xs font-normal text-gray-400">
                      — tianxia-crm KOL DB + 이 시스템 등록분
                    </span>
                  </label>

                  {/* 선택된 인플루언서/CRM KOL 표시 */}
                  {selectedInfluencer || selectedCrmKol ? (
                    <div className="flex items-center justify-between px-3 py-2.5 border border-primary-300 bg-primary-50 rounded-lg">
                      <span className="text-sm font-medium text-primary-800">
                        {selectedInfluencer?.name ?? selectedCrmKol?.name}
                        {selectedInfluencer?.account_url && (
                          <span className="ml-2 text-xs text-primary-500 font-normal">{selectedInfluencer.account_url}</span>
                        )}
                        {selectedCrmKol && (
                          <span className="ml-2 text-xs text-primary-500 font-normal">
                            {selectedCrmKol.instagram_handle && `@${selectedCrmKol.instagram_handle}`}
                            {selectedCrmKol.followers != null &&
                              ` · 팔로워 ${selectedCrmKol.followers.toLocaleString("ko-KR")}`}
                            {" · CRM에서 가져옴"}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearInfluencer}
                        className="text-primary-400 hover:text-primary-700 ml-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="이름 또는 인스타그램 핸들로 검색..."
                      className="input"
                      autoComplete="off"
                    />
                  )}

                  {/* 드롭다운 — CRM KOL DB 메인 + 이 시스템 등록분 */}
                  {showDropdown && !selectedInfluencer && !selectedCrmKol && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase">
                        CRM KOL DB
                        {crmLoading && " · 검색 중..."}
                      </p>
                      {crmUnavailable ? (
                        <p className="text-xs text-orange-500 px-3 pb-2">
                          CRM 연동 키가 설정되지 않았습니다 (.env의 CRM_SUPABASE_URL 확인).
                        </p>
                      ) : crmResults.length === 0 && !crmLoading ? (
                        <p className="text-xs text-gray-400 px-3 pb-2">검색 결과 없음</p>
                      ) : (
                        crmResults.map((kol) => (
                          <button
                            key={kol.id}
                            type="button"
                            onMouseDown={() => handleSelectCrmKol(kol)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-900">{kol.name}</span>
                              {kol.followers != null && (
                                <span className="text-xs text-gray-400 shrink-0">
                                  {kol.followers.toLocaleString("ko-KR")} 팔로워
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {kol.instagram_handle && (
                                <span className="text-xs text-gray-400">@{kol.instagram_handle}</span>
                              )}
                              {(kol.categories ?? []).slice(0, 3).map((c) => (
                                <span key={c} className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
                                  {c}
                                </span>
                              ))}
                            </div>
                            {/* CRM에 등록된 진행 조건 — 섭외 판단이 여기서 필요하다 */}
                            {(kol.fee_amount != null ||
                              kol.rs_rate != null ||
                              (kol.deliverables ?? []).length > 0) && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {formatCrmMoney(kol.fee_amount, kol.fee_currency) && (
                                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                    {formatCrmMoney(kol.fee_amount, kol.fee_currency)}
                                  </span>
                                )}
                                {kol.rs_rate != null && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                    RS {kol.rs_rate}%
                                  </span>
                                )}
                                {(kol.deliverables ?? []).slice(0, 3).map((d) => (
                                  <span
                                    key={d}
                                    className="text-[10px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded"
                                  >
                                    {d}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        ))
                      )}

                      {filteredInfluencers.length > 0 && (
                        <>
                          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase border-t border-gray-100">
                            이 시스템에 등록됨
                          </p>
                          {filteredInfluencers.map((inf) => (
                            <button
                              key={inf.id}
                              type="button"
                              onMouseDown={() => handleSelectInfluencer(inf)}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex flex-col"
                            >
                              <span className="font-medium text-gray-900">{inf.name}</span>
                              {inf.account_url && (
                                <span className="text-xs text-gray-400 truncate">{inf.account_url}</span>
                              )}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="label">이름 *</label>
                    <input
                      type="text"
                      name="new_influencer_name"
                      value={formData.new_influencer_name}
                      onChange={handleChange}
                      className="input"
                      placeholder="인플루언서 이름"
                    />
                  </div>
                  <div>
                    <label className="label">계정 URL</label>
                    <input
                      type="url"
                      name="new_influencer_account_url"
                      value={formData.new_influencer_account_url}
                      onChange={handleChange}
                      className="input"
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 링크 */}
          <div className="space-y-4">
            {/* UTM 빌더 */}
            {campaignPurchaseFormUrl && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700">
                  UTM 링크 빌더{" "}
                  <span className="font-normal text-blue-400">
                    — 캠페인 공통 구매 링크 기준
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="label text-xs">유입 채널</label>
                    <select
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      className="input text-sm"
                    >
                      <option value="instagram">Instagram</option>
                      <option value="youtube">YouTube</option>
                      <option value="tiktok">TikTok</option>
                      <option value="blog">Blog</option>
                      <option value="facebook">Facebook</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label text-xs">식별 코드 <span className="text-gray-400 font-normal">(인플루언서명 또는 코드)</span></label>
                    <input
                      type="text"
                      value={utmCode}
                      onChange={(e) => setUtmCode(e.target.value)}
                      className="input text-sm"
                      placeholder="예: beauty_jisoo"
                    />
                  </div>
                </div>
                {generatedUrl && (
                  <div className="bg-white rounded-lg p-2.5 border border-blue-200">
                    <p className="text-xs text-gray-500 mb-1.5">생성된 URL</p>
                    <p className="text-xs text-gray-700 break-all font-mono leading-relaxed">{generatedUrl}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={handleCopyUtm}
                        className="btn-secondary btn-sm text-xs"
                      >
                        {copied ? "복사됨 ✓" : "URL 복사"}
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyUtm}
                        className="btn-primary btn-sm text-xs"
                      >
                        구매링크에 적용
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label">개인 구매링크 <span className="text-gray-400 font-normal text-xs">(선택)</span></label>
              <input
                type="url"
                name="purchase_url"
                value={formData.purchase_url ?? ""}
                onChange={handleChange}
                className="input"
                placeholder="https://..."
              />
              <p className="text-xs text-gray-400 mt-1">
                {campaignPurchaseFormUrl
                  ? "비워두면 캠페인 공통 구매 링크가 적용됩니다."
                  : "이 KOL 전용 구매 링크 (캠페인 공통 링크가 없는 경우 필수)"}
              </p>
            </div>
          </div>

          {/* 발송 정보 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">상품 발송</h3>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_product_sent"
                name="is_product_sent"
                checked={formData.is_product_sent}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_product_sent" className="text-sm text-gray-700">
                상품 발송 완료
              </label>
            </div>
            {formData.is_product_sent && (
              <div>
                <label className="label">발송일</label>
                <input
                  type="date"
                  name="sent_date"
                  value={formData.sent_date}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            )}
          </div>

          {/* 콘텐츠 업로드 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">
              콘텐츠 업로드{" "}
              <span className="text-xs font-normal text-gray-400">
                — 릴스·스토리·쓰레드 등 여러 개 등록 가능
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_uploaded"
                name="is_uploaded"
                checked={formData.is_uploaded}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_uploaded" className="text-sm text-gray-700">
                콘텐츠 업로드 완료
              </label>
            </div>

            {/* 콘텐츠 목록 편집 */}
            <div className="space-y-2">
              {contents.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={c.type}
                    onChange={(e) =>
                      setContents((prev) =>
                        prev.map((item, idx) =>
                          idx === i
                            ? { ...item, type: e.target.value as ContentType }
                            : item
                        )
                      )
                    }
                    className="input text-sm w-28 shrink-0"
                  >
                    {CONTENT_TYPE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="url"
                    value={c.url}
                    onChange={(e) =>
                      setContents((prev) =>
                        prev.map((item, idx) =>
                          idx === i ? { ...item, url: e.target.value } : item
                        )
                      )
                    }
                    className="input text-sm flex-1"
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setContents((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    title="삭제"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setContents((prev) => [...prev, { type: "reels", url: "" }]);
                  // 첫 콘텐츠 추가 시 업로드 완료 자동 체크
                  if (contents.length === 0 && !formData.is_uploaded) {
                    setFormData((prev) => ({ ...prev, is_uploaded: true }));
                  }
                }}
                className="btn-secondary btn-sm"
              >
                + 콘텐츠 추가
              </button>
            </div>
          </div>

          {/* 판매 및 정산 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">판매 및 정산</h3>
              {campaignExchangeRate ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400">입력 통화</span>
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px]">
                    {(["krw", "twd"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => switchAmountCurrency(c)}
                        className={`px-2.5 py-1 font-medium transition-colors ${
                          amountCurrency === c
                            ? "bg-primary-600 text-white"
                            : "bg-white text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {c === "krw" ? "원" : "NT$"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {campaignInfluencerRsRate !== undefined && campaignInfluencerRsRate > 0 && (
              <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md">
                캠페인 RS율 {campaignInfluencerRsRate}% 적용 — 판매액 입력 시 정산금액 자동계산
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">
                  판매금액 ({amountCurrency === "twd" ? "NT$" : "원"})
                </label>
                <input
                  type="number"
                  name="sales_amount"
                  value={formData.sales_amount}
                  onChange={handleChange}
                  className="input"
                  min="0"
                  step="1"
                />
                {(() => {
                  if (amountCurrency === "twd") {
                    const krw = toKrw(formData.sales_amount);
                    return krw > 0 ? (
                      <p className="text-xs text-gray-400 mt-1">= {formatWon(krw)}</p>
                    ) : null;
                  }
                  const t = krwToTwd(
                    parseFloat(formData.sales_amount) || 0,
                    campaignExchangeRate
                  );
                  return t !== null && t > 0 ? (
                    <p className="text-xs text-gray-400 mt-1">= {formatTwd(t)}</p>
                  ) : null;
                })()}
              </div>
              <div>
                <label className="label">판매수량 (개)</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  className="input"
                  min="0"
                  step="1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  클라이언트 마진 계산에 사용
                </p>
              </div>
              <div>
                <label className="label flex items-center gap-2">
                  정산금액 ({amountCurrency === "twd" ? "NT$" : "원"})
                  {isAutoCalc && (
                    <span className="text-xs font-normal bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      자동계산됨
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  name="settlement_amount"
                  value={formData.settlement_amount}
                  onChange={handleChange}
                  className="input"
                  min="0"
                  step="1"
                />
                {(() => {
                  if (amountCurrency === "twd") {
                    const krw = toKrw(formData.settlement_amount);
                    return krw > 0 ? (
                      <p className="text-xs text-gray-400 mt-1">= {formatWon(krw)}</p>
                    ) : null;
                  }
                  const t = krwToTwd(
                    parseFloat(formData.settlement_amount) || 0,
                    campaignExchangeRate
                  );
                  return t !== null && t > 0 ? (
                    <p className="text-xs text-gray-400 mt-1">= {formatTwd(t)}</p>
                  ) : null;
                })()}
              </div>
            </div>
            <div>
              <label className="label">정산 방법</label>
              <input
                type="text"
                name="settlement_method"
                value={formData.settlement_method}
                onChange={handleChange}
                className="input"
                placeholder="예: 계좌이체, 해외송금 (SWIFT), PayPal"
                list="settlement-method-suggestions"
              />
              <datalist id="settlement-method-suggestions">
                {SETTLEMENT_METHOD_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            {/* 정산 계좌 정보 — 이 모달에서 직접 편집 (influencers 마스터에 저장) */}
            {(() => {
              const bankInf = record?.influencer ?? selectedInfluencer;
              if (!bankInf && !selectedCrmKol) return null;
              const openBankEdit = () => {
                setBankForm({
                  bank_account_holder: bankInf?.bank_account_holder ?? "",
                  bank_name: bankInf?.bank_name ?? "",
                  bank_account_number: bankInf?.bank_account_number ?? "",
                  bank_account_type: bankInf?.bank_account_type ?? "",
                  bank_swift_code: bankInf?.bank_swift_code ?? "",
                  bank_email: bankInf?.bank_email ?? "",
                  bank_address: bankInf?.bank_address ?? "",
                });
                setBankEditOpen(true);
              };
              if (bankEditOpen) {
                const bankField = (
                  key: keyof typeof bankForm,
                  label: string,
                  span2 = false
                ) => (
                  <div className={span2 ? "col-span-2" : ""}>
                    <label className="label text-xs">{label}</label>
                    <input
                      type="text"
                      value={bankForm[key]}
                      onChange={(e) =>
                        setBankForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="input text-sm"
                    />
                  </div>
                );
                return (
                  <div className="bg-white rounded-lg border border-primary-200 p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">
                      정산 계좌 정보 편집 — 저장 시 함께 반영됩니다
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {bankField("bank_account_holder", "예금주")}
                      {bankField("bank_name", "은행명")}
                      {bankField("bank_account_number", "계좌번호")}
                      {bankField("bank_account_type", "계좌 유형")}
                      {bankField("bank_swift_code", "SWIFT/BIC")}
                      {bankField("bank_email", "이메일")}
                      {bankField("bank_address", "주소", true)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setBankEditOpen(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 mt-2"
                    >
                      편집 취소
                    </button>
                  </div>
                );
              }
              return bankInf && hasBankDetails(bankInf) ? (
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600">
                      정산 계좌 정보 (Bank Account Details)
                    </p>
                    <button
                      type="button"
                      onClick={openBankEdit}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      수정
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-gray-400">예금주</span>{" "}
                      <span className="text-gray-900 font-medium">{bankInf.bank_account_holder}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">은행</span>{" "}
                      <span className="text-gray-900 font-medium">{bankInf.bank_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">계좌번호</span>{" "}
                      <span className="text-gray-900 font-medium">{bankInf.bank_account_number}</span>
                    </div>
                    {bankInf.bank_account_type && (
                      <div>
                        <span className="text-gray-400">계좌 유형</span>{" "}
                        <span className="text-gray-900">{bankInf.bank_account_type}</span>
                      </div>
                    )}
                    {bankInf.bank_swift_code && (
                      <div>
                        <span className="text-gray-400">SWIFT/BIC</span>{" "}
                        <span className="text-gray-900">{bankInf.bank_swift_code}</span>
                      </div>
                    )}
                    {bankInf.bank_email && (
                      <div>
                        <span className="text-gray-400">이메일</span>{" "}
                        <span className="text-gray-900">{bankInf.bank_email}</span>
                      </div>
                    )}
                    {bankInf.bank_address && (
                      <div className="col-span-2">
                        <span className="text-gray-400">주소</span>{" "}
                        <span className="text-gray-900">{bankInf.bank_address}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-xs text-orange-700 flex items-center justify-between gap-2">
                  <span>⚠ 정산 계좌 정보가 미등록 상태입니다.</span>
                  <button
                    type="button"
                    onClick={openBankEdit}
                    className="shrink-0 font-medium text-orange-700 underline hover:text-orange-800"
                  >
                    지금 입력
                  </button>
                </div>
              );
            })()}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_settled"
                name="is_settled"
                checked={formData.is_settled}
                onChange={handleChange}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="is_settled" className="text-sm text-gray-700">
                정산 완료
              </label>
            </div>
            {formData.is_settled && (
              <div>
                <label className="label">정산일</label>
                <input
                  type="date"
                  name="settled_date"
                  value={formData.settled_date}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            )}
          </div>

          {/* 메모 */}
          <div>
            <label className="label">메모</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="input resize-none"
              rows={3}
              placeholder="특이사항 또는 메모"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              취소
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  저장 중...
                </>
              ) : record ? (
                "수정 완료"
              ) : (
                "인플루언서 추가"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
