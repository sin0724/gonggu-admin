// 공구 캠페인 수익 구조의 단일 진실 공급원.
//
// 딜 방식 두 가지 — 캠페인마다 담당자가 선택:
//
// ① RS형 (deal_type = "rs", 대부분의 딜)
//    클라이언트와 "총 RS %"로 합의. 예: 공구가 6,000원 · 총 RS 40%
//    → 가용 재원 = 공구가 × 40% = 2,400원 (KOL과 벤더가 분배)
//    → 클라이언트 몫 = 공구가 × 60% = 3,600원 (파생값 — 따로 입력하지 않음)
//    벤더사 마진 = 공구가 × 벤더% (총 RS − KOL%)
//
// ② 공급가형 (deal_type = "supply")
//    브랜드(클라이언트)가 우리에게 "개당 단가(공급가)"를 주고, 우리가 마진을
//    붙여 대만 총판/셀러에게 견적가로 공급. 셀러가 소비자에게 공구가로 판매.
//    돈 흐름: 소비자(공구가) → 셀러(견적가로 우리에게 지불) → 우리(공급가로 브랜드 정산)
//    → 우리 매출/개 = 셀러 견적가, 셀러 몫 = 공구가 − 견적가
//    → 가용 재원 = 견적가 − 공급가 (KOL + 벤더가 나눌 돈)
//    벤더사 마진 = 견적가 − 공급가 − KOL RS (잔여분)
//    견적가 미입력 시 공구가에 직접 판매하는 것으로 간주 (견적가 = 공구가).
//
// 공통:
//  - 클라이언트의 원가·마진은 우리가 알 수 없고 판단 대상이 아니다.
//  - 공구가는 온라인 최저가보다 싸야 메리트가 있다.
//  - 배송비는 판매자 부담이어도 클라이언트 몫에서 나가므로 마진 계산에 미반영.
//  - 모든 가격(정상가·최저가·공급가·견적가·공구가)은 부가세 포함 기준으로 통일.

export type DealType = "rs" | "supply";

// ── 수량 구간별 단가 ────────────────────────────────────────
// 브랜드 공급가·셀러 견적가 모두 "N세트 이상이면 개당 얼마" 식으로
// 수량 구간에 따라 단가가 달라질 수 있다. (예: 200세트↑ 20,500 / 500세트↑ 18,500)

/** 수량 구간 단가 — min_qty 세트 이상 주문 시 개당 price (부가세 포함) */
export interface PriceTier {
  min_qty: number;
  price: number;
}

/** 수량에 해당하는 구간 단가. 맞는 구간이 없으면 기본가. */
export function resolveTierPrice(
  basePrice: number,
  tiers: PriceTier[] | null | undefined,
  qty: number
): number {
  if (!tiers || tiers.length === 0 || !(qty > 0)) return basePrice;
  let best: PriceTier | null = null;
  for (const t of tiers) {
    if (t.min_qty <= qty && t.price > 0 && (!best || t.min_qty > best.min_qty)) {
      best = t;
    }
  }
  return best ? best.price : basePrice;
}

export interface TierMarginRow {
  /** 구간 시작 수량 (0 = 기본 단가) */
  minQty: number;
  supplyPrice: number;
  quotePrice: number;
  /** 개당 유통 마진 = 견적가 − 공급가 */
  marginPerUnit: number;
  /** 개당 순마진 = 견적가 − 공급가 − KOL RS(공구가 × KOL%) */
  netMarginPerUnit: number;
  /** 구간 시작 수량 기준 총 순마진 */
  totalNetMargin: number;
}

/**
 * [공급가형] 구간별 마진 테이블 — 공급가·견적가 구간의 모든 경계 수량에서
 * 개당 마진과 순마진을 비교. 담당자가 구간 견적을 짤 때 한눈에 보는 용도.
 */
export function buildTierMarginRows(params: {
  supplyPrice: number;
  supplyTiers?: PriceTier[] | null;
  /** 기본 견적가. 0이면 공구가 직접 판매 기준 */
  quotePrice: number;
  quoteTiers?: PriceTier[] | null;
  gongguPrice: number;
  kolRsRatePct: number;
}): TierMarginRow[] {
  const {
    supplyPrice,
    supplyTiers,
    quotePrice,
    quoteTiers,
    gongguPrice,
    kolRsRatePct,
  } = params;
  const baseQuote = quotePrice > 0 ? quotePrice : gongguPrice;
  if (supplyPrice <= 0 || baseQuote <= 0) return [];
  const breakpoints = new Set<number>([0]);
  for (const t of supplyTiers ?? []) {
    if (t.min_qty > 0 && t.price > 0) breakpoints.add(t.min_qty);
  }
  for (const t of quoteTiers ?? []) {
    if (t.min_qty > 0 && t.price > 0) breakpoints.add(t.min_qty);
  }
  const kolPerUnit = gongguPrice * (kolRsRatePct / 100);
  return [...breakpoints]
    .sort((a, b) => a - b)
    .map((q) => {
      const s = resolveTierPrice(supplyPrice, supplyTiers, q);
      const c = resolveTierPrice(baseQuote, quoteTiers, q);
      const marginPerUnit = c - s;
      const netMarginPerUnit = marginPerUnit - kolPerUnit;
      return {
        minQty: q,
        supplyPrice: s,
        quotePrice: c,
        marginPerUnit,
        netMarginPerUnit,
        totalNetMargin: q * netMarginPerUnit,
      };
    });
}

// 판정 기준 (마진율 AND 절대금액)
export const FEASIBILITY = {
  // 벤더사 마진: 1건당 이 이상 남아야 진행할 의미가 있음
  VENDOR_GOOD_RATE: 8, // %
  VENDOR_GOOD_ABS: 2000, // 원
  VENDOR_MIN_RATE: 3,
  VENDOR_MIN_ABS: 1000,
  // KOL 1건 수익: 모집 매력도
  KOL_ATTRACTIVE: 10000,
  KOL_OK: 5000,
} as const;

export type Feasibility = "possible" | "conditional" | "not_recommended";

export interface EconomicsInput {
  dealType: DealType;
  gongguPrice: number;
  /** 공급가형에서만 사용 (RS형은 파생값) */
  supplyPrice: number;
  /** [공급가형] 대만 총판/셀러 견적 단가. 0/미입력이면 공구가 직접 판매로 간주 */
  sellerQuotePrice?: number;
  influencerRsRate: number; // %
  vendorFeeRate: number; // %
  totalRsRate?: number | null; // 클라이언트 승인 총 RS(%)
  normalPrice: number;
  onlineMinPrice: number;
}

export interface UnitEconomics {
  dealType: DealType;
  gongguPrice: number;
  /** 클라이언트 몫/개 — RS형: 공구가×(1−총RS%), 공급가형: 공급가 */
  clientTakePerUnit: number | null;
  /** [공급가형] 유효 셀러 견적가/개 (미입력 시 공구가). RS형은 null */
  sellerQuotePerUnit: number | null;
  /** [공급가형] 셀러 몫/개 = 공구가 − 견적가. 직접 판매(견적가 미입력)면 0 */
  sellerTakePerUnit: number | null;
  /** 가용 재원/개 (KOL + 벤더가 나눌 돈) */
  availablePool: number | null;
  /** 가용 재원율(%) — RS형: 총RS, 공급가형: (견적가−공급가)/공구가 */
  maxRsRate: number | null;
  /** KOL% + 벤더%가 승인 총 RS 한도를 초과 */
  rsBudgetOver: boolean;
  /** 공급가형: 승인 총 RS가 공급가 기준 가능 RS를 초과 — 조건 모순 */
  supplyRsConflict: boolean;
  /** [공급가형] 견적가가 공급가 이하 — 역마진 */
  quoteBelowSupply: boolean;
  /** [공급가형] 견적가가 공구가 초과 — 셀러가 소비자가보다 비싸게 사는 모순 */
  quoteAboveGonggu: boolean;
  kolPerUnit: number;
  /** 벤더사 마진 — RS형: 공구가×벤더%, 공급가형: 잔여분 */
  vendorMarginPerUnit: number;
  vendorMarginRate: number;
  /** 공구가(부가세 포함) 기준 할인율 */
  normalDiscountRate: number;
  onlineMinDiscountRate: number;
  /** 공구가가 온라인 최저가 이상 → 가격 메리트 없음 */
  hasNoPriceMerit: boolean;
}

export function computeUnitEconomics(input: EconomicsInput): UnitEconomics {
  const {
    dealType,
    gongguPrice,
    supplyPrice,
    sellerQuotePrice = 0,
    influencerRsRate,
    vendorFeeRate,
    totalRsRate,
    normalPrice,
    onlineMinPrice,
  } = input;

  const kolPerUnit = gongguPrice * (influencerRsRate / 100);
  const hasBudget = totalRsRate != null && totalRsRate > 0;

  let clientTakePerUnit: number | null = null;
  let sellerQuotePerUnit: number | null = null;
  let sellerTakePerUnit: number | null = null;
  let availablePool: number | null = null;
  let maxRsRate: number | null = null;
  let vendorMarginPerUnit: number;
  let supplyRsConflict = false;
  let quoteBelowSupply = false;
  let quoteAboveGonggu = false;

  if (dealType === "rs") {
    // RS형: 총 RS%가 합의값. 미입력 시 KOL+벤더 합으로 간주.
    const effectiveTotalRs = hasBudget
      ? totalRsRate!
      : influencerRsRate + vendorFeeRate;
    if (gongguPrice > 0 && effectiveTotalRs > 0) {
      availablePool = gongguPrice * (effectiveTotalRs / 100);
      clientTakePerUnit = gongguPrice - availablePool;
      maxRsRate = effectiveTotalRs;
    }
    vendorMarginPerUnit = gongguPrice * (vendorFeeRate / 100);
  } else {
    // 공급가형: 브랜드 공급가에 마진을 붙여 셀러에게 견적. 견적가 − 공급가가 재원.
    // 견적가 미입력 시 공구가 직접 판매(견적가 = 공구가)로 간주.
    const hasSupply = supplyPrice > 0 && gongguPrice > 0;
    const effectiveQuote = sellerQuotePrice > 0 ? sellerQuotePrice : gongguPrice;
    if (hasSupply) {
      clientTakePerUnit = supplyPrice;
      sellerQuotePerUnit = effectiveQuote;
      sellerTakePerUnit = gongguPrice - effectiveQuote;
      availablePool = effectiveQuote - supplyPrice;
      maxRsRate = ((effectiveQuote - supplyPrice) / gongguPrice) * 100;
    }
    vendorMarginPerUnit = hasSupply
      ? effectiveQuote - supplyPrice - kolPerUnit
      : gongguPrice * (vendorFeeRate / 100);
    supplyRsConflict =
      hasBudget && maxRsRate !== null && totalRsRate! > maxRsRate + 0.5;
    quoteBelowSupply =
      sellerQuotePrice > 0 && supplyPrice > 0 && sellerQuotePrice <= supplyPrice;
    quoteAboveGonggu =
      sellerQuotePrice > 0 && gongguPrice > 0 && sellerQuotePrice > gongguPrice;
  }

  const vendorMarginRate =
    gongguPrice > 0 ? (vendorMarginPerUnit / gongguPrice) * 100 : 0;

  const rsBudgetOver =
    hasBudget && influencerRsRate + vendorFeeRate > totalRsRate! + 0.001;

  return {
    dealType,
    gongguPrice,
    clientTakePerUnit,
    sellerQuotePerUnit,
    sellerTakePerUnit,
    availablePool,
    maxRsRate,
    rsBudgetOver,
    supplyRsConflict,
    quoteBelowSupply,
    quoteAboveGonggu,
    kolPerUnit,
    vendorMarginPerUnit,
    vendorMarginRate,
    normalDiscountRate:
      normalPrice > 0 && gongguPrice > 0
        ? ((normalPrice - gongguPrice) / normalPrice) * 100
        : 0,
    onlineMinDiscountRate:
      onlineMinPrice > 0 && gongguPrice > 0
        ? ((onlineMinPrice - gongguPrice) / onlineMinPrice) * 100
        : 0,
    hasNoPriceMerit:
      onlineMinPrice > 0 && gongguPrice > 0 && gongguPrice >= onlineMinPrice,
  };
}

/**
 * 최종 판정 — 벤더사 마진(율 AND 절대금액)이 기준.
 * RS 한도 초과·공급가 모순·가격 메리트 부족 시 한 단계 강등.
 */
export function judgeFeasibility(e: UnitEconomics): Feasibility {
  let level: Feasibility;
  if (e.vendorMarginPerUnit < 0) {
    return "not_recommended";
  } else if (
    e.vendorMarginRate >= FEASIBILITY.VENDOR_GOOD_RATE &&
    e.vendorMarginPerUnit >= FEASIBILITY.VENDOR_GOOD_ABS
  ) {
    level = "possible";
  } else if (
    e.vendorMarginRate >= FEASIBILITY.VENDOR_MIN_RATE &&
    e.vendorMarginPerUnit >= FEASIBILITY.VENDOR_MIN_ABS
  ) {
    level = "conditional";
  } else {
    level = "not_recommended";
  }

  if (
    (e.rsBudgetOver || e.supplyRsConflict || e.hasNoPriceMerit || e.quoteAboveGonggu) &&
    level === "possible"
  ) {
    level = "conditional";
  }
  return level;
}

/**
 * [공급가형] 추천 공구가: 벤더 목표 마진을 보장하는 최소 공구가.
 *   목표가 원 단위: 공구가 = (공급가 + 목표마진) ÷ (1 − KOL%)
 *   목표가 % 단위: 공구가 = 공급가 ÷ (1 − KOL% − 목표마진%)
 * 1,000원 단위 올림.
 */
export function recommendGongguPrice(params: {
  supplyPrice: number;
  kolRsRatePct: number;
  targetVendorMargin: number;
  targetUnit: "won" | "pct";
}): { raw: number; rounded: number } | null {
  const { supplyPrice, kolRsRatePct, targetVendorMargin, targetUnit } = params;
  if (supplyPrice <= 0) return null;
  const denom =
    targetUnit === "won"
      ? 1 - kolRsRatePct / 100
      : 1 - kolRsRatePct / 100 - targetVendorMargin / 100;
  if (denom <= 0) return null;
  const numer =
    targetUnit === "won" ? supplyPrice + targetVendorMargin : supplyPrice;
  const raw = numer / denom;
  return { raw, rounded: Math.ceil(raw / 1000) * 1000 };
}

/**
 * [공급가형] 추천 셀러 견적가: 벤더 목표 마진을 보장하는 최소 견적가.
 *   견적가 = 공급가 + KOL RS(공구가 × KOL%) + 목표마진(원 또는 공구가 × %)
 * 100원 단위 올림.
 */
export function recommendSellerQuote(params: {
  supplyPrice: number;
  gongguPrice: number;
  kolRsRatePct: number;
  targetVendorMargin: number;
  targetUnit: "won" | "pct";
}): { raw: number; rounded: number } | null {
  const { supplyPrice, gongguPrice, kolRsRatePct, targetVendorMargin, targetUnit } =
    params;
  if (supplyPrice <= 0 || gongguPrice <= 0) return null;
  const kol = gongguPrice * (kolRsRatePct / 100);
  const margin =
    targetUnit === "won"
      ? targetVendorMargin
      : gongguPrice * (targetVendorMargin / 100);
  const raw = supplyPrice + kol + margin;
  return { raw, rounded: Math.ceil(raw / 100) * 100 };
}

/**
 * [RS형] 목표 마진(원/건)을 달성하는 최소 공구가.
 *   벤더 마진/건 = 공구가 × 벤더% 이므로, 공구가 = 목표마진 ÷ 벤더%
 */
export function minPriceForVendorTarget(params: {
  targetVendorMarginWon: number;
  vendorFeeRatePct: number;
}): number | null {
  const { targetVendorMarginWon, vendorFeeRatePct } = params;
  if (vendorFeeRatePct <= 0 || targetVendorMarginWon <= 0) return null;
  const raw = targetVendorMarginWon / (vendorFeeRatePct / 100);
  return Math.ceil(raw / 1000) * 1000;
}

export interface PriceScenario {
  econ: UnitEconomics;
  feasibility: Feasibility;
  isCurrent: boolean;
}

/**
 * 공구가 시나리오 테이블: 기준가 주변 5개 가격대의 수익 구조를 비교.
 * 클라이언트 협상 시 "이 밑으로는 안 됩니다"를 보여주는 용도.
 */
export function buildPriceScenarios(
  base: EconomicsInput,
  centerPrice: number
): PriceScenario[] {
  if (centerPrice <= 0) return [];
  // 가격대에 비례한 스텝 (1,000원 단위)
  const step = Math.max(1000, Math.round((centerPrice * 0.05) / 1000) * 1000);
  const offsets = [-2, -1, 0, 1, 2];
  return offsets
    .map((o) => centerPrice + o * step)
    .filter((p) => p > 0)
    .map((p) => {
      const econ = computeUnitEconomics({ ...base, gongguPrice: p });
      return {
        econ,
        feasibility: judgeFeasibility(econ),
        isCurrent: p === base.gongguPrice,
      };
    });
}

export interface SalesDistribution {
  /** 기준 판매액 */
  sales: number;
  /** 클라이언트 정산액 (몫) */
  clientTake: number;
  /** KOL RS 지급액 */
  kolPayout: number;
  /** 벤더사 마진 (우리) */
  vendorMargin: number;
  /** [공급가형+견적가] 대만 셀러 몫 = (공구가 − 견적가) × 수량. 그 외 0 */
  sellerTake: number;
  /** 공구가 기준 추정 수량 (공구가 미입력 시 null) */
  quantity: number | null;
}

/**
 * 특정 판매액을 돈 흐름 모델대로 분배 — 클라이언트/KOL/벤더.
 * 목표 판매액 시뮬레이션과 상세 페이지 실적 분배가 동일 모델을 쓰도록 단일화.
 *   RS형:  클라이언트 = 판매액×(1−총RS%), KOL = 판매액×KOL%, 벤더 = 판매액×벤더%
 *   공급가형: 수량 = 판매액÷공구가, 클라이언트 = 수량×공급가, KOL = 판매액×KOL%,
 *            벤더 = 수량×(견적가−공급가) − KOL, 셀러 = 잔여분
 *            (견적가 미입력 시 공구가 직접 판매 — 벤더 = 잔여분, 셀러 = 0)
 */
export function distributeSales(params: {
  dealType: DealType;
  sales: number;
  gongguPrice: number;
  supplyPrice: number;
  sellerQuotePrice?: number;
  influencerRsRate: number; // %
  vendorFeeRate: number; // %
  totalRsRate?: number | null; // %
}): SalesDistribution {
  const {
    dealType,
    sales,
    gongguPrice,
    supplyPrice,
    sellerQuotePrice = 0,
    influencerRsRate,
    vendorFeeRate,
    totalRsRate,
  } = params;
  const kolPayout = sales * (influencerRsRate / 100);
  const quantity = gongguPrice > 0 ? Math.round(sales / gongguPrice) : null;

  if (dealType === "rs") {
    const totalRs =
      totalRsRate && totalRsRate > 0
        ? totalRsRate
        : influencerRsRate + vendorFeeRate;
    const clientTake = sales * (1 - totalRs / 100);
    const vendorMargin = sales * (vendorFeeRate / 100);
    return { sales, clientTake, kolPayout, vendorMargin, sellerTake: 0, quantity };
  }

  const qty = quantity ?? 0;
  const clientTake = qty * supplyPrice;
  if (sellerQuotePrice > 0) {
    // 셀러 경유: 우리 매출 = 수량 × 견적가. 브랜드 정산·KOL 지급 후가 우리 마진.
    const vendorMargin = qty * (sellerQuotePrice - supplyPrice) - kolPayout;
    const sellerTake = sales - clientTake - kolPayout - vendorMargin;
    return { sales, clientTake, kolPayout, vendorMargin, sellerTake, quantity };
  }
  const vendorMargin = sales - clientTake - kolPayout;
  return { sales, clientTake, kolPayout, vendorMargin, sellerTake: 0, quantity };
}

export const FEASIBILITY_LABEL: Record<Feasibility, string> = {
  possible: "진행 가능",
  conditional: "조건부 진행",
  not_recommended: "진행 비추천",
};

export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  rs: "RS형 (총 RS% 합의)",
  supply: "공급가형 (공급가 합의 · 셀러 견적 공급)",
};
