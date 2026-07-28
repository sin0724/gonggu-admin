"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ProspectPicker, {
  PickedProspect,
} from "@/components/campaigns/prospect-picker";
import { Campaign, CampaignInsert, PriceTier } from "@/types/database";
import { krwToTwd, formatTwd } from "@/lib/utils";
import {
  CAMPAIGN_STAGES,
  CampaignStage,
  resolveStage,
  STAGE_DESCRIPTION,
  STAGE_LABEL,
} from "@/lib/campaign-stage";
import { useToast } from "@/components/ui/toast";
import {
  computeUnitEconomics,
  judgeFeasibility,
  recommendGongguPrice,
  recommendSellerQuote,
  minPriceForVendorTarget,
  distributeSales,
  buildTierMarginRows,
  supplyNetCost,
  FEASIBILITY,
  FEASIBILITY_LABEL,
  Feasibility,
  DealType,
  SupplyVatMode,
} from "@/lib/economics";

interface CampaignFormProps {
  campaign?: Campaign;
  mode: "create" | "edit";
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={ok ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
        {ok ? "✓" : "✗"}
      </span>
      <span className={ok ? "text-gray-700" : "text-gray-400"}>{label}</span>
    </div>
  );
}

const fmt = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
const fmtRate = (n: number) => n.toFixed(1);

/** 구간 입력 필드 (문자열 상태 — 저장 시 숫자·KRW로 변환) */
interface TierField {
  min_qty: string;
  price: string;
}

const tiersToFields = (tiers: PriceTier[] | null | undefined): TierField[] =>
  (tiers ?? []).map((t) => ({
    min_qty: t.min_qty.toString(),
    price: t.price.toString(),
  }));

/** 수량 구간별 단가 편집기 — "N세트 이상 → 개당 단가" 행을 추가/삭제 */
function TierEditor({
  title,
  accent,
  fields,
  onChange,
  unitLabel,
  placeholder,
}: {
  title: string;
  accent: "amber" | "teal";
  fields: TierField[];
  onChange: (next: TierField[]) => void;
  unitLabel: string;
  placeholder: { qty: string; price: string };
}) {
  const c =
    accent === "amber"
      ? {
          box: "bg-amber-50 border-amber-200",
          title: "text-amber-700",
          btn: "text-amber-700 border-amber-300 hover:bg-amber-100",
        }
      : {
          box: "bg-teal-50 border-teal-200",
          title: "text-teal-700",
          btn: "text-teal-700 border-teal-300 hover:bg-teal-100",
        };
  const update = (i: number, key: keyof TierField, value: string) => {
    const next = fields.map((f, idx) => (idx === i ? { ...f, [key]: value } : f));
    onChange(next);
  };
  return (
    <div className={`rounded-xl border p-4 ${c.box}`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-semibold ${c.title}`}>{title}</p>
        <button
          type="button"
          onClick={() => onChange([...fields, { min_qty: "", price: "" }])}
          className={`text-xs font-medium border rounded-lg px-2 py-1 bg-white ${c.btn}`}
        >
          + 구간 추가
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-gray-400">
          구간이 없으면 기본 단가 하나로 계산합니다.
        </p>
      ) : (
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-sm">
              <input
                type="number"
                value={f.min_qty}
                onChange={(e) => update(i, "min_qty", e.target.value)}
                className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder={placeholder.qty}
                min="1"
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">
                세트 이상 →
              </span>
              <input
                type="number"
                value={f.price}
                onChange={(e) => update(i, "price", e.target.value)}
                className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder={placeholder.price}
                min="0"
              />
              <span className="text-xs text-gray-500">{unitLabel}</span>
              <button
                type="button"
                onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
                className="ml-auto text-xs text-red-500 hover:text-red-600 px-1.5 py-1"
                aria-label="구간 삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 가격 입력 아래 천단위 콤마 + TWD 환산 확인용 캡션 (TWD 메인 · 원화 보조) */
function PriceCaption({
  value,
  rate,
  suffix,
}: {
  value: number;
  rate: number | null;
  suffix?: string;
}) {
  if (!(value > 0)) return null;
  const twd = krwToTwd(value, rate);
  return (
    <p className="text-xs text-gray-400 mt-1">
      = {twd !== null ? `${formatTwd(twd)} · ` : ""}
      {fmt(value)}원{suffix ? ` ${suffix}` : ""}
    </p>
  );
}

export default function CampaignForm({ campaign, mode }: CampaignFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetMargin, setTargetMargin] = useState(2000);
  const [targetMarginUnit, setTargetMarginUnit] = useState<"won" | "pct">("won");
  const [vendorFeeAuto, setVendorFeeAuto] = useState(false);
  const [dealType, setDealType] = useState<DealType>(
    campaign?.deal_type === "supply" ? "supply" : "rs"
  );
  // 공급가 과세 구분 — 기본 부가세 포함, 브랜드가 구매확인서로 영세 공급 시 0%
  const [supplyVatMode, setSupplyVatMode] = useState<SupplyVatMode>(
    campaign?.supply_vat_mode === "zero" ? "zero" : "taxed"
  );
  // 수량 구간별 단가 — 공급가(브랜드) / 셀러 견적가 (예: 200세트↑ 20,500 / 500세트↑ 18,500)
  const [supplyTierFields, setSupplyTierFields] = useState<TierField[]>(
    tiersToFields(campaign?.supply_price_tiers)
  );
  const [quoteTierFields, setQuoteTierFields] = useState<TierField[]>(
    tiersToFields(campaign?.seller_quote_tiers)
  );
  // 가격 입력 통화. 광고주가 TWD로 단가를 주는 경우 NT$로 바로 입력 (저장은 항상 KRW).
  const [priceCurrency, setPriceCurrency] = useState<"krw" | "twd">("krw");
  // 목표 판매액 입력 통화 — 가격 통화와 독립. 기본 원화.
  const [targetCurrency, setTargetCurrency] = useState<"krw" | "twd">("krw");

  // 가망건 연결 — 가망건 관리에서 넘어온 업체가 캠페인이 되는 경우가 많아
  // 출처를 남긴다. 직접 등록한 캠페인은 null.
  const [prospectId, setProspectId] = useState<string | null>(
    campaign?.prospect_id ?? null
  );
  const [prospectLabel, setProspectLabel] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [formData, setFormData] = useState({
    client_name: campaign?.client_name ?? "",
    campaign_name: campaign?.campaign_name ?? "",
    // 신규는 가망에서 시작, 기존은 저장된 단계(없으면 날짜로 추론).
    // handleChange가 모든 필드를 문자열로 넣으므로 여기서도 string으로 둔다.
    status: (campaign ? resolveStage(campaign) : "lead") as string,
    normal_price: campaign?.normal_price?.toString() ?? "",
    online_min_price: campaign?.online_min_price?.toString() ?? "",
    supply_price: campaign?.supply_price?.toString() ?? "",
    seller_quote_price: campaign?.seller_quote_price?.toString() ?? "",
    gonggu_price: campaign?.gonggu_price?.toString() ?? "",
    exchange_rate: campaign?.exchange_rate?.toString() ?? "",
    target_sales: campaign?.target_sales?.toString() ?? "",
    total_rs_rate: campaign?.total_rs_rate?.toString() ?? "",
    influencer_rs_rate: campaign?.influencer_rs_rate?.toString() ?? "",
    vendor_fee_rate: campaign?.vendor_fee_rate?.toString() ?? "",
    shipping_payer: campaign?.shipping_payer ?? "buyer",
    shipping_fee: campaign?.shipping_fee?.toString() ?? "",
    start_date: campaign?.start_date ?? "",
    end_date: campaign?.end_date ?? "",
    purchase_form_url: campaign?.purchase_form_url ?? "",
    drive_url: campaign?.drive_url ?? "",
  });

  // 가망건 목록의 "캠페인 등록"에서 넘어오면 ?prospect=<id>로 들어온다.
  // 수정 화면에서는 이미 연결된 가망건의 이름을 보여주기 위해 읽는다.
  const prospectParam = searchParams.get("prospect");
  useEffect(() => {
    const id = mode === "create" ? prospectParam : campaign?.prospect_id;
    if (!id) return;

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("prospects")
        .select("id, company_name")
        .eq("id", id)
        .maybeSingle();
      if (cancelled || !data) return;

      setProspectId(data.id);
      setProspectLabel(data.company_name);
      // 신규 등록일 때만 클라이언트명을 채운다 (수정 중인 값을 덮어쓰지 않도록)
      if (mode === "create") {
        setFormData((prev) =>
          prev.client_name ? prev : { ...prev, client_name: data.company_name }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prospectParam, campaign?.prospect_id, mode]);

  const handlePickProspect = (p: PickedProspect) => {
    setProspectId(p.id);
    setProspectLabel(p.company_name);
    setFormData((prev) => ({ ...prev, client_name: p.company_name }));
    setPickerOpen(false);
  };

  const clearProspect = () => {
    setProspectId(null);
    setProspectLabel(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    // 총 RS 한도 또는 KOL RS 변경 시 벤더 수수료 = 잔여분 자동 계산
    if (name === "total_rs_rate" || name === "influencer_rs_rate") {
      const next = { ...formData, [name]: value };
      const total = parseFloat(next.total_rs_rate);
      const kol = parseFloat(next.influencer_rs_rate) || 0;
      if (!isNaN(total) && total > 0) {
        const remainder = Math.max(0, Math.round((total - kol) * 10) / 10);
        next.vendor_fee_rate = remainder.toString();
        setVendorFeeAuto(true);
      }
      setFormData(next);
      return;
    }

    if (name === "vendor_fee_rate") {
      setVendorFeeAuto(false);
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ── 자동 계산 (lib/economics 단일 모델) ─────────────────────
  const exchangeRate = parseFloat(formData.exchange_rate) || 0;
  const rate = exchangeRate > 0 ? exchangeRate : null;
  // 입력 통화 → KRW (계산·저장은 항상 KRW 기준). KRW → 입력 통화는 그 역.
  const toKrw = (n: number) =>
    priceCurrency === "twd" && rate !== null ? n * rate : n;
  const fromKrw = (n: number) =>
    priceCurrency === "twd" && rate !== null ? n / rate : n;
  // 단위 라벨 / 계산된 가격을 입력칸 문자열로 (TWD는 소수 1자리, KRW는 정수)
  const unitLabel = priceCurrency === "twd" ? "NT$" : "원";
  const priceToField = (krw: number) => {
    const v = fromKrw(krw);
    return priceCurrency === "twd"
      ? (Math.round(v * 10) / 10).toString()
      : Math.round(v).toString();
  };

  // 입력 통화 전환 — 기존에 입력된 가격값을 새 통화로 환산해 표기를 유지.
  const handlePriceCurrency = (cur: "krw" | "twd") => {
    if (cur === priceCurrency) return;
    if (cur === "twd" && rate === null) return; // 환율이 있어야 TWD 입력 가능
    if (rate !== null) {
      const conv = (s: string) => {
        const v = parseFloat(s);
        if (!s || isNaN(v)) return s;
        return cur === "twd"
          ? (Math.round((v / rate) * 10) / 10).toString()
          : Math.round(v * rate).toString();
      };
      setFormData((prev) => ({
        ...prev,
        normal_price: conv(prev.normal_price),
        online_min_price: conv(prev.online_min_price),
        supply_price: conv(prev.supply_price),
        seller_quote_price: conv(prev.seller_quote_price),
        gonggu_price: conv(prev.gonggu_price),
      }));
      // 구간 단가도 함께 환산
      const convTiers = (fields: TierField[]) =>
        fields.map((f) => ({ ...f, price: conv(f.price) }));
      setSupplyTierFields(convTiers);
      setQuoteTierFields(convTiers);
    }
    setPriceCurrency(cur);
  };

  // 목표 판매액 통화 전환 — 입력값을 새 통화로 환산해 유지.
  const handleTargetCurrency = (cur: "krw" | "twd") => {
    if (cur === targetCurrency) return;
    if (cur === "twd" && rate === null) return;
    if (rate !== null) {
      setFormData((prev) => {
        const v = parseFloat(prev.target_sales);
        if (!prev.target_sales || isNaN(v)) return prev;
        return {
          ...prev,
          target_sales:
            cur === "twd"
              ? (Math.round((v / rate) * 10) / 10).toString()
              : Math.round(v * rate).toString(),
        };
      });
    }
    setTargetCurrency(cur);
  };

  // 환율을 지우면 TWD 입력을 유지할 수 없으므로 원화 입력으로 되돌림.
  useEffect(() => {
    if (rate === null && priceCurrency === "twd") setPriceCurrency("krw");
    if (rate === null && targetCurrency === "twd") setTargetCurrency("krw");
  }, [rate, priceCurrency, targetCurrency]);

  const normalPrice = toKrw(parseFloat(formData.normal_price) || 0);
  const onlineMinPrice = toKrw(parseFloat(formData.online_min_price) || 0);
  const supplyPrice = toKrw(parseFloat(formData.supply_price) || 0);
  const sellerQuotePrice = toKrw(parseFloat(formData.seller_quote_price) || 0);
  const gongguPrice = toKrw(parseFloat(formData.gonggu_price) || 0);
  // 헤드라인 금액 — TWD 메인 · 원화 보조 ("NT$690 · 30,000원"), 환율 없으면 원화만
  const moneyText = (n: number) => {
    const t = krwToTwd(n, rate);
    return t !== null ? `${formatTwd(t)} · ${fmt(n)}원` : `${fmt(n)}원`;
  };
  const totalRsRate = parseFloat(formData.total_rs_rate) || 0;
  const influencerRsRate = parseFloat(formData.influencer_rs_rate) || 0;
  const vendorFeeRate = parseFloat(formData.vendor_fee_rate) || 0;
  const isSellerShipping = formData.shipping_payer === "seller";

  // 구간 단가 (입력 통화 → KRW, 유효한 행만)
  const fieldsToTiers = (fields: TierField[]): PriceTier[] =>
    fields
      .map((f) => ({
        min_qty: parseInt(f.min_qty, 10) || 0,
        price: Math.round(toKrw(parseFloat(f.price) || 0)),
      }))
      .filter((t) => t.min_qty > 0 && t.price > 0)
      .sort((a, b) => a.min_qty - b.min_qty);
  const supplyTiers = fieldsToTiers(supplyTierFields);
  const quoteTiers = fieldsToTiers(quoteTierFields);

  const econInput = {
    dealType,
    gongguPrice,
    supplyPrice,
    sellerQuotePrice,
    supplyVatMode,
    influencerRsRate,
    vendorFeeRate,
    totalRsRate: totalRsRate > 0 ? totalRsRate : null,
    normalPrice,
    onlineMinPrice,
  };
  const econ = computeUnitEconomics(econInput);

  // [공급가형] 구간별 마진 미리보기 (구간이 하나라도 있을 때)
  const tierRows =
    dealType === "supply" && (supplyTiers.length > 0 || quoteTiers.length > 0)
      ? buildTierMarginRows({
          supplyPrice,
          supplyTiers,
          supplyVatMode,
          quotePrice: sellerQuotePrice,
          quoteTiers,
          gongguPrice,
          kolRsRatePct: influencerRsRate,
        })
      : [];

  // 목표 KPI — 목표 판매액(자체 통화 → KRW)을 돈 흐름 모델대로 분배
  const targetUnitLabel = targetCurrency === "twd" ? "NT$" : "원";
  const targetSales =
    targetCurrency === "twd" && rate !== null
      ? (parseFloat(formData.target_sales) || 0) * rate
      : parseFloat(formData.target_sales) || 0;
  const targetDist =
    targetSales > 0
      ? distributeSales({
          dealType,
          sales: targetSales,
          gongguPrice,
          supplyPrice,
          sellerQuotePrice,
          supplyVatMode,
          influencerRsRate,
          vendorFeeRate,
          totalRsRate: totalRsRate > 0 ? totalRsRate : null,
        })
      : null;

  // [공급가형] 추천 공구가 (벤더 목표 마진 기준)
  const rec =
    dealType === "supply" && supplyPrice > 0
      ? recommendGongguPrice({
          supplyPrice,
          supplyVatMode,
          kolRsRatePct: influencerRsRate,
          targetVendorMargin: targetMargin,
          targetUnit: targetMarginUnit,
        })
      : null;
  const recommendedPrice = rec?.rounded ?? 0;
  const recommendedExceedsOnlineMin =
    rec !== null && onlineMinPrice > 0 && recommendedPrice >= onlineMinPrice;

  // [공급가형] 추천 셀러 견적가 (벤더 목표 마진 기준)
  const recQuote =
    dealType === "supply" && supplyPrice > 0 && gongguPrice > 0
      ? recommendSellerQuote({
          supplyPrice,
          supplyVatMode,
          gongguPrice,
          kolRsRatePct: influencerRsRate,
          targetVendorMargin: targetMargin,
          targetUnit: targetMarginUnit,
        })
      : null;

  // [공급가형] 수용 가능 최대 공급가 (클라이언트 협상용)
  // 우리 매출/개 = 견적가 (미입력 시 공구가 직접 판매).
  // 실질 원가 한도를 먼저 구하고, 부가세 포함 매입이면 ×1.1로 표시가 환산.
  const revenueBase = sellerQuotePrice > 0 ? sellerQuotePrice : gongguPrice;
  const maxSupplyNet =
    revenueBase > 0 && gongguPrice > 0
      ? targetMarginUnit === "won"
        ? revenueBase - gongguPrice * (influencerRsRate / 100) - targetMargin
        : revenueBase -
          gongguPrice * ((influencerRsRate + targetMargin) / 100)
      : 0;
  const maxSupplyPrice =
    supplyVatMode === "taxed" ? maxSupplyNet * 1.1 : maxSupplyNet;

  // [RS형] 목표 마진(원/건) 달성 최소 공구가 — 마진율은 벤더%로 고정이므로 원 기준만 의미 있음
  const rsMinPrice =
    dealType === "rs"
      ? minPriceForVendorTarget({
          targetVendorMarginWon: targetMargin,
          vendorFeeRatePct: vendorFeeRate,
        })
      : null;

  // 최종 판정
  const showAnalysis = gongguPrice > 0;
  const canJudge =
    gongguPrice > 0 &&
    (dealType === "supply" ? supplyPrice > 0 || vendorFeeRate > 0 : vendorFeeRate > 0);
  const feasibility: Feasibility = canJudge
    ? judgeFeasibility(econ)
    : "possible";

  const feasibilityConfig: Record<
    Feasibility,
    { bg: string; border: string; text: string; icon: string }
  > = {
    possible: { bg: "bg-green-50", border: "border-green-300", text: "text-green-700", icon: "✓" },
    conditional: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-700", icon: "△" },
    not_recommended: { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", icon: "✗" },
  };

  // ── 저장 ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const payload: CampaignInsert = {
        client_name: formData.client_name,
        campaign_name: formData.campaign_name,
        deal_type: dealType,
        // 입력 단위가 NT$여도 저장은 항상 KRW (normalPrice 등은 이미 KRW로 환산된 값)
        normal_price: formData.normal_price ? Math.round(normalPrice) : null,
        online_min_price: formData.online_min_price ? Math.round(onlineMinPrice) : null,
        // RS형은 공급가가 파생값이므로 저장하지 않음
        supply_price:
          dealType === "supply" && formData.supply_price
            ? Math.round(supplyPrice)
            : null,
        // 공급가형: 대만 총판/셀러 견적 단가 (마진 계산 기준)
        seller_quote_price:
          dealType === "supply" && formData.seller_quote_price
            ? Math.round(sellerQuotePrice)
            : null,
        // 수량 구간별 단가 (KRW로 환산 저장)
        supply_price_tiers: dealType === "supply" ? supplyTiers : [],
        seller_quote_tiers: dealType === "supply" ? quoteTiers : [],
        // 공급가 과세 구분 (taxed = 부가세 포함, zero = 영세율 구매확인서)
        supply_vat_mode: dealType === "supply" ? supplyVatMode : "taxed",
        gonggu_price: formData.gonggu_price ? Math.round(gongguPrice) : null,
        exchange_rate: formData.exchange_rate ? parseFloat(formData.exchange_rate) : null,
        target_sales: formData.target_sales ? Math.round(targetSales) : null,
        total_rs_rate: formData.total_rs_rate ? parseFloat(formData.total_rs_rate) : null,
        vendor_fee_rate: formData.vendor_fee_rate ? parseFloat(formData.vendor_fee_rate) : null,
        influencer_rs_rate: formData.influencer_rs_rate ? parseFloat(formData.influencer_rs_rate) : null,
        shipping_fee: formData.shipping_fee ? parseFloat(formData.shipping_fee) : null,
        shipping_payer: formData.shipping_payer || null,
        // 모든 가격은 부가세 포함으로 통일 — VAT 별도 옵션 폐기
        vat_included: true,
        status: formData.status as CampaignStage,
        prospect_id: prospectId,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        purchase_form_url: formData.purchase_form_url || null,
        // 응답 시트는 더 이상 사용하지 않음 — 기존 값만 보존
        response_sheet_url: campaign?.response_sheet_url ?? null,
        drive_url: formData.drive_url || null,
      };

      if (mode === "create") {
        const { data, error } = await supabase
          .from("campaigns")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        router.push(`/campaigns/${data.id}`);
      } else if (campaign) {
        const { error } = await supabase
          .from("campaigns")
          .update(payload)
          .eq("id", campaign.id);

        if (error) throw error;

        const newRsRate = payload.influencer_rs_rate ?? 0;
        const oldRsRate = campaign.influencer_rs_rate ?? 0;
        if (newRsRate !== oldRsRate && newRsRate > 0) {
          const { data: unsettled } = await supabase
            .from("campaign_influencers")
            .select("id, sales_amount")
            .eq("campaign_id", campaign.id)
            .eq("is_settled", false)
            .gt("sales_amount", 0);

          if (unsettled && unsettled.length > 0) {
            const results = await Promise.all(
              unsettled.map((ci) =>
                supabase
                  .from("campaign_influencers")
                  .update({
                    settlement_amount: Math.round(
                      (ci.sales_amount ?? 0) * (newRsRate / 100)
                    ),
                  })
                  .eq("id", ci.id)
              )
            );
            const failed = results.filter((r) => r.error).length;
            if (failed > 0) {
              toast.error(
                `RS율 변경에 따른 정산금액 재계산 중 ${failed}건이 실패했습니다. 해당 인플루언서의 정산금액을 직접 확인해주세요.`
              );
            }
          }
        }

        // 가격 조건이 바뀌면 이미 입금 처리된 셀러의 재무 실적을 현재 조건으로 재기록.
        // (공급가·과세 구분·구간·견적가·공구가 → 마진이 달라짐)
        const pricingChanged =
          payload.supply_price !== campaign.supply_price ||
          payload.supply_vat_mode !== (campaign.supply_vat_mode ?? "taxed") ||
          payload.seller_quote_price !== campaign.seller_quote_price ||
          payload.gonggu_price !== campaign.gonggu_price ||
          JSON.stringify(payload.supply_price_tiers ?? []) !==
            JSON.stringify(campaign.supply_price_tiers ?? []) ||
          JSON.stringify(payload.seller_quote_tiers ?? []) !==
            JSON.stringify(campaign.seller_quote_tiers ?? []);

        if (pricingChanged) {
          try {
            const res = await fetch("/api/campaign-resync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ campaignId: campaign.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error);
            if (json.warning) toast.info(json.warning);
          } catch {
            toast.error(
              "가격 조건은 저장되었으나 입금 완료된 셀러의 재무 실적 재반영에 실패했습니다. 셀러 관리에서 입금 체크를 다시 눌러 동기화해주세요."
            );
          }
        }

        router.push(`/campaigns/${campaign.id}`);
      }

      toast.success(
        mode === "create" ? "캠페인이 등록되었습니다." : "캠페인이 수정되었습니다."
      );
      router.refresh();
    } catch {
      setError("저장 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const f = feasibilityConfig[feasibility];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 기본 정보 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">기본 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">
                클라이언트명 <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
              >
                거래처에서 불러오기
              </button>
            </div>
            <input
              type="text"
              name="client_name"
              value={formData.client_name}
              onChange={handleChange}
              className="input"
              placeholder="예: (주)브랜드명"
              required
            />
            {prospectId && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                <span className="badge bg-indigo-50 text-indigo-700">가망건 연결</span>
                <span className="truncate">{prospectLabel ?? "불러오는 중..."}</span>
                <button
                  type="button"
                  onClick={clearProspect}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                  title="연결 해제"
                >
                  ✕
                </button>
              </p>
            )}
          </div>
          <div>
            <label className="label">
              캠페인명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="campaign_name"
              value={formData.campaign_name}
              onChange={handleChange}
              className="input"
              placeholder="예: 2024 봄 공구 캠페인"
              required
            />
          </div>
        </div>
      </div>

      {/* 가격 · RS 구조 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          가격 · RS 구조
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          {dealType === "rs"
            ? "공구가 × 총 RS% = 가용 재원. 그 재원을 KOL과 벤더사가 나누고, 클라이언트 몫은 공구가 × (1 − 총 RS%)로 자동 계산됩니다."
            : "브랜드가 준 공급가에 마진을 붙여 대만 총판/셀러에게 견적가로 공급합니다. 견적가 − 공급가 − KOL RS = 벤더사(우리) 마진. 셀러 견적가 미입력 시 공구가에 직접 판매하는 것으로 계산합니다."}
        </p>

        {/* 환율 — 1 TWD 당 원화. 입력 시 모든 금액이 TWD 메인으로 표기됨 */}
        <div className="flex flex-wrap items-end gap-3 mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div>
            <label className="text-xs text-emerald-700 font-medium block mb-1">
              환율 (1 TWD = ___ 원)
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-emerald-700 font-medium">NT$1 =</span>
              <input
                type="number"
                name="exchange_rate"
                value={formData.exchange_rate}
                onChange={handleChange}
                className="w-28 px-3 py-2 text-sm border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="예: 43.5"
                min="0"
                step="0.01"
              />
              <span className="text-sm text-emerald-700 font-medium">원</span>
            </div>
          </div>
          <p className="text-xs text-emerald-600 leading-relaxed flex-1 min-w-[12rem]">
            {rate !== null && gongguPrice > 0
              ? `공구가 ${fmt(gongguPrice)}원 = ${formatTwd(krwToTwd(gongguPrice, rate)!)} · 클라이언트 제안서와 화면 금액이 TWD를 메인으로 표기됩니다 (원화는 보조).`
              : "환율을 입력하면 모든 금액이 대만달러(TWD)를 메인으로 표기됩니다. 미입력 시 원화로만 표기됩니다."}
          </p>
        </div>

        {/* 딜 방식 선택 */}
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={() => setDealType("rs")}
            className={`btn btn-sm ${dealType === "rs" ? "btn-primary" : "btn-secondary"}`}
          >
            RS형 — 총 RS%로 합의
          </button>
          <button
            type="button"
            onClick={() => setDealType("supply")}
            className={`btn btn-sm ${dealType === "supply" ? "btn-primary" : "btn-secondary"}`}
          >
            공급가형 — 공급가 + 마진 → 셀러 견적
          </button>
          <span className="text-xs text-gray-400 ml-1">
            {dealType === "rs"
              ? "대부분의 딜 · 공급가 입력 불필요"
              : "브랜드가 공급가를 주고 우리가 대만 총판/셀러에 공급하는 딜"}
          </span>
        </div>
        {mode === "edit" && (
          <p className="text-xs text-blue-500 mb-4">
            인플루언서 RS% 변경 시 미정산 인플루언서의 정산금액이 자동으로
            재계산됩니다.
          </p>
        )}

        {/* ── 기본 입력값 ── */}
        <div className="space-y-4 mb-6">
          {/* 가격 입력 통화 토글 — 광고주가 TWD로 단가를 주면 NT$로 바로 입력 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">가격 입력 단위</span>
            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              공구가·정상가·최저가 VAT 포함 · 셀러 견적가 영세율 0%
            </span>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => handlePriceCurrency("krw")}
                className={`px-3 py-1.5 text-xs font-medium ${
                  priceCurrency === "krw"
                    ? "bg-primary-600 text-white"
                    : "bg-white text-gray-600"
                }`}
              >
                원 (KRW)
              </button>
              <button
                type="button"
                onClick={() => handlePriceCurrency("twd")}
                disabled={rate === null}
                title={rate === null ? "환율을 먼저 입력하세요" : undefined}
                className={`px-3 py-1.5 text-xs font-medium ${
                  priceCurrency === "twd"
                    ? "bg-primary-600 text-white"
                    : "bg-white text-gray-600"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                NT$ (TWD)
              </button>
            </div>
            <span className="text-xs text-gray-400">
              {rate === null
                ? "환율 입력 시 NT$로도 가격을 입력할 수 있습니다."
                : priceCurrency === "twd"
                ? `NT$로 입력 → 저장은 원화로 환산 (환율 ${fmt(rate)}원/NT$)`
                : "원화로 입력 중"}
            </span>
          </div>

          {/* 가격 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">정상가 ({unitLabel} · VAT 포함)</label>
              <input
                type="number"
                name="normal_price"
                value={formData.normal_price}
                onChange={handleChange}
                className="input"
                placeholder="예: 50,000"
                min="0"
              />
              <PriceCaption value={normalPrice} rate={rate} suffix="· 소비자 정상 판매가" />
            </div>
            <div>
              <label className="label">온라인 최저가 ({unitLabel} · VAT 포함)</label>
              <input
                type="number"
                name="online_min_price"
                value={formData.online_min_price}
                onChange={handleChange}
                className="input"
                placeholder="예: 40,000"
                min="0"
              />
              <PriceCaption value={onlineMinPrice} rate={rate} suffix="· 공구가 상한선" />
            </div>
            {dealType === "supply" && (
              <div>
                <label className="label">
                  공급가 ({unitLabel} ·{" "}
                  {supplyVatMode === "taxed" ? "VAT 포함" : "영세율 0%"})
                </label>
                <input
                  type="number"
                  name="supply_price"
                  value={formData.supply_price}
                  onChange={handleChange}
                  className="input"
                  placeholder="예: 18,000"
                  min="0"
                />
                {/* 과세 구분 — 브랜드가 구매확인서로 영세 공급하는 경우 0% */}
                <div className="flex border border-gray-300 rounded-lg overflow-hidden mt-1.5 w-fit">
                  <button
                    type="button"
                    onClick={() => setSupplyVatMode("taxed")}
                    className={`px-2 py-1 text-[11px] font-medium ${
                      supplyVatMode === "taxed"
                        ? "bg-amber-500 text-white"
                        : "bg-white text-gray-500"
                    }`}
                  >
                    부가세 포함 10%
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupplyVatMode("zero")}
                    className={`px-2 py-1 text-[11px] font-medium ${
                      supplyVatMode === "zero"
                        ? "bg-amber-500 text-white"
                        : "bg-white text-gray-500"
                    }`}
                  >
                    영세율 0% (구매확인서)
                  </button>
                </div>
                <PriceCaption
                  value={supplyPrice}
                  rate={rate}
                  suffix="· 브랜드 정산 단가"
                />
                {supplyPrice > 0 && supplyVatMode === "taxed" && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    실질 원가 {fmt(supplyNetCost(supplyPrice, supplyVatMode))}원
                    (매입세액공제 반영) — 마진 계산 기준
                  </p>
                )}
              </div>
            )}
            {dealType === "supply" && (
              <div>
                <label className="label">셀러 견적가 ({unitLabel} · 영세율 0%)</label>
                <input
                  type="number"
                  name="seller_quote_price"
                  value={formData.seller_quote_price}
                  onChange={handleChange}
                  className="input"
                  placeholder="예: 21,000"
                  min="0"
                />
                {sellerQuotePrice > 0 ? (
                  <>
                    <PriceCaption
                      value={sellerQuotePrice}
                      rate={rate}
                      suffix="· 대만 총판/셀러 공급 단가 (우리 매출 · 수출 영세율)"
                    />
                    {supplyPrice > 0 &&
                      (() => {
                        const net = supplyNetCost(supplyPrice, supplyVatMode);
                        const m = sellerQuotePrice - net;
                        return (
                          <p
                            className={`text-xs mt-0.5 ${
                              m > 0 ? "text-blue-500" : "text-red-500"
                            }`}
                          >
                            실질 원가 대비 마진 {fmt(m)}원 (
                            {fmtRate((m / net) * 100)}%)
                          </p>
                        );
                      })()}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    미입력 시 공구가 직접 판매로 계산
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="label">공구가 ({unitLabel} · VAT 포함)</label>
              <input
                type="number"
                name="gonggu_price"
                value={formData.gonggu_price}
                onChange={handleChange}
                className="input"
                placeholder="예: 30,000"
                min="0"
              />
              {gongguPrice > 0 && (
                <p className="text-xs text-blue-500 mt-1">
                  = {rate !== null && `${formatTwd(krwToTwd(gongguPrice, rate)!)} · `}
                  {fmt(gongguPrice)}원
                  {onlineMinPrice > 0 &&
                    ` · 최저가 대비 ↓${fmtRate(econ.onlineMinDiscountRate)}%`}
                </p>
              )}
            </div>
          </div>

          {/* [공급가형] 수량 구간별 단가 — 브랜드/셀러 모두 세트 수량에 따라 단가가 다른 경우 */}
          {dealType === "supply" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TierEditor
                title={`공급가 수량 구간 — 브랜드 → 우리 (${unitLabel} · ${
                  supplyVatMode === "taxed" ? "VAT 포함" : "영세율 0%"
                })`}
                accent="amber"
                fields={supplyTierFields}
                onChange={setSupplyTierFields}
                unitLabel={unitLabel}
                placeholder={{ qty: "예: 500", price: "예: 14,000" }}
              />
              <TierEditor
                title={`셀러 견적가 수량 구간 — 우리 → 셀러 (${unitLabel} · 영세율 0%)`}
                accent="teal"
                fields={quoteTierFields}
                onChange={setQuoteTierFields}
                unitLabel={unitLabel}
                placeholder={{ qty: "예: 200", price: "예: 20,500" }}
              />
            </div>
          )}

          {/* [공급가형] 구간별 마진 미리보기 */}
          {tierRows.length > 0 && supplyPrice > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">
                  구간별 마진 미리보기 (1개당)
                </p>
                <p className="text-xs text-gray-400">
                  순마진 = 견적가(영세율) − 공급 실질 원가
                  {supplyVatMode === "taxed" && "(÷1.1)"} − KOL RS(공구가 ×{" "}
                  {influencerRsRate}%)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">수량 구간</th>
                      <th className="px-4 py-2 text-right font-medium">공급가</th>
                      <th className="px-4 py-2 text-right font-medium">셀러 견적가</th>
                      <th className="px-4 py-2 text-right font-medium">개당 마진</th>
                      <th className="px-4 py-2 text-right font-medium">개당 순마진 (−KOL)</th>
                      <th className="px-4 py-2 text-right font-medium">구간 수량 기준 총 순마진</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tierRows.map((row) => (
                      <tr key={row.minQty} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-700">
                          {row.minQty === 0
                            ? "기본 (구간 미달)"
                            : `${fmt(row.minQty)}세트 이상`}
                        </td>
                        <td className="px-4 py-2 text-right text-amber-700">
                          {moneyText(row.supplyPrice)}
                        </td>
                        <td className="px-4 py-2 text-right text-teal-700">
                          {moneyText(row.quotePrice)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-semibold ${
                            row.marginPerUnit > 0 ? "text-gray-900" : "text-red-600"
                          }`}
                        >
                          {moneyText(row.marginPerUnit)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-semibold ${
                            row.netMarginPerUnit >= 0 ? "text-blue-700" : "text-red-600"
                          }`}
                        >
                          {moneyText(row.netMarginPerUnit)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right ${
                            row.totalNetMargin >= 0 ? "text-gray-700" : "text-red-600"
                          }`}
                        >
                          {row.minQty === 0 ? "—" : moneyText(row.totalNetMargin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RS형: 클라이언트 몫 자동 표시 */}
          {dealType === "rs" &&
            econ.clientTakePerUnit !== null &&
            gongguPrice > 0 && (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-600">
                클라이언트 몫 (자동 계산) ={" "}
                <b className="text-gray-900">
                  개당 {moneyText(econ.clientTakePerUnit)}
                </b>
                <span className="text-xs text-gray-400">
                  공구가 {fmt(gongguPrice)}원 × (100 −{" "}
                  {fmtRate(econ.maxRsRate ?? 0)})%
                </span>
              </div>
            )}

          {/* RS 구조 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">클라이언트 승인 총 RS (%)</label>
              <input
                type="number"
                name="total_rs_rate"
                value={formData.total_rs_rate}
                onChange={handleChange}
                className="input"
                placeholder="예: 40"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">
                클라이언트가 허용한 RS 상한 (KOL + 벤더 합산)
              </p>
            </div>
            <div>
              <label className="label">인플루언서(KOL) RS (%)</label>
              <input
                type="number"
                name="influencer_rs_rate"
                value={formData.influencer_rs_rate}
                onChange={handleChange}
                className="input"
                placeholder="예: 30"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">
                KOL에게 제안하는 몫 · 통상 20~35%
              </p>
            </div>
            <div>
              <label className="label flex items-center gap-2">
                벤더사 마진 (%)
                {vendorFeeAuto && (
                  <span className="text-xs font-normal bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    자동 = 총 RS − KOL
                  </span>
                )}
              </label>
              <input
                type="number"
                name="vendor_fee_rate"
                value={formData.vendor_fee_rate}
                onChange={handleChange}
                className="input"
                placeholder="예: 10"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-gray-400 mt-1">
                {dealType === "supply" && supplyPrice > 0
                  ? sellerQuotePrice > 0
                    ? "실제 마진 = 견적가 − 공급가 − KOL RS 자동 계산"
                    : "공급가 입력 시 실제 마진은 잔여분으로 자동 계산"
                  : "우리 회사 몫 (클라이언트에게 비공개)"}
              </p>
            </div>
          </div>

          {/* 정합성 경고: 승인 총 RS vs 공급가 */}
          {econ.supplyRsConflict && econ.maxRsRate !== null && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <span className="text-red-500 text-base mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-semibold text-red-700">
                  공급가와 승인 총 RS가 모순됩니다
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  {sellerQuotePrice > 0
                    ? `견적가 ${fmt(sellerQuotePrice)}원 − 공급가 ${fmt(supplyPrice)}원 기준으로`
                    : `공급가 ${fmt(supplyPrice)}원 기준으로`}{" "}
                  실제 줄 수 있는 RS는 최대 <b>{fmtRate(econ.maxRsRate)}%</b>
                  인데, 승인 총 RS는 {fmtRate(totalRsRate)}%입니다. 공급가를
                  낮추거나 견적가·공구가를 올리거나 총 RS를 재확인해야 합니다.
                </p>
              </div>
            </div>
          )}

          {/* 정합성 경고: 견적가 vs 공급가 / 공구가 */}
          {econ.quoteBelowSupply && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <span className="text-red-500 text-base mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-semibold text-red-700">
                  셀러 견적가가 공급 실질 원가 이하입니다 — 역마진
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  견적가 {fmt(sellerQuotePrice)}원 ≤ 실질 원가{" "}
                  {fmt(supplyNetCost(supplyPrice, supplyVatMode))}원
                  {supplyVatMode === "taxed" && ` (공급가 ${fmt(supplyPrice)}원 ÷ 1.1)`}
                  . 견적가는 원가에 마진을 붙인 금액이어야 합니다.
                </p>
              </div>
            </div>
          )}
          {econ.quoteAboveGonggu && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
              <span className="text-orange-500 text-base mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-semibold text-orange-700">
                  셀러 견적가가 공구가보다 높습니다
                </p>
                <p className="text-xs text-orange-600 mt-0.5">
                  견적가 {fmt(sellerQuotePrice)}원 &gt; 공구가 {fmt(gongguPrice)}
                  원. 셀러가 소비자 판매가보다 비싸게 사입하게 되어 딜이
                  성립하지 않습니다.
                </p>
              </div>
            </div>
          )}

          {/* RS 한도 체크 */}
          {totalRsRate > 0 && (influencerRsRate > 0 || vendorFeeRate > 0) && (
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
                econ.rsBudgetOver
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-blue-50 border border-blue-100 text-blue-700"
              }`}
            >
              {econ.rsBudgetOver ? (
                <>
                  <span className="font-bold">⚠</span>
                  <span>
                    KOL {fmtRate(influencerRsRate)}% + 벤더{" "}
                    {fmtRate(vendorFeeRate)}% ={" "}
                    <b>{fmtRate(influencerRsRate + vendorFeeRate)}%</b> — 승인
                    한도 {fmtRate(totalRsRate)}%를 초과했습니다.
                  </span>
                </>
              ) : (
                <span>
                  총 RS {fmtRate(totalRsRate)}% 중 KOL{" "}
                  {fmtRate(influencerRsRate)}% + 벤더 {fmtRate(vendorFeeRate)}%
                  사용
                  {totalRsRate - influencerRsRate - vendorFeeRate > 0.05 && (
                    <>
                      {" "}· 잔여{" "}
                      <b>
                        {fmtRate(totalRsRate - influencerRsRate - vendorFeeRate)}%
                      </b>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          {/* 배송 · 부가세 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label">배송비 부담 주체</label>
              <select
                name="shipping_payer"
                value={formData.shipping_payer}
                onChange={handleChange}
                className="input"
              >
                <option value="buyer">구매자 부담</option>
                <option value="seller">판매자(클라이언트) 부담</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {isSellerShipping
                  ? "클라이언트 부담 — 우리 마진 계산에 미반영"
                  : "소비자 별도 부담"}
              </p>
            </div>
            <div>
              <label className="label">배송비 (원)</label>
              <input
                type="number"
                name="shipping_fee"
                value={formData.shipping_fee}
                onChange={handleChange}
                className="input"
                placeholder="예: 3,000"
                min="0"
              />
              <p className="text-xs text-gray-400 mt-1">조건 기록용</p>
            </div>
            <div className="col-span-2">
              <label className="label">부가세</label>
              <p className="text-sm text-gray-700 mt-2.5">
                정상가·최저가·공구가는 <b>부가세 포함</b>, 셀러 견적가(수출)는{" "}
                <b>영세율 0%</b>입니다.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                공급가는 과세 구분 선택 — 부가세 포함 매입이면 실질 원가(÷1.1)로
                마진을 계산하고, 브랜드가 구매확인서로 영세 공급하면 공급가
                그대로가 원가입니다.
              </p>
            </div>
          </div>
        </div>

        {/* ── 딜 계산기 ── */}
        {dealType === "rs" && vendorFeeRate > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 space-y-3">
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="text-xs text-blue-600 font-medium block mb-1">
                  벤더사 목표 마진 (원/건)
                </label>
                <input
                  type="number"
                  value={targetMargin}
                  onChange={(e) =>
                    setTargetMargin(parseFloat(e.target.value) || 0)
                  }
                  className="w-32 px-3 py-2 text-sm border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  min="0"
                  step={500}
                />
              </div>
              {rsMinPrice !== null && (
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    목표 달성 최소 공구가
                  </p>
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-bold text-blue-700">
                      {rate !== null
                        ? formatTwd(krwToTwd(rsMinPrice, rate)!)
                        : `${fmt(rsMinPrice)}원`}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          gonggu_price: priceToField(rsMinPrice),
                        }))
                      }
                      className="btn-secondary btn-sm mb-0.5"
                    >
                      적용
                    </button>
                  </div>
                  {rate !== null && (
                    <p className="text-xs text-blue-400 mt-0.5">{fmt(rsMinPrice)}원</p>
                  )}
                  <p className="text-xs text-blue-400 mt-0.5">
                    벤더 마진이 공구가 × {vendorFeeRate}%이므로, 1건당{" "}
                    {fmt(targetMargin)}원을 남기려면 공구가가 이 이상이어야
                    합니다.
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-blue-400 leading-relaxed">
              공식: 최소 공구가 = 목표마진 {fmt(targetMargin)}원 ÷ 벤더{" "}
              {vendorFeeRate}% · RS형은 마진율이 벤더 %로 고정되므로 공구가가
              높을수록 1건당 마진이 커집니다.
            </p>
          </div>
        )}

        {dealType === "supply" && (supplyPrice > 0 || gongguPrice > 0) && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 space-y-4">
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="text-xs text-blue-600 font-medium block mb-1">
                  벤더사 목표 마진 (1건당)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={targetMargin}
                    onChange={(e) =>
                      setTargetMargin(parseFloat(e.target.value) || 0)
                    }
                    className="w-32 px-3 py-2 text-sm border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    min="0"
                    step={targetMarginUnit === "won" ? 500 : 1}
                  />
                  <div className="flex border border-blue-300 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMarginUnit("won");
                        setTargetMargin(2000);
                      }}
                      className={`px-2.5 py-2 text-xs font-medium ${
                        targetMarginUnit === "won"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-blue-600"
                      }`}
                    >
                      원
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMarginUnit("pct");
                        setTargetMargin(10);
                      }}
                      className={`px-2.5 py-2 text-xs font-medium ${
                        targetMarginUnit === "pct"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-blue-600"
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>
              </div>

              {/* 방향 ①: 공급가 + 목표 마진 → 추천 셀러 견적가 */}
              {recQuote && (
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    추천 셀러 견적가 (목표 마진 기준)
                  </p>
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-bold text-blue-700">
                      {rate !== null
                        ? formatTwd(krwToTwd(recQuote.rounded, rate)!)
                        : `${fmt(recQuote.rounded)}원`}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          seller_quote_price: priceToField(recQuote.rounded),
                        }))
                      }
                      className="btn-secondary btn-sm mb-0.5"
                    >
                      적용
                    </button>
                  </div>
                  {rate !== null && (
                    <p className="text-xs text-blue-400 mt-0.5">
                      {fmt(recQuote.rounded)}원
                    </p>
                  )}
                  <p className="text-xs text-blue-400 mt-0.5">
                    공급가 + KOL RS(공구가 × {influencerRsRate}%) + 목표 마진.
                    셀러에게 이 이상으로 견적해야 목표 마진이 남습니다.
                  </p>
                </div>
              )}

              {/* 방향 ②: 공급가 → 추천 공구가 (직접 판매 시) */}
              {supplyPrice > 0 && sellerQuotePrice === 0 && (
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    추천 공구가 (공급가 기준)
                  </p>
                  {rec ? (
                    <>
                      <div className="flex items-end gap-2">
                        <p className="text-2xl font-bold text-blue-700">
                          {rate !== null
                            ? formatTwd(krwToTwd(recommendedPrice, rate)!)
                            : `${fmt(recommendedPrice)}원`}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              gonggu_price: priceToField(recommendedPrice),
                            }))
                          }
                          className="btn-secondary btn-sm mb-0.5"
                        >
                          적용
                        </button>
                      </div>
                      {rate !== null && (
                        <p className="text-xs text-blue-400 mt-0.5">
                          {fmt(recommendedPrice)}원
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-red-500">
                      KOL%와 목표 마진율 합이 100% 이상이라 계산 불가
                    </p>
                  )}
                </div>
              )}

              {/* 방향 ③: 견적가(또는 공구가) → 수용 가능 최대 공급가 (브랜드 협상용) */}
              {gongguPrice > 0 && (
                <div>
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    수용 가능 최대 공급가 (협상 카드)
                  </p>
                  {(() => {
                    const maxSupply = Math.max(0, Math.floor(maxSupplyPrice / 100) * 100);
                    return (
                      <>
                        <p
                          className={`text-2xl font-bold ${
                            maxSupplyPrice > 0 ? "text-blue-700" : "text-red-500"
                          }`}
                        >
                          {rate !== null && maxSupply > 0
                            ? formatTwd(krwToTwd(maxSupply, rate)!)
                            : `${fmt(maxSupply)}원`}
                        </p>
                        {rate !== null && maxSupply > 0 && (
                          <p className="text-xs text-blue-400">{fmt(maxSupply)}원</p>
                        )}
                      </>
                    );
                  })()}
                  <p className="text-xs text-blue-400 mt-0.5">
                    {sellerQuotePrice > 0
                      ? `견적가 ${fmt(sellerQuotePrice)}원에서`
                      : `공구가 ${fmt(gongguPrice)}원(직접 판매)에서`}{" "}
                    KOL {influencerRsRate}%와 목표 마진을 확보하려면 공급가는 이
                    이하여야 합니다.
                  </p>
                </div>
              )}
            </div>

            {recommendedExceedsOnlineMin && (
              <p className="text-xs text-orange-600 font-medium">
                ⚠ 추천 공구가({fmt(recommendedPrice)}원)가 온라인 최저가(
                {fmt(onlineMinPrice)}원) 이상입니다 — 이 조건으로는 가격
                메리트가 없습니다. 공급가를 더 낮춰 받아야 합니다.
              </p>
            )}
            <p className="text-xs text-blue-400 leading-relaxed">
              공식: 벤더 마진 = 셀러 견적가(영세율 0%) − 공급 실질 원가
              {supplyVatMode === "taxed" && "(공급가 ÷ 1.1)"} − KOL RS(공구가 ×
              KOL%) · 추천 견적가 = 실질 원가 + KOL RS + 목표마진
              {targetMarginUnit === "pct" && "(공구가 × %)"} · 최대 공급가 =
              (견적가 − KOL RS − 목표마진)
              {supplyVatMode === "taxed" && " × 1.1"}
            </p>
          </div>
        )}

        {/* ── 자동 계산 결과 ── */}
        {showAnalysis && (
          <div className="space-y-4">
            {/* 경고: 가격 메리트 부족 */}
            {econ.hasNoPriceMerit && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                <span className="text-orange-500 text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-orange-700">
                    가격 메리트 부족
                  </p>
                  <p className="text-xs text-orange-600 mt-0.5">
                    공구가({moneyText(gongguPrice)})가 온라인 최저가(
                    {moneyText(onlineMinPrice)}) 이상입니다. 공동구매의 전제가
                    무너집니다.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4 space-y-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                가용 재원 분석 (1건 판매 기준)
              </p>

              {/* 할인율 비교 */}
              {(normalPrice > 0 || onlineMinPrice > 0) && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    가격 비교 (부가세 포함 기준)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {normalPrice > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-400">정상가 대비 할인율</p>
                        <p className="text-xl font-bold text-red-500 mt-1">
                          {fmtRate(econ.normalDiscountRate)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {moneyText(normalPrice)} → {moneyText(gongguPrice)}
                        </p>
                      </div>
                    )}
                    {onlineMinPrice > 0 && (
                      <div
                        className={`bg-white rounded-lg p-3 border ${
                          econ.onlineMinDiscountRate <= 0
                            ? "border-orange-300"
                            : "border-gray-200"
                        }`}
                      >
                        <p className="text-xs text-gray-400">
                          온라인 최저가 대비 할인율
                        </p>
                        <p
                          className={`text-xl font-bold mt-1 ${
                            econ.onlineMinDiscountRate > 0
                              ? "text-blue-600"
                              : "text-orange-500"
                          }`}
                        >
                          {fmtRate(econ.onlineMinDiscountRate)}%
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {moneyText(onlineMinPrice)} → {moneyText(gongguPrice)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 재원 → 분배 폭포 */}
              {econ.availablePool !== null && econ.clientTakePerUnit !== null ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    재원 분배 — 공구가에서 클라이언트 몫을 뺀 전부가 우리가
                    나눌 돈
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">공구가 (소비자 판매가)</span>
                      <span className="font-semibold text-gray-900">
                        +{moneyText(gongguPrice)}
                      </span>
                    </div>
                    {dealType === "supply" &&
                      sellerQuotePrice > 0 &&
                      econ.sellerTakePerUnit !== null &&
                      econ.sellerQuotePerUnit !== null && (
                        <>
                          <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                            <span className="text-gray-600">
                              대만 셀러 몫 차감 (공구가 − 견적가)
                            </span>
                            <span className="font-semibold text-red-500">
                              -{moneyText(econ.sellerTakePerUnit)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-300 text-sm">
                            <span className="text-gray-700 font-medium">
                              셀러 견적가 (우리 매출/개)
                            </span>
                            <span className="font-bold text-gray-900">
                              {moneyText(econ.sellerQuotePerUnit)}
                            </span>
                          </div>
                        </>
                      )}
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">
                        {dealType === "rs"
                          ? `클라이언트 몫 차감 (공구가 × ${fmtRate(100 - (econ.maxRsRate ?? 0))}%)`
                          : supplyVatMode === "taxed"
                          ? `공급 실질 원가 차감 (브랜드 정산 ${fmt(supplyPrice)}원 ÷ 1.1)`
                          : "공급가 차감 (영세율 0% · 브랜드 정산 단가)"}
                      </span>
                      <span className="font-semibold text-red-500">
                        -
                        {moneyText(
                          dealType === "rs"
                            ? econ.clientTakePerUnit
                            : econ.supplyNetCostPerUnit ?? econ.clientTakePerUnit
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-300 text-sm">
                      <span className="text-gray-700 font-medium">
                        가용 재원
                        {econ.maxRsRate !== null &&
                          ` (공구가의 ${fmtRate(econ.maxRsRate)}%)`}
                      </span>
                      <span
                        className={`font-bold ${
                          (econ.availablePool ?? 0) >= 0
                            ? "text-gray-900"
                            : "text-red-600"
                        }`}
                      >
                        {moneyText(econ.availablePool ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                      <span className="text-gray-600">
                        KOL RS 차감 (공구가 × {influencerRsRate}%)
                      </span>
                      <span className="font-semibold text-purple-600">
                        -{moneyText(econ.kolPerUnit)}
                      </span>
                    </div>
                    <div
                      className={`flex justify-between items-center rounded-lg px-3 py-3 border-2 text-sm ${
                        feasibility === "possible"
                          ? "bg-green-50 border-green-300"
                          : feasibility === "conditional"
                          ? "bg-yellow-50 border-yellow-300"
                          : "bg-red-50 border-red-300"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-gray-900">
                          벤더사 마진 (1건 판매 시 우리 순수익)
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          마진율 {fmtRate(econ.vendorMarginRate)}% — 기준: 율{" "}
                          {FEASIBILITY.VENDOR_GOOD_RATE}%↑ &{" "}
                          {fmt(FEASIBILITY.VENDOR_GOOD_ABS)}원↑
                        </p>
                      </div>
                      <span
                        className={`text-xl font-bold text-right ${
                          feasibility === "possible"
                            ? "text-green-700"
                            : feasibility === "conditional"
                            ? "text-yellow-700"
                            : "text-red-700"
                        }`}
                      >
                        {rate !== null
                          ? formatTwd(krwToTwd(econ.vendorMarginPerUnit, rate)!)
                          : `${fmt(econ.vendorMarginPerUnit)}원`}
                        {rate !== null && (
                          <span className="block text-xs font-normal opacity-70">
                            {fmt(econ.vendorMarginPerUnit)}원
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                (influencerRsRate > 0 || vendorFeeRate > 0) && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">
                      RS 분배 (공급가 미입력 — 벤더 % 기준 계산)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 border-2 border-blue-200">
                        <p className="text-xs text-blue-500 font-medium">
                          벤더사 마진 (우리)
                        </p>
                        <p className="text-lg font-bold text-blue-700 mt-1">
                          {rate !== null
                            ? formatTwd(krwToTwd(econ.vendorMarginPerUnit, rate)!)
                            : `${fmt(econ.vendorMarginPerUnit)}원`}
                        </p>
                        <p className="text-xs text-blue-400">
                          {rate !== null && `${fmt(econ.vendorMarginPerUnit)}원 · `}
                          {vendorFeeRate}%
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-400">KOL 수익</p>
                        <p className="text-lg font-bold text-purple-600 mt-1">
                          {rate !== null
                            ? formatTwd(krwToTwd(econ.kolPerUnit, rate)!)
                            : `${fmt(econ.kolPerUnit)}원`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {rate !== null && `${fmt(econ.kolPerUnit)}원 · `}
                          {influencerRsRate}%
                        </p>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* KOL 수익 매력도 */}
              {influencerRsRate > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    KOL 수익 매력도
                  </p>
                  <div className="bg-white rounded-lg p-3 border border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-400">1건 판매 시 수익</p>
                      <p
                        className={`text-xl font-bold mt-1 ${
                          econ.kolPerUnit >= FEASIBILITY.KOL_ATTRACTIVE
                            ? "text-green-600"
                            : econ.kolPerUnit >= FEASIBILITY.KOL_OK
                            ? "text-yellow-600"
                            : "text-red-500"
                        }`}
                      >
                        {rate !== null
                          ? formatTwd(krwToTwd(econ.kolPerUnit, rate)!)
                          : `${fmt(econ.kolPerUnit)}원`}
                      </p>
                      {rate !== null && (
                        <p className="text-xs text-gray-400">
                          {fmt(econ.kolPerUnit)}원
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${
                          econ.kolPerUnit >= FEASIBILITY.KOL_ATTRACTIVE
                            ? "bg-green-100 text-green-700"
                            : econ.kolPerUnit >= FEASIBILITY.KOL_OK
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {econ.kolPerUnit >= FEASIBILITY.KOL_ATTRACTIVE
                          ? "매력적"
                          : econ.kolPerUnit >= FEASIBILITY.KOL_OK
                          ? "보통"
                          : "낮음"}
                      </span>
                      {econ.kolPerUnit < FEASIBILITY.KOL_OK && (
                        <p className="text-xs text-gray-400 mt-1">
                          모집 어려울 수 있음
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── 최종 판정 ── */}
            {canJudge && (
              <div className={`rounded-xl p-4 border-2 ${f.bg} ${f.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      최종 판정 — 벤더사 마진 기준
                    </p>
                    <p className={`text-xl font-bold ${f.text}`}>
                      {FEASIBILITY_LABEL[feasibility]}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {feasibility === "possible" &&
                        `벤더 마진 ${moneyText(econ.vendorMarginPerUnit)}/건(${fmtRate(econ.vendorMarginRate)}%) — 공구 진행에 적합합니다.`}
                      {feasibility === "conditional" &&
                        `벤더 마진 ${moneyText(econ.vendorMarginPerUnit)}/건(${fmtRate(econ.vendorMarginRate)}%) — 조건 협의 후 진행을 권장합니다.`}
                      {feasibility === "not_recommended" &&
                        `벤더 마진 ${moneyText(econ.vendorMarginPerUnit)}/건(${fmtRate(econ.vendorMarginRate)}%) — 수익성 부족으로 진행을 비추천합니다.`}
                    </p>
                  </div>
                  <span className={`text-4xl font-bold ${f.text} opacity-40`}>
                    {f.icon}
                  </span>
                </div>
                <div className="pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-2">
                  <CheckItem
                    ok={econ.vendorMarginPerUnit >= 0}
                    label="벤더 마진 확보"
                  />
                  <CheckItem
                    ok={econ.vendorMarginRate >= FEASIBILITY.VENDOR_MIN_RATE}
                    label={`마진율 ${FEASIBILITY.VENDOR_MIN_RATE}% 이상`}
                  />
                  <CheckItem ok={!econ.hasNoPriceMerit} label="가격 메리트" />
                  <CheckItem ok={!econ.rsBudgetOver} label="RS 한도 준수" />
                  <CheckItem
                    ok={!econ.supplyRsConflict}
                    label="공급가·RS 정합"
                  />
                  <CheckItem
                    ok={econ.kolPerUnit >= FEASIBILITY.KOL_OK}
                    label="KOL 수익 매력도"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 목표 KPI · 재원 분배 시뮬레이션 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          목표 KPI · 재원 분배 시뮬레이션
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          목표 판매액을 입력하면 클라이언트·KOL·벤더사(우리)에게 각각 얼마가
          분배되는지 한눈에 보여줍니다. (현재 가격·RS 구조 기준)
        </p>

        {/* 목표 판매액 입력 통화 토글 (가격 통화와 독립) */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">목표 판매액 단위</span>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => handleTargetCurrency("krw")}
              className={`px-3 py-1.5 text-xs font-medium ${
                targetCurrency === "krw"
                  ? "bg-primary-600 text-white"
                  : "bg-white text-gray-600"
              }`}
            >
              원 (KRW)
            </button>
            <button
              type="button"
              onClick={() => handleTargetCurrency("twd")}
              disabled={rate === null}
              title={rate === null ? "환율을 먼저 입력하세요" : undefined}
              className={`px-3 py-1.5 text-xs font-medium ${
                targetCurrency === "twd"
                  ? "bg-primary-600 text-white"
                  : "bg-white text-gray-600"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              NT$ (TWD)
            </button>
          </div>
          {rate === null && (
            <span className="text-xs text-gray-400">
              환율 입력 시 NT$로도 목표를 설정할 수 있습니다.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div>
            <label className="label">목표 판매액 ({targetUnitLabel})</label>
            <input
              type="number"
              name="target_sales"
              value={formData.target_sales}
              onChange={handleChange}
              className="input w-52"
              placeholder={targetCurrency === "twd" ? "예: 2,300,000" : "예: 100,000,000"}
              min="0"
            />
            {targetSales > 0 && (
              <p className="text-xs text-gray-400 mt-1">= {moneyText(targetSales)}</p>
            )}
          </div>
          {targetCurrency === "krw" && (
            <div className="flex items-center gap-1.5">
              {[50_000_000, 100_000_000, 300_000_000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, target_sales: v.toString() }))
                  }
                  className="btn-secondary btn-sm"
                >
                  {v / 100_000_000 >= 1
                    ? `${v / 100_000_000}억`
                    : `${v / 10_000_000}천만`}
                </button>
              ))}
            </div>
          )}
        </div>

        {targetDist ? (
          <div
            className={`grid grid-cols-2 gap-3 ${
              targetDist.sellerTake > 0 ? "md:grid-cols-5" : "md:grid-cols-4"
            }`}
          >
            <div className="card p-4 bg-gray-50">
              <p className="text-xs text-gray-400 mb-1">목표 판매액</p>
              <p className="text-lg font-bold text-gray-900">
                {rate !== null
                  ? formatTwd(krwToTwd(targetDist.sales, rate)!)
                  : `${fmt(targetDist.sales)}원`}
              </p>
              {rate !== null && (
                <p className="text-xs text-gray-400">{fmt(targetDist.sales)}원</p>
              )}
              {targetDist.quantity !== null && (
                <p className="text-xs text-gray-400 mt-0.5">
                  추정 {fmt(targetDist.quantity)}개
                </p>
              )}
            </div>

            <div className="card p-4 border-green-200 bg-green-50">
              <p className="text-xs text-green-600 font-medium mb-1">
                클라이언트 정산액
              </p>
              <p className="text-lg font-bold text-green-700">
                {rate !== null
                  ? formatTwd(krwToTwd(targetDist.clientTake, rate)!)
                  : `${fmt(targetDist.clientTake)}원`}
              </p>
              <p className="text-xs text-green-500">
                {rate !== null && `${fmt(targetDist.clientTake)}원 · `}
                판매액의{" "}
                {targetSales > 0
                  ? fmtRate((targetDist.clientTake / targetSales) * 100)
                  : "0"}
                %
              </p>
            </div>

            <div className="card p-4">
              <p className="text-xs text-gray-400 mb-1">KOL RS 지급액</p>
              <p className="text-lg font-bold text-purple-600">
                {rate !== null
                  ? formatTwd(krwToTwd(targetDist.kolPayout, rate)!)
                  : `${fmt(targetDist.kolPayout)}원`}
              </p>
              <p className="text-xs text-gray-400">
                {rate !== null && `${fmt(targetDist.kolPayout)}원 · `}
                판매액의{" "}
                {targetSales > 0
                  ? fmtRate((targetDist.kolPayout / targetSales) * 100)
                  : "0"}
                %
              </p>
            </div>

            {targetDist.sellerTake > 0 && (
              <div className="card p-4">
                <p className="text-xs text-gray-400 mb-1">대만 셀러 몫</p>
                <p className="text-lg font-bold text-teal-600">
                  {rate !== null
                    ? formatTwd(krwToTwd(targetDist.sellerTake, rate)!)
                    : `${fmt(targetDist.sellerTake)}원`}
                </p>
                <p className="text-xs text-gray-400">
                  {rate !== null && `${fmt(targetDist.sellerTake)}원 · `}
                  판매액의{" "}
                  {targetSales > 0
                    ? fmtRate((targetDist.sellerTake / targetSales) * 100)
                    : "0"}
                  %
                </p>
              </div>
            )}

            <div className="card p-4 border-blue-200 bg-blue-50">
              <p className="text-xs text-blue-600 font-medium mb-1">
                벤더사 마진 (우리)
              </p>
              <p
                className={`text-lg font-bold ${
                  targetDist.vendorMargin >= 0 ? "text-blue-700" : "text-red-600"
                }`}
              >
                {rate !== null
                  ? formatTwd(krwToTwd(targetDist.vendorMargin, rate)!)
                  : `${fmt(targetDist.vendorMargin)}원`}
              </p>
              <p className="text-xs text-blue-500">
                {rate !== null && `${fmt(targetDist.vendorMargin)}원 · `}
                판매액의{" "}
                {targetSales > 0
                  ? fmtRate((targetDist.vendorMargin / targetSales) * 100)
                  : "0"}
                %
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            목표 판매액과 가격·RS 구조(공구가·RS율 등)를 입력하면 분배 결과가
            표시됩니다.
          </p>
        )}
      </div>

      {/* 진행 단계 · 공구 기간 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          진행 단계 · 공구 기간
        </h2>

        <div className="mb-5">
          <label className="label">진행 단계</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="input md:max-w-xs"
          >
            {CAMPAIGN_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]} — {STAGE_DESCRIPTION[s]}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">
            &quot;진행중&quot;·&quot;정산중&quot;은 캘린더에, &quot;가망&quot;·&quot;셋업&quot;·&quot;모집중&quot;은
            대기 보드에 표시됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="label">공구 시작일</label>
            <input
              type="date"
              name="start_date"
              value={formData.start_date}
              onChange={handleChange}
              className="input"
            />
          </div>
          <div>
            <label className="label">공구 종료일</label>
            <input
              type="date"
              name="end_date"
              value={formData.end_date}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* 링크 정보 */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">
          링크 정보
        </h2>
        <div className="space-y-5">
          <div>
            <label className="label">공통 구매 링크</label>
            <input
              type="url"
              name="purchase_form_url"
              value={formData.purchase_form_url}
              onChange={handleChange}
              className="input"
              placeholder="https://..."
            />
            <p className="text-xs text-gray-400 mt-1">
              캠페인 전체가 하나의 구매 링크를 쓰는 경우 입력하세요. KOL별로
              링크가 다르면 비워두고 인플루언서별 구매링크에 입력하면 됩니다
              (개별 링크가 있으면 개별 링크가 우선).
            </p>
          </div>
          <div>
            <label className="label">KOL 가이드 (구글 드라이브)</label>
            <input
              type="url"
              name="drive_url"
              value={formData.drive_url}
              onChange={handleChange}
              className="input"
              placeholder="https://drive.google.com/..."
            />
            <p className="text-xs text-gray-400 mt-1">
              KOL에게 보낼 가이드 문서 링크
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
        >
          취소
        </button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              저장 중...
            </>
          ) : mode === "create" ? (
            "캠페인 등록"
          ) : (
            "캠페인 수정"
          )}
        </button>
      </div>

      {pickerOpen && (
        <ProspectPicker
          onPick={handlePickProspect}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </form>
  );
}
