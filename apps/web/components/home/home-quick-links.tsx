"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { DEFAULT_AVATAR_ID, normalizeAvatarId } from "@/lib/avatars";
import { cn } from "@/lib/utils";

function avatarSrc(id: string | null) {
  return `/assets/avatarCards/${normalizeAvatarId(id ?? DEFAULT_AVATAR_ID)}.png`;
}

export type HomeQuickLinkId = "shop" | "loadout" | "profile" | "leaderboard" | "upgrade";

type HomeQuickLinksProps = {
  onNavigate: (id: HomeQuickLinkId) => void;
  busy: HomeQuickLinkId | null;
  profileAvatarId: string | null;
  isGuest?: boolean;
};

const MEMBER_LINKS: Array<{
  id: Exclude<HomeQuickLinkId, "upgrade">;
  label: string;
  desc: string;
  accent?: boolean;
  icon: "shop" | "loadout" | "profile" | "trophy";
}> = [
  { id: "shop", label: "Shop", desc: "Buy cosmetics with coins", accent: true, icon: "shop" },
  { id: "loadout", label: "Loadout", desc: "Equip owned items", icon: "loadout" },
  { id: "profile", label: "Profile", desc: "Stats & history", icon: "profile" },
  { id: "leaderboard", label: "Leaderboard", desc: "See top players", icon: "trophy" },
];

const GUEST_LINKS: Array<{
  id: HomeQuickLinkId;
  label: string;
  desc: string;
  accent?: boolean;
  icon: "shop" | "loadout" | "profile" | "trophy";
}> = [
  { id: "shop", label: "Shop", desc: "Browse cosmetics", accent: true, icon: "shop" },
  { id: "loadout", label: "Loadout", desc: "Preview your kit", icon: "loadout" },
  { id: "leaderboard", label: "Leaderboard", desc: "See top players", icon: "trophy" },
  { id: "upgrade", label: "Upgrade", desc: "Save progress & stats", icon: "profile" },
];

type QuickIcon = (typeof MEMBER_LINKS)[number]["icon"];

function Icon({ name }: { name: QuickIcon }) {
  const cls = "h-5 w-5";
  if (name === "shop") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 7h12l-1 13H7L6 7z" />
        <path d="M9 7a3 3 0 016 0" />
      </svg>
    );
  }
  if (name === "loadout") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 4h14l-2 16H7L5 4zM9 8h6M8 12h8" />
      </svg>
    );
  }
  if (name === "trophy") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 9H4a2 2 0 010-4h2m12 4h2a2 2 0 000-4h-2M7 4h10v6a5 5 0 01-10 0V4zm5 11v4m-4 0h8" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
    </svg>
  );
}

export function HomeQuickLinks({ onNavigate, busy, profileAvatarId, isGuest }: HomeQuickLinksProps) {
  const reduceMotion = useReducedMotion();
  const links = isGuest ? GUEST_LINKS : MEMBER_LINKS;

  return (
    <div className="rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-card)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-md sm:rounded-3xl sm:p-5">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.26em] text-cyan-200/90">Quick links</p>
      <div className="flex flex-col gap-2">
        {links.map((item) => {
          const isBusy = busy === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              disabled={Boolean(busy)}
              whileHover={busy || reduceMotion ? undefined : { x: 1 }}
              whileTap={busy || reduceMotion ? undefined : { scale: 0.99 }}
              className={cn(
                "qx-card-interactive flex min-h-[4.25rem] w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 disabled:opacity-60 sm:px-4",
                item.accent
                  ? "border-amber-400/20 bg-amber-500/[0.06]"
                  : "border-[var(--qx-border-soft)] bg-[rgba(6,12,28,0.55)]"
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-cyan-100/90",
                  item.accent ? "border-amber-300/25 bg-amber-500/10 text-amber-100" : "border-cyan-400/15 bg-cyan-500/10"
                )}
              >
                {item.id === "profile" ? (
                  <span className="relative block h-7 w-7 overflow-hidden rounded-lg border border-white/10">
                    <Image src={avatarSrc(profileAvatarId)} alt="" fill sizes="28px" className="object-cover" />
                  </span>
                ) : (
                  <Icon name={item.icon} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-bold text-[var(--qx-text-primary)]">{item.label}</span>
                  {isBusy ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-200" /> : null}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--qx-text-secondary)]">{item.desc}</span>
              </span>
              <svg className="h-5 w-5 shrink-0 text-cyan-400/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
