import Stripe from "stripe";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY.");
  return new Stripe(key, { apiVersion: "2025-08-27.basil" });
}

export const STRIPE_PRODUCTS = {
  tilt: {
    packId: "tilt",
    priceEnv: "STRIPE_PRICE_ID_TILT_PACK",
  },
  clutch: {
    packId: "clutch",
    priceEnv: "STRIPE_PRICE_ID_CLUTCH_PACK",
  },
} as const;

export type PaidPackId = keyof typeof STRIPE_PRODUCTS;

export function getStripePriceIdForPack(packId: string) {
  if (packId === "tilt") {
    const id = process.env.STRIPE_PRICE_ID_TILT_PACK;
    if (!id) throw new Error("Missing STRIPE_PRICE_ID_TILT_PACK.");
    return id;
  }
  if (packId === "clutch") {
    const id = process.env.STRIPE_PRICE_ID_CLUTCH_PACK;
    if (!id) throw new Error("Missing STRIPE_PRICE_ID_CLUTCH_PACK.");
    return id;
  }
  return null;
}

