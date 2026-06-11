// 공구 캠페인 수익 구조의 단일 진실 공급원.
//
// 돈 흐름 모델:
//   클라이언트가 총 RS(%)를 승인하면, 그 안에서 KOL RS(%)와 벤더 수수료(%)를 나눈다.
//   예) 총 RS 40% 승인 → KOL에게 30% 제안 → 벤더(우리) 마진 10%
//
//   벤더사 마진   = 판매액 × 벤더 수수료%        ← 우리 수익
//   KOL 수익      = 판매액 × 인플루언서 RS%
//   클라이언트 마진 = 공구가 − 공급가 − 총 RS − 판매자부담 배송비
//                   ← 클라이언트가 이 가격을 납득할 수 있는지의 기준
//
// 부가세: 공구가는 항상 "정산 기준 금액"으로 취급한다.
//   VAT 별도(vat_included=false)면 소비자 실결제가 = 공구가 × 1.1이며,
//   정상가/온라인 최저가(소비자가)와의 할인율 비교에는 실결제가를 사용한다.

export const VAT_RATE = 0.1;

// 판정 기준 (마진율 AND 절대금액)
export const FEASIBILITY = {
  // 클라이언트 마진: 이 밑으로는 클라이언트가 납득하기 어려움
  CLIENT_GOOD_RATE: 15, // %
  CLIENT_GOOD_ABS: 5000, // 원
  CLIENT_MIN_RATE: 5,
  CLIENT_MIN_ABS: 3000,
  // 벤더사 마진: 1건당 이 이상은 남아야 진행 의미가 있음
  VENDOR_MIN_PER_UNIT: 1000,
  // KOL 1건 수익: 모집 매력도
  KOL_ATTRACTIVE: 10000,
  KOL_OK: 5000,
} as const;

export type Feasibility = "possible" | "conditional" | "not_recommended";

export interface EconomicsInput {
  gongguPrice: number;
  supplyPrice: number;
  influencerRsRate: number; // %
  vendorFeeRate: number; // %
  totalRsRate?: number | null; // 클라이언트 승인 총 RS(%) — 미입력 가능
  shippingFee: number;
  shippingPayer: string; // "buyer" | "seller"
  vatIncluded: boolean;
  normalPrice: number;
  onlineMinPrice: number;
}

export interface UnitEconomics {
  gongguPrice: number;
  /** 소비자 실결제가 (VAT 별도면 공구가 × 1.1) */
  consumerPrice: number;
  /** 실제 사용 중인 총 RS% (KOL + 벤더) */
  usedRsRate: number;
  /** 승인 한도 대비 초과 여부 */
  rsBudgetOver: boolean;
  /** 승인 한도 잔여분 (승인 총 RS − 사용 중 RS), 한도 미입력 시 null */
  rsBudgetRemaining: number | null;
  sellerShipping: number;
  vendorMarginPerUnit: number;
  vendorMarginRate: number;
  kolPerUnit: number;
  clientMarginPerUnit: number;
  clientMarginRate: number;
  /** 소비자 실결제가 기준 할인율 */
  normalDiscountRate: number;
  onlineMinDiscountRate: number;
  /** 공구가(실결제가)가 온라인 최저가 이상 → 가격 메리트 없음 */
  hasNoPriceMerit: boolean;
}

export function computeUnitEconomics(input: EconomicsInput): UnitEconomics {
  const {
    gongguPrice,
    supplyPrice,
    influencerRsRate,
    vendorFeeRate,
    totalRsRate,
    shippingFee,
    shippingPayer,
    vatIncluded,
    normalPrice,
    onlineMinPrice,
  } = input;

  const consumerPrice = vatIncluded
    ? gongguPrice
    : Math.round(gongguPrice * (1 + VAT_RATE));

  const usedRsRate = influencerRsRate + vendorFeeRate;
  const hasBudget = totalRsRate != null && totalRsRate > 0;
  const rsBudgetRemaining = hasBudget ? totalRsRate! - usedRsRate : null;
  const rsBudgetOver = hasBudget && usedRsRate > totalRsRate! + 0.001;

  const sellerShipping = shippingPayer === "seller" ? shippingFee : 0;

  const vendorMarginPerUnit = gongguPrice * (vendorFeeRate / 100);
  const kolPerUnit = gongguPrice * (influencerRsRate / 100);
  const clientMarginPerUnit =
    gongguPrice - supplyPrice - vendorMarginPerUnit - kolPerUnit - sellerShipping;

  return {
    gongguPrice,
    consumerPrice,
    usedRsRate,
    rsBudgetOver,
    rsBudgetRemaining,
    sellerShipping,
    vendorMarginPerUnit,
    vendorMarginRate: vendorFeeRate,
    kolPerUnit,
    clientMarginPerUnit,
    clientMarginRate: gongguPrice > 0 ? (clientMarginPerUnit / gongguPrice) * 100 : 0,
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
 * 최종 판정 — 클라이언트 마진(율 AND 절대금액)이 기준.
 * RS 한도 초과 또는 가격 메리트 부족 시 한 단계 강등.
 */
export function judgeFeasibility(e: UnitEconomics): Feasibility {
  let level: Feasibility;
  if (
    e.clientMarginRate >= FEASIBILITY.CLIENT_GOOD_RATE &&
    e.clientMarginPerUnit >= FEASIBILITY.CLIENT_GOOD_ABS
  ) {
    level = "possible";
  } else if (
    e.clientMarginRate >= FEASIBILITY.CLIENT_MIN_RATE &&
    e.clientMarginPerUnit >= FEASIBILITY.CLIENT_MIN_ABS
  ) {
    level = "conditional";
  } else {
    level = "not_recommended";
  }

  if ((e.rsBudgetOver || e.hasNoPriceMerit) && level === "possible") {
    level = "conditional";
  }
  return level;
}

/**
 * 추천 공구가: 클라이언트 목표 마진을 보장하는 최소 공구가.
 *   공구가 = (공급가 + 판매자부담 배송비 + 목표마진) ÷ (1 − 총RS%)
 * 1,000원 단위 올림.
 */
export function recommendGongguPrice(params: {
  supplyPrice: number;
  sellerShipping: number;
  targetClientMargin: number;
  totalRsRatePct: number; // KOL + 벤더 합산 %
}): { raw: number; rounded: number } | null {
  const { supplyPrice, sellerShipping, targetClientMargin, totalRsRatePct } = params;
  const rsDecimal = totalRsRatePct / 100;
  if (rsDecimal >= 1 || supplyPrice <= 0) return null;
  const raw = (supplyPrice + sellerShipping + targetClientMargin) / (1 - rsDecimal);
  return { raw, rounded: Math.ceil(raw / 1000) * 1000 };
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
