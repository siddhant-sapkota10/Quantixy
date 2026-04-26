"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/button";
import { PageContent } from "@/components/page-content";
import { AVATARS, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
import { EMOTE_PACKS, type EmotePackId } from "@/lib/cosmetics";
import { getSupabaseClient } from "@/lib/supabase";
import { isAnonymousUser, useSupabaseAuth } from "@/lib/auth";
import { soundManager } from "@/lib/sounds";
import type { CoinShopItem, CoinShopStatus } from "@/lib/coin-shop";

type LoadoutKind = "avatar" | "emote_pack" | "hit_effect" | "avatar_skin" | "title";

type LoadoutItem = {
  id: string;
  name: string;
  description: string;
  kind: LoadoutKind;
  rarity: string;
  preview: string;
  owned: boolean;
  equipped: boolean;
  priceLabel?: string;
  shopItemId?: string;
};

const STARTER_TITLES = [
  { id: "rookie_solver", name: "Rookie Solver", preview: "Rookie", description: "Starter title for new Quantixy players." },
  { id: "speed_demon", name: "Speed Demon", preview: "Speed", description: "Future unlock: fast-answer specialist." },
  { id: "clutch_king", name: "Clutch King", preview: "Clutch", description: "Future unlock: late-game closer." },
  { id: "algebra_assassin", name: "Algebra Assassin", preview: "Algebra", description: "Future unlock: algebra domination." },
];

const KIND_LABEL: Record<LoadoutKind, string> = {
  avatar: "Gameplay Avatar",
  emote_pack: "Emote Pack",
  hit_effect: "Hit Effect",
  avatar_skin: "Avatar Skin",
  title: "Title / Badge",
};

function avatarPortrait(id: string) {
  return `/assets/avatarCards/${normalizeAvatarId(id)}.png`;
}

function getGrantId(item: CoinShopItem) {
  return item.grantId;
}

function buildLoadoutItems(status: CoinShopStatus | null): Record<LoadoutKind, LoadoutItem[]> {
  const ownedAvatars = new Set(status?.owned.avatars ?? ["flash", "shadow", "guardian", "inferno"]);
  const ownedEmotes = new Set(status?.owned.emotePacks ?? ["starter"]);
  const ownedHits = new Set(status?.owned.hitEffects ?? []);
  const ownedSkins = new Set(status?.owned.avatarSkins ?? []);
  const shopItems = status?.items ?? [];
  const shopByGrant = new Map(shopItems.map((item) => [`${item.itemType}:${item.grantId}`, item]));

  const avatarItems: LoadoutItem[] = AVATARS.map((avatar) => {
    const owned = ownedAvatars.has(avatar.id);
    return {
      id: avatar.id,
      name: avatar.name,
      description: avatar.roleLabel ?? avatar.howItPlays ?? avatar.description,
      kind: "avatar",
      rarity: avatar.isPremium ? "premium" : "free",
      preview: avatar.role,
      owned,
      equipped: normalizeAvatarId(status?.equipped.avatar) === avatar.id,
      priceLabel: avatar.isPremium ? "Stripe Premium" : "Free",
    };
  });

  const emoteItems: LoadoutItem[] = EMOTE_PACKS.map((pack) => {
    const shopItem = shopByGrant.get(`emote_pack:${pack.id}`);
    const owned = pack.id === "starter" || ownedEmotes.has(pack.id);
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      kind: "emote_pack",
      rarity: pack.isPremium ? "premium" : "free",
      preview: pack.previewLabel,
      owned,
      equipped: status?.equipped.emotePack === pack.id,
      priceLabel: pack.id === "starter" ? "Free" : shopItem ? `${shopItem.priceCoins} coins` : "Premium",
      shopItemId: shopItem?.id,
    };
  });

  const hitItems: LoadoutItem[] = shopItems
    .filter((item) => item.itemType === "hit_effect")
    .map((item) => {
      const grantId = getGrantId(item);
      return {
        id: grantId,
        name: item.name,
        description: item.description,
        kind: "hit_effect",
        rarity: item.rarity,
        preview: item.preview,
        owned: ownedHits.has(grantId),
        equipped: status?.equipped.hitEffect === grantId,
        priceLabel: `${item.priceCoins} coins`,
        shopItemId: item.id,
      };
    });

  const skinItems: LoadoutItem[] = shopItems
    .filter((item) => item.itemType === "avatar_skin")
    .map((item) => {
      const grantId = getGrantId(item);
      return {
        id: grantId,
        name: item.name,
        description: item.description,
        kind: "avatar_skin",
        rarity: item.rarity,
        preview: item.preview,
        owned: ownedSkins.has(grantId),
        equipped: status?.equipped.avatarSkin === grantId,
        priceLabel: `${item.priceCoins} coins`,
        shopItemId: item.id,
      };
    });

  return {
    avatar: avatarItems,
    emote_pack: emoteItems,
    hit_effect: [
      {
        id: "none",
        name: "Default Impact",
        description: "Clean default damage feedback.",
        kind: "hit_effect",
        rarity: "free",
        preview: "Clean",
        owned: true,
        equipped: !status || status.equipped.hitEffect === "none",
        priceLabel: "Free",
      },
      ...hitItems,
    ],
    avatar_skin: [
      {
        id: "none",
        name: "Base Skin",
        description: "Use your avatar's standard battle look.",
        kind: "avatar_skin",
        rarity: "free",
        preview: "Base",
        owned: true,
        equipped: !status || status.equipped.avatarSkin === "none",
        priceLabel: "Free",
      },
      ...skinItems,
    ],
    title: STARTER_TITLES.map((title, index) => ({
      ...title,
      kind: "title",
      rarity: index === 0 ? "free" : "future",
      owned: index === 0,
      equipped: index === 0,
      priceLabel: index === 0 ? "Free" : "Coming soon",
    })),
  };
}

function LoadoutCard({
  item,
  busy,
  onEquip,
}: {
  item: LoadoutItem;
  busy: boolean;
  onEquip: (item: LoadoutItem) => void;
}) {
  return (
    <motion.article
      layout
      className={`relative flex min-h-[17rem] flex-col overflow-hidden rounded-3xl border p-4 shadow-[0_16px_44px_rgba(2,6,23,0.5)] transition-[border-color,box-shadow,transform] duration-200 ease-out ${
        item.equipped
          ? "border-[rgba(56,189,248,0.45)] bg-gradient-to-b from-cyan-400/[0.12] to-slate-950/92 ring-1 ring-cyan-300/15"
          : "border-white/11 bg-slate-950/88 hover:-translate-y-px hover:border-white/18 hover:shadow-[0_0_22px_rgba(56,189,248,0.1)]"
      }`}
      animate={
        item.equipped
          ? { boxShadow: "0 0 36px rgba(34,211,238,0.14), 0 18px 48px rgba(2,6,23,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-white">{item.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-200/82">{item.description}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
          item.equipped
            ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
            : item.owned
              ? "border-emerald-300/24 bg-emerald-500/10 text-emerald-100"
              : "border-amber-300/24 bg-amber-500/10 text-amber-100"
        }`}>
          {item.equipped ? "Equipped" : item.owned ? "Owned" : "Locked"}
        </span>
      </div>

      <div className="mt-4 flex min-h-[6.5rem] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-[#050a18] to-black/50">
        {item.kind === "avatar" ? (
          <div className="relative h-24 w-20 overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
            <Image src={avatarPortrait(item.id)} alt={`${item.name} preview`} fill sizes="80px" className="object-cover object-top" />
          </div>
        ) : (
          <div className="text-center">
            <p className="text-2xl font-black uppercase tracking-[0.16em] text-cyan-100">{item.preview}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{KIND_LABEL[item.kind]}</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300">{item.priceLabel}</div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300">{item.rarity}</div>
      </div>

      <div className="mt-auto pt-4">
        {item.owned ? (
          <Button className="w-full" variant={item.equipped ? "secondary" : "primary"} disabled={item.equipped || busy} loading={busy} loadingText="Equipping..." onClick={() => onEquip(item)}>
            {item.equipped ? "Equipped" : "Equip"}
          </Button>
        ) : (
          <Link
            href="/shop"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-center text-sm font-black text-amber-100 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
          >
            View in Shop
          </Link>
        )}
      </div>
    </motion.article>
  );
}

export function LoadoutClient() {
  const { user, session, loading: authLoading } = useSupabaseAuth();
  const [status, setStatus] = useState<CoinShopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/coin-shop/status", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const payload = (await response.json()) as CoinShopStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load loadout.");
      setStatus(payload);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load loadout.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, session?.access_token]);

  const groups = useMemo(() => buildLoadoutItems(status), [status]);
  const equippedAvatar = groups.avatar.find((item) => item.equipped) ?? groups.avatar[0];
  const equippedPack = groups.emote_pack.find((item) => item.equipped) ?? groups.emote_pack[0];
  const equippedHit = groups.hit_effect.find((item) => item.equipped) ?? groups.hit_effect[0];
  const equippedSkin = groups.avatar_skin.find((item) => item.equipped) ?? groups.avatar_skin[0];
  const equippedTitle = groups.title.find((item) => item.equipped) ?? groups.title[0];

  const handleEquip = async (item: LoadoutItem) => {
    if (!session?.access_token || !item.owned || item.equipped || busyKey) return;
    if (isAnonymousUser(user)) {
      setError("Guest loadouts are temporary. Sign in to save equipped cosmetics.");
      return;
    }
    setBusyKey(`${item.kind}:${item.id}`);
    setError(null);
    setMessage(null);
    try {
      if (item.kind === "avatar") {
        if (!user?.id) {
          throw new Error("Sign in to save your gameplay avatar.");
        }
        const supabase = getSupabaseClient();
        const { error: updateError } = await supabase
          .from("players")
          .update({ avatar: normalizeAvatarId(item.id) } as never)
          .eq("auth_user_id", user.id);
        if (updateError) throw updateError;
      } else if (item.kind !== "title") {
        const response = await fetch("/api/coin-shop/equip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ itemType: item.kind, itemId: item.id }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? "Unable to equip item.");
      }
      soundManager.play("uiClick", { volume: 0.2, rate: 1.15 });
      setMessage(`Equipped: ${item.name}`);
      await load();
    } catch (equipError) {
      soundManager.play("wrong", { volume: 0.18 });
      setError(equipError instanceof Error ? equipError.message : "Unable to equip item.");
    } finally {
      setBusyKey(null);
    }
  };

  if (!authLoading && !user) {
    return (
      <PageContent size="wide" variant="plain" className="w-full">
        <div className="q-card-strong rounded-3xl p-6 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200">Loadout</p>
          <h1 className="mt-2 text-3xl font-black text-white">Sign in to manage your loadout</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-200/88">Your avatar, emotes, and battle effects are saved to your account.</p>
        </div>
      </PageContent>
    );
  }

  return (
    <PageContent size="wide" variant="plain" className="w-full space-y-8 sm:space-y-10">
      <div className="relative overflow-hidden rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-panel)] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-cyan-300/32 bg-cyan-400/14 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-50">
              Loadout
            </span>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">Your battle kit</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/88 sm:text-base">
              Equip your avatar, emotes, and battle effects here. Buy cosmetics in the Shop, then come back to Loadout to use them.
            </p>
          </div>
          <Link href="/shop" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70">
            Buy Cosmetics in Shop
          </Link>
        </div>

        <div className="q-section-divider mt-8 pt-8">
          <div className="q-panel-strong rounded-[1.75rem] p-4 sm:p-5">
            <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-100/85">Current Loadout</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-200/85">
              What you bring into online matches — change slots below anytime.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Avatar", equippedAvatar?.name],
                ["Skin", equippedSkin?.name],
                ["Emotes", equippedPack?.name],
                ["Hit FX", equippedHit?.name],
                ["Title", equippedTitle?.name],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/12 bg-slate-950/88 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-300/88">{label}</p>
                  <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {message ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">{error}</div> : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-72 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />)}
        </div>
      ) : (
        ([
          ["avatar", "Gameplay Avatar / Character", "Pick who you play as in matches."],
          ["avatar_skin", "Avatar Skin", "Optional visual layer on your equipped avatar."],
          ["emote_pack", "Emote Pack", "Quick reactions and flair during duels."],
          ["hit_effect", "Hit Effect", "Damage feedback when you land hits."],
          ["title", "Title / Badge", "Shown next to your name — more titles coming soon."],
        ] as Array<[LoadoutKind, string, string]>).map(([kind, title, helper]) => (
          <section
            key={kind}
            className="rounded-[2rem] border border-white/11 bg-slate-950/88 p-4 shadow-[0_20px_56px_rgba(2,6,23,0.48),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100/80">Loadout Slot</p>
                <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h2>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-200/82">{helper}</p>
              </div>
              <p className="shrink-0 rounded-full border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-200/90">
                {groups[kind].filter((item) => item.owned).length} owned
              </p>
            </div>
            <div className="mt-6 grid gap-4 border-t border-white/10 pt-6 md:grid-cols-2 xl:grid-cols-3">
              {groups[kind].map((item) => (
                <LoadoutCard
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  busy={busyKey === `${item.kind}:${item.id}`}
                  onEquip={handleEquip}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </PageContent>
  );
}
