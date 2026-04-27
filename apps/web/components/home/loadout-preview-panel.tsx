"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/button";
import type { CoinShopStatus } from "@/lib/coin-shop";
import { DEFAULT_AVATAR_ID, normalizeAvatarId } from "@/lib/avatars";
import { getLoadoutLines } from "./lobby-utils";

type LoadoutPreviewPanelProps = {
  shopStatus: CoinShopStatus | null;
  playerAvatarId: string | null;
  loading: boolean;
  onEditLoadout: () => void;
  loadoutBusy: boolean;
};

function avatarSrc(id: string | null) {
  return `/assets/avatarCards/${normalizeAvatarId(id ?? DEFAULT_AVATAR_ID)}.png`;
}

export function LoadoutPreviewPanel({
  shopStatus,
  playerAvatarId,
  loading,
  onEditLoadout,
  loadoutBusy,
}: LoadoutPreviewPanelProps) {
  const reduceMotion = useReducedMotion();
  const lines = getLoadoutLines(shopStatus, playerAvatarId);

  const cells = [
    { label: "Avatar", value: lines.avatarName, thumb: "avatar" as const },
    { label: "Skin", value: lines.skinLabel, thumb: null },
    { label: "Emote pack", value: lines.emoteName, thumb: null },
    { label: "Hit effect", value: lines.hitLabel, thumb: null },
  ];

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-card)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md sm:rounded-3xl sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-200">Current loadout</p>
          <h3 className="mt-1 text-lg font-black text-[var(--qx-text-primary)] sm:text-xl">
            Battle cosmetics
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--qx-text-secondary)] sm:text-sm">
            Equip cosmetics in Loadout to show them in battle.
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 self-start sm:self-center"
          variant="secondary"
          onClick={onEditLoadout}
          loading={loadoutBusy}
          loadingText="Opening…"
        >
          Edit Loadout
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-[#050b18]/80" />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {cells.map((cell) => (
            <div
              key={cell.label}
              className="flex flex-col gap-2 rounded-2xl border border-[var(--qx-border-soft)] bg-[rgba(6,12,28,0.65)] p-3"
            >
              {cell.thumb === "avatar" ? (
                <div className="relative mx-auto aspect-[3/4] w-full max-w-[5.5rem] overflow-hidden rounded-xl border border-cyan-400/20 bg-[#050b18]">
                  <Image src={avatarSrc(playerAvatarId)} alt="" fill sizes="88px" className="object-cover object-top" />
                </div>
              ) : (
                <div className="mx-auto flex aspect-[3/4] w-full max-w-[5.5rem] items-center justify-center rounded-xl border border-[var(--qx-border-soft)] bg-[#050b18]/90">
                  <svg className="h-8 w-8 text-cyan-400/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <path d="M8 12h8M12 8v8" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--qx-text-muted)]">{cell.label}</p>
                <p className="mt-0.5 truncate text-xs font-bold text-[var(--qx-text-primary)]">{cell.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
