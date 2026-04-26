"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/button";
import { PageContent } from "@/components/page-content";
import { isAnonymousUser, useSupabaseAuth } from "@/lib/auth";
import { soundManager } from "@/lib/sounds";
import type { EmotePackId } from "@/lib/cosmetics";
import type { CoinShopItem, CoinShopItemType, CoinShopStatus } from "@/lib/coin-shop";

type Category = "Emote Packs" | "Avatars" | "Hit Effects";

const CATEGORIES: Category[] = ["Emote Packs", "Avatars", "Hit Effects"];
const CATEGORY_META: Record<Category, { icon: string; label: string; description: string }> = {
  "Emote Packs": {
    icon: "💬",
    label: "Emote Packs",
    description: "Taunts and quick chat",
  },
  Avatars: {
    icon: "🛡",
    label: "Avatars",
    description: "Visual skins",
  },
  "Hit Effects": {
    icon: "⚡",
    label: "Hit Effects",
    description: "Battle impact VFX",
  },
};

const RARITY_CLASSES: Record<string, string> = {
  free: "border-emerald-300/30 bg-emerald-500/10 text-emerald-100",
  common: "border-sky-300/25 bg-sky-500/10 text-sky-100",
  rare: "border-violet-300/30 bg-violet-500/10 text-violet-100",
  epic: "border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-100",
  premium: "border-amber-300/35 bg-amber-500/10 text-amber-100",
};

const PREVIEW_CLASSES: Record<CoinShopItemType, string> = {
  emote_pack: "from-cyan-400/22 via-slate-950/88 to-violet-500/16 text-cyan-100",
  avatar_skin: "from-emerald-400/20 via-slate-950/88 to-sky-500/16 text-emerald-100",
  hit_effect: "from-amber-400/22 via-slate-950/88 to-rose-500/16 text-amber-100",
};

const EMPTY_COPY: Record<Category, { title: string; body: string }> = {
  "Emote Packs": {
    title: "All premium packs are already yours",
    body: "Starter is always free. Clutch and Tilt disappear here once owned so you cannot buy duplicates.",
  },
  Avatars: {
    title: "No avatar skins loaded",
    body: "If this stays empty, the coin-shop seed migration has not populated avatar skins yet.",
  },
  "Hit Effects": {
    title: "No hit effects loaded",
    body: "If this stays empty, the coin-shop seed migration has not populated hit effects yet.",
  },
};

function getOwned(status: CoinShopStatus | null, item: CoinShopItem) {
  if (!status) return false;
  if (item.grantId === "starter") return true;
  if (item.itemType === "emote_pack") return status.owned.emotePacks.includes(item.grantId);
  if (item.itemType === "hit_effect") return status.owned.hitEffects.includes(item.grantId);
  return status.owned.avatarSkins.includes(item.grantId);
}

function getEquipped(status: CoinShopStatus | null, item: CoinShopItem) {
  if (!status) return false;
  if (item.itemType === "emote_pack") return status.equipped.emotePack === item.grantId;
  if (item.itemType === "hit_effect") return status.equipped.hitEffect === item.grantId;
  return status.equipped.avatarSkin === item.grantId;
}

function getEquipPayload(item: CoinShopItem) {
  return {
    itemType: item.itemType,
    itemId: item.grantId,
  };
}

export function CoinShopClient() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useSupabaseAuth();
  const [status, setStatus] = useState<CoinShopStatus | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>("Emote Packs");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [buyingStripe, setBuyingStripe] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);

  const loadShop = async () => {
    if (!session?.access_token) {
      setStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/coin-shop/status", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload = (await response.json()) as CoinShopStatus & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load shop.");
      }
      setStatus(payload);
    } catch (shopError) {
      setError(shopError instanceof Error ? shopError.message : "Unable to load shop.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    void loadShop();
  }, [authLoading, session?.access_token]);

  const itemsByCategory = useMemo(() => {
    const items = status?.items ?? [];
    return Object.fromEntries(
      CATEGORIES.map((category) => {
        const categoryItems = items.filter((item) => {
          if (item.category !== category) return false;
          if (item.itemType === "emote_pack" && item.grantId !== "starter") {
            return !getOwned(status, item);
          }
          return true;
        });
        return [category, categoryItems];
      })
    ) as Record<Category, CoinShopItem[]>;
  }, [status]);

  const handlePurchase = async (item: CoinShopItem) => {
    if (!session?.access_token || !status || busyItem) return;
    if (isAnonymousUser(user)) {
      setError("Guest accounts cannot buy shop items. Sign in to keep your inventory.");
      return;
    }

    setBusyItem(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/coin-shop/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ itemId: item.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to buy item.");
      }

      soundManager.play("streak", { volume: 0.26, rate: 1.08 });
      setBurstKey((value) => value + 1);
      setMessage(`${item.name} unlocked.`);
      await loadShop();
    } catch (purchaseError) {
      soundManager.play("wrong", { volume: 0.18 });
      setError(purchaseError instanceof Error ? purchaseError.message : "Unable to buy item.");
    } finally {
      setBusyItem(null);
    }
  };

  const handleEquip = async (item: CoinShopItem) => {
    if (!session?.access_token || !status || busyItem) return;

    setBusyItem(item.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/coin-shop/equip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(getEquipPayload(item)),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to equip item.");
      }

      soundManager.play("uiClick", { volume: 0.18, rate: 1.15 });
      setMessage(`${item.name} equipped.`);
      setStatus((current) => {
        if (!current) return current;
        return {
          ...current,
          equipped: {
            ...current.equipped,
            [item.itemType === "emote_pack" ? "emotePack" : item.itemType === "hit_effect" ? "hitEffect" : "avatarSkin"]:
              item.grantId as EmotePackId,
          },
        };
      });
    } catch (equipError) {
      setError(equipError instanceof Error ? equipError.message : "Unable to equip item.");
    } finally {
      setBusyItem(null);
    }
  };

  const handleStripeCheckout = async (item: CoinShopItem) => {
    if (!session?.access_token || buyingStripe) return;
    if (isAnonymousUser(user)) {
      setError("Guest accounts cannot use checkout. Sign in first.");
      return;
    }

    setBuyingStripe(item.id);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ itemType: "emote_pack", itemId: item.grantId }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to start checkout.");
      }
      window.location.href = payload.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout.");
      setBuyingStripe(null);
    }
  };

  if (!authLoading && !user) {
    return (
      <PageContent size="wide" variant="plain" className="w-full min-w-0 space-y-5">
        <div className="q-card-strong rounded-3xl p-6 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-200">Coin Shop</p>
          <h1 className="mt-3 text-3xl font-black text-white">Sign in to open the shop</h1>
          <p className="mt-2 text-sm text-slate-300">Inventory is account-based so purchases stay safe.</p>
          <Button className="mt-5 w-full sm:w-auto" onClick={() => router.push("/")}>
            Back to Home
          </Button>
        </div>
      </PageContent>
    );
  }

  const walletCoins = status?.wallet.coins ?? 0;
  const currentItems = itemsByCategory[activeCategory] ?? [];
  const allItemsCount = status?.items.length ?? 0;

  return (
    <PageContent
      size="wide"
      variant="plain"
      className="w-full min-w-0 space-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="relative overflow-hidden rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-panel)] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:rounded-3xl sm:p-4 lg:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-95"
          style={{
            background:
              "radial-gradient(circle at 15% 10%, rgba(56,189,248,0.14), transparent 34%), radial-gradient(circle at 88% 12%, rgba(245,158,11,0.10), transparent 30%), linear-gradient(135deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98) 58%, rgba(8,13,30,0.96))",
          }}
        />

        <div className="relative space-y-5">
          <div className="relative overflow-hidden rounded-[1.8rem] border border-white/12 bg-slate-900/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6 lg:p-8">
            {burstKey > 0 ? (
              <motion.div
                key={burstKey}
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: [0, 0.42, 0], scale: [0.96, 1.02, 1.06] }}
                transition={{ duration: 0.72, ease: "easeOut" }}
                style={{
                  background: "radial-gradient(circle at 50% 62%, rgba(250,204,21,0.34), transparent 52%)",
                }}
              />
            ) : null}

            <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
              <div className="space-y-2">
                <span className="inline-flex rounded-full border border-amber-300/28 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-amber-100">
                  Coin Shop
                </span>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">Spend your coins</h1>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-200/88 sm:text-base">
                  Buy cosmetics here, then equip them in Loadout. Premium emote packs reuse the existing Stripe ownership system.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-400/16 to-slate-950/50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Coins</p>
                    <span className="rounded-full border border-amber-200/20 bg-amber-950/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                      Wallet
                    </span>
                  </div>
                  <p className="mt-1 text-3xl font-black tabular-nums text-white">{loading ? "..." : walletCoins}</p>
                  <p className="mt-1 text-xs text-amber-100/70">Earn more from matches and daily rewards.</p>
                </div>
                <div className="grid gap-2">
                  <Button className="h-12" onClick={() => router.push("/shop/coins")}>
                    Buy coins
                  </Button>
                  <Button variant="secondary" className="h-12" onClick={() => router.push("/loadout")}>
                    Go to Loadout
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {message ? (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="sticky top-2 z-20 rounded-[1.65rem] border border-white/12 bg-slate-950/82 p-2 shadow-[0_18px_45px_rgba(2,6,23,0.46)] backdrop-blur-xl sm:static">
            <div className="mb-2 flex items-center justify-between gap-3 px-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100/80">Browse Shop</p>
                <p className="mt-0.5 text-xs text-slate-200/78">Choose a category</p>
              </div>
              <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 sm:inline-flex">
                {activeCategory}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {CATEGORIES.map((category) => (
                <motion.button
                  key={category}
                  type="button"
                  aria-pressed={activeCategory === category}
                  onClick={() => setActiveCategory(category)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.985 }}
                  className={`group rounded-2xl border p-3 text-left transition ${
                    activeCategory === category
                      ? "border-cyan-200/42 bg-cyan-400/14 text-white shadow-[0_0_0_1px_rgba(125,211,252,0.10),0_16px_34px_rgba(8,47,73,0.26),inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border-white/10 bg-slate-900/72 text-slate-300 hover:border-cyan-200/26 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg ${
                        activeCategory === category
                          ? "border-cyan-200/36 bg-cyan-300/14"
                          : "border-white/10 bg-white/[0.04] group-hover:border-cyan-200/24"
                      }`}
                      aria-hidden="true"
                    >
                      {CATEGORY_META[category].icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-black uppercase tracking-[0.18em]">
                          {CATEGORY_META[category].label}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums ${
                            activeCategory === category
                              ? "border-cyan-200/30 bg-cyan-200/12 text-cyan-100"
                              : "border-white/10 bg-white/[0.04] text-slate-400"
                          }`}
                        >
                          {itemsByCategory[category]?.length ?? 0}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-200/75">
                        {CATEGORY_META[category].description}
                      </span>
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {allItemsCount <= 1 && !loading ? (
            <div className="rounded-3xl border border-amber-300/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
              Shop catalog is still warming up. If only Starter appears after refresh, apply the coin-shop migration so Clutch, Tilt, hit effects, and avatar skins are seeded.
            </div>
          ) : null}

          <div className="rounded-[1.65rem] border border-white/10 bg-slate-900/62 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-72 animate-pulse rounded-3xl border border-white/8 bg-white/[0.04]" />
                ))
              ) : currentItems.length > 0 ? (
                currentItems.map((item) => {
                  const owned = getOwned(status, item);
                  const equipped = getEquipped(status, item);
                  const affordable = walletCoins >= item.priceCoins;
                  const busy = busyItem === item.id;
                  const stripeBusy = buyingStripe === item.id;
                  const free = item.priceCoins === 0;

                  return (
                    <motion.article
                      key={item.id}
                      layout
                      className="relative flex min-h-[19rem] flex-col overflow-hidden rounded-3xl border border-white/12 bg-slate-950/90 p-4 shadow-[0_20px_56px_rgba(2,6,23,0.52),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-white/18"
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${PREVIEW_CLASSES[item.itemType]}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-black text-white">{item.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-200/82">{item.description}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${RARITY_CLASSES[item.rarity] ?? RARITY_CLASSES.common}`}>
                          {item.rarity}
                        </span>
                      </div>

                      <div className={`mt-4 flex min-h-[6.5rem] items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br ${PREVIEW_CLASSES[item.itemType]}`}>
                        <div className="text-center">
                          <p className="text-2xl font-black uppercase tracking-[0.16em]">{item.preview}</p>
                          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] opacity-70">
                            {item.itemType === "emote_pack" ? "Emote Pack" : item.itemType === "hit_effect" ? "Hit Effect" : "Avatar Skin"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.16em]">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-slate-300">
                          {free ? "Free" : `${item.priceCoins} coins`}
                        </div>
                        <div className={`rounded-2xl border px-2 py-2 ${owned ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-amber-300/18 bg-amber-500/10 text-amber-100"}`}>
                          {owned ? "Owned" : item.stripeSupported ? "Premium" : "Locked"}
                        </div>
                        <div className={`rounded-2xl border px-2 py-2 ${equipped ? "border-cyan-300/24 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/[0.04] text-slate-300"}`}>
                          {equipped ? "Equipped" : item.grantId === "starter" ? "Default" : "Ready"}
                        </div>
                      </div>

                      <div className="mt-auto space-y-2 pt-4">
                        {owned ? (
                          <Button
                            className="w-full"
                            variant="secondary"
                            onClick={() => router.push("/loadout")}
                          >
                            {equipped ? "Equipped - Open Loadout" : "Manage in Loadout"}
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            disabled={!affordable || busy}
                            loading={busy}
                            loadingText="Buying..."
                            onClick={() => void handlePurchase(item)}
                          >
                            {affordable ? `Buy for ${item.priceCoins}` : "Not Enough Coins"}
                          </Button>
                        )}

                        {!owned && item.stripeSupported ? (
                          <Button
                            className="w-full"
                            variant="secondary"
                            disabled={Boolean(buyingStripe)}
                            loading={stripeBusy}
                            loadingText="Checkout..."
                            onClick={() => void handleStripeCheckout(item)}
                          >
                            Stripe Checkout
                          </Button>
                        ) : null}
                      </div>
                    </motion.article>
                  );
                })
              ) : (
                <div className="q-card-subtle rounded-3xl px-5 py-10 text-center md:col-span-2 xl:col-span-3 2xl:col-span-4">
                  <p className="text-lg font-black text-white">{EMPTY_COPY[activeCategory].title}</p>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-200/82">{EMPTY_COPY[activeCategory].body}</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/11 bg-slate-900/78 p-4 text-xs leading-relaxed text-slate-200/78">
            Purchases are safely saved to your account. Owned premium packs are hidden here to prevent duplicate buys.
          </div>
        </div>
      </div>
    </PageContent>
  );
}
