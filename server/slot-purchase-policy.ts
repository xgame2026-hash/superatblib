export const SLOT_UNIT_PRICE_USDT = 500;

export const SLOT_PLAN_LIMITS = {
  build: 4,
  accelerate: 10,
  scale: 20,
  business: 100,
} as const;

export type SlotPlanType = keyof typeof SLOT_PLAN_LIMITS;

export type SlotPurchasePolicy = {
  appliesTo: "new_users";
  planType: SlotPlanType | "unknown";
  planName: string;
  maxSlots: number;
  purchasedSlots: number;
  remainingSlots: number;
  unitPriceUsdt: number;
};

export function slotPurchasePolicy(env: Record<string, string>, purchasedSlots = 0): SlotPurchasePolicy {
  const planType = normalizeSlotPlan(env.RPC_PLAN_TYPE || env.RPC_PLAN_NAME);
  const maxSlots = planType === "unknown" ? 0 : SLOT_PLAN_LIMITS[planType];
  const purchased = Math.max(0, Math.floor(purchasedSlots));
  return {
    appliesTo: "new_users",
    planType,
    planName: planType === "unknown" ? "Unknown" : planLabel(planType),
    maxSlots,
    purchasedSlots: purchased,
    remainingSlots: Math.max(0, maxSlots - purchased),
    unitPriceUsdt: SLOT_UNIT_PRICE_USDT,
  };
}

export function normalizeSlotPlan(value?: string): SlotPlanType | "unknown" {
  const normalized = String(value || "").trim().toLowerCase();
  if (/\bbuild\b/.test(normalized) || normalized === "189") return "build";
  if (/\baccelerate\b/.test(normalized) || normalized === "489") return "accelerate";
  if (/\bscale\b/.test(normalized) || normalized === "899") return "scale";
  if (/\bbusiness\b/.test(normalized) || normalized === "2999") return "business";
  return "unknown";
}

function planLabel(plan: SlotPlanType): string {
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;
}
