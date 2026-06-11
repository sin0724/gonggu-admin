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
//    클라이언트와 "개당 단가(공급가)"로 합의. 클라이언트 몫이 원 단위로 고정.
//    → 가용 재원 = 공구가 − 공급가 (RS율은 파생값)
//    벤더사 마진 = 공구가 − 공급가 − KOL RS (잔여분)
//
// 공통:
//  - 클라이언트의 원가·마진은 우리가 알 수 없고 판단 대상이 아니다.
//  - 공구가는 온라인 최저가보다 싸야 메리트가 있다.
//  - 배송비는 판매자 부담이어도 클라이언트 몫에서 나가므로 마진 계산에 미반영.
//  - VAT 별도면 소비자 실결제가 = 공구가 × 1.1이며 할인율 비교는 실결제가 기준.

export const VAT_RATE = 0.1;

export type DealType = "rs" | "supply";

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
  influencerRsRate: number; // %
  vendorFeeRate: number; // %
  totalRsRate?: number | null; // 클라이언트 승인 총 RS(%)
  vatIncluded: boolean;
  normalPrice: number;
  onlineMinPrice: number;
}

export interface UnitEconomics {
  dealType: DealType;
  gongguPrice: number;
  /** 소비자 실결제가 (VAT 별도면 공구가 × 1.1) */
  consumerPrice: number;
  /** 클라이언트 몫/개 — RS형: 공구가×(1−총RS%), 공급가형: 공급가 */
  clientTakePerUnit: number | null;
  /** 가용 재원/개 (KOL + 벤더가 나눌 돈) */
  availablePool: number | null;
  /** 가용 재원율(%) — RS형: 총RS, 공급가형: (공구가−공급가)/공구가 */
  maxRsRate: number | null;
  /** KOL% + 벤더%가 승인 총 RS 한도를 초과 */
  rsBudgetOver: boolean;
  /** 공급가형: 승인 총 RS가 공급가 기준 가능 RS를 초과 — 조건 모순 */
  supplyRsConflict: boolean;
  kolPerUnit: number;
  /** 벤더사 마진 — RS형: 공구가×벤더%, 공급가형: 잔여분 */
  vendorMarginPerUnit: number;
  vendorMarginRate: number;
  /** 소비자 실결제가 기준 할인율 */
  normalDiscountRate: number;
  onlineMinDiscountRate: number;
  /** 공구가(실결제가)가 온라인 최저가 이상 → 가격 메리트 없음 */
  hasNoPriceMerit: boolean;
}

export function computeUnitEconomics(input: EconomicsInput): UnitEconomics {
  const {
    dealType,
    gongguPrice,
    supplyPrice,
    influencerRsRate,
    vendorFeeRate,
    totalRsRate,
    vatIncluded,
    normalPrice,
    onlineMinPrice,
  } = input;

  const consumerPrice = vatIncluded
    ? gongguPrice
    : Math.round(gongguPrice * (1 + VAT_RATE));

  const kolPerUnit = gongguPrice * (influencerRsRate / 100);
  const hasBudget = totalRsRate != null && totalRsRate > 0;

  let clientTakePerUnit: number | null = null;
  let availablePool: number | null = null;
  let maxRsRate: number | null = null;
  let vendorMarginPerUnit: number;
  let supplyRsConflict = false;

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
    // 공급가형: 공급가가 합의값. 간극이 재원.
    const hasSupply = supplyPrice > 0 && gongguPrice > 0;
    if (hasSupply) {
      clientTakePerUnit = supplyPrice;
      availablePool = gongguPrice - supplyPrice;
      maxRsRate = ((gongguPrice - supplyPrice) / gongguPrice) * 100;
    }
    vendorMarginPerUnit = hasSupply
      ? gongguPrice - supplyPrice - kolPerUnit
      : gongguPrice * (vendorFeeRate / 100);
    supplyRsConflict =
      hasBudget && maxRsRate !== null && totalRsRate! > maxRsRate + 0.5;
  }

  const vendorMarginRate =
    gongguPrice > 0 ? (vendorMarginPerUnit / gongguPrice) * 100 : 0;

  const rsBudgetOver =
    hasBudget && influencerRsRate + vendorFeeRate > totalRsRate! + 0.001;

  return {
    dealType,
    gongguPrice,
    consumerPrice,
    clientTakePerUnit,
    availablePool,
    maxRsRate,
    rsBudgetOver,
    supplyRsConflict,
    kolPerUnit,
    vendorMarginPerUnit,
    vendorMarginRate,
    normalDiscountRate:
      normalPrice > 0 && consumerPrice > 0
        ? ((normalPrice - consumerPrice) / normalPrice) * 100
        : 0,
    onlineMinDiscountRate:
      onlineMinPrice > 0 && consumerPrice > 0
        ? ((onlineMinPrice - consumerPrice) / onlineMinPrice) * 100
        : 0,
    hasNoPriceMerit:
      onlineMinPrice > 0 && consumerPrice > 0 && consumerPrice >= onlineMinPrice,
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
    (e.rsBudgetOver || e.supplyRsConflict || e.hasNoPriceMerit) &&
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

export const FEASIBILITY_LABEL: Record<Feasibility, string> = {
  possible: "진행 가능",
  conditional: "조건부 진행",
  not_recommended: "진행 비추천",
};

export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  rs: "RS형 (총 RS% 합의)",
  supply: "공급가형 (개당 단가 합의)",
};
