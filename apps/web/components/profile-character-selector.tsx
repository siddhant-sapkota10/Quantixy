"use client";

import Image from "next/image";
import { useMemo } from "react";
import { AVATARS, type AvatarId } from "@/lib/avatars";
import { Button } from "@/components/button";

type ProfileCharacterSelectorProps = {
  selectedId: AvatarId;
  previewId: AvatarId;
  savingId?: AvatarId | null;
  disabled?: boolean;
  ownedAvatarIds?: AvatarId[];
  onBuyPremiumAvatar?: (avatarId: "architect" | "titan") => void;
  onPreviewChange: (avatarId: AvatarId) => void;
  onSelect: (avatarId: AvatarId) => void;
};

const THEME: Record<AvatarId, { ring: string; glow: string; badge: string }> = {
  flash: {
    ring: "ring-amber-300/40",
    glow: "shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
    badge: "border-amber-300/30 bg-amber-500/10 text-amber-200",
  },
  guardian: {
    ring: "ring-sky-300/40",
    glow: "shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
    badge: "border-sky-300/30 bg-sky-500/10 text-sky-200",
  },
  inferno: {
    ring: "ring-rose-300/35",
    glow: "shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
    badge: "border-rose-300/30 bg-rose-500/10 text-rose-200",
  },
  shadow: {
    ring: "ring-violet-300/35",
    glow: "shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
    badge: "border-violet-300/30 bg-violet-500/10 text-violet-200",
  },
  architect: {
    ring: "ring-amber-300/40",
    glow: "shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
    badge: "border-amber-300/30 bg-amber-500/10 text-amber-200",
  },
  titan: {
    ring: "ring-amber-300/45",
    glow: "shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
    badge: "border-amber-300/35 bg-amber-500/10 text-amber-200",
  },
};

function getAvatarImageSrc(id: AvatarId) {
  return `/assets/avatarCards/${id}.png`;
}

export function ProfileCharacterSelector({
  selectedId,
  previewId,
  savingId = null,
  disabled = false,
  ownedAvatarIds = [],
  onBuyPremiumAvatar,
  onPreviewChange,
  onSelect,
}: ProfileCharacterSelectorProps) {
  const previewAvatar = useMemo(() => AVATARS.find((a) => a.id === previewId) ?? AVATARS[0], [previewId]);
  const theme = THEME[previewAvatar.id];
  const ownedSet = useMemo(() => new Set(ownedAvatarIds), [ownedAvatarIds]);
  const isOwned = (id: AvatarId) => ownedSet.has(id);
  const isPremiumLocked = Boolean(previewAvatar.isPremium) && !isOwned(previewAvatar.id);
  const showPremiumCta = isPremiumLocked && (previewAvatar.id === "architect" || previewAvatar.id === "titan");

  return (
    <div
      className="q-card-strong min-w-0 rounded-3xl p-4 sm:p-6"
      onMouseLeave={() => {
        onPreviewChange(selectedId);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onPreviewChange(selectedId);
        }
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full border border-white/[0.07] bg-slate-950/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300/80">
            Character Loadout
          </span>
          <p className="text-sm text-slate-400">
            Your character defines your gameplay identity and includes a signature ultimate.
          </p>
        </div>

        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${THEME[selectedId].badge}`}>
          Equipped: {AVATARS.find((a) => a.id === selectedId)?.name ?? "Character"}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.65fr] lg:items-stretch">
        {/* Selected / preview hero card */}
        <div
          className={`q-card relative overflow-hidden rounded-[1.8rem] p-4 sm:p-5 ${theme.glow}`}
        >
          <div className="relative grid min-w-0 gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:items-start">
            <div
              className={`relative mx-auto w-full max-w-[min(100%,320px)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 ring-1 ${theme.ring} aspect-[4/5] md:mx-0 md:aspect-[3/4] md:max-h-[min(70vh,426px)] md:max-w-none md:min-h-[280px]`}
            >
              <Image
                src={getAvatarImageSrc(previewAvatar.id)}
                alt={`${previewAvatar.name} avatar`}
                fill
                sizes="(max-width: 768px) 90vw, 320px"
                priority={false}
                className="object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-white">{previewAvatar.name}</p>
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300/90">
                    {previewAvatar.roleLabel ?? previewAvatar.role}
                  </p>
                </div>
                {savingId === previewAvatar.id ? (
                  <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
                    Saving…
                  </span>
                ) : selectedId === previewAvatar.id ? (
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${THEME[previewAvatar.id].badge}`}>
                    Equipped
                  </span>
                ) : previewAvatar.isPremium ? (
                  <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
                    Premium
                  </span>
                ) : null}
              </div>
            </div>

            <div className="relative min-w-0 space-y-4 md:flex md:max-h-[min(70vh,426px)] md:flex-col md:space-y-3">
              <div className="min-w-0 space-y-4 md:flex-1 md:overflow-y-auto md:pr-1 [scrollbar-width:thin]">
                {previewAvatar.premiumTagline ? (
                  <div className="rounded-2xl border border-amber-400/[0.12] bg-amber-500/[0.05] px-4 py-3 shadow-[inset_0_1px_0_rgba(251,191,36,0.06)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-200/90">
                        Premium
                      </p>
                      {typeof previewAvatar.priceUsd === "number" ? (
                        <p className="text-[11px] font-bold tabular-nums text-amber-200/90">
                          ${previewAvatar.priceUsd.toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-amber-100">{previewAvatar.premiumTagline}</p>
                    <p className="mt-1 text-[11px] text-amber-200/80">Premium character unlock.</p>
                  </div>
                ) : null}

                <div className="q-card-subtle rounded-2xl px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400/65">Overview</p>
                    <span className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                      {previewAvatar.roleLabel ?? previewAvatar.role}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-200">Identity</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    {previewAvatar.description}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-slate-200">Playstyle</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    {previewAvatar.passive}
                  </p>
                </div>

                <div className="q-card-subtle rounded-2xl px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400/65">
                      Ultimate (included)
                    </p>
                    <span className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                      {previewAvatar.ultimateId.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-bold text-white">{previewAvatar.ultimateName}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    {previewAvatar.ultimateDescription}
                  </p>
                </div>
              </div>

              {/* Contextual CTA (pinned so Buy is always visible) */}
              <div className="q-card-subtle rounded-2xl px-4 py-4 md:mt-auto">
                {isPremiumLocked ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">Buy {previewAvatar.name}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Preview everything freely. Equip after purchase.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          if (!showPremiumCta) return;
                          if (previewAvatar.id === "architect" || previewAvatar.id === "titan") {
                            onBuyPremiumAvatar?.(previewAvatar.id);
                          }
                        }}
                        disabled={!showPremiumCta}
                      >
                        Buy now
                      </Button>
                    </div>
                  </div>
                ) : selectedId === previewAvatar.id ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">Equipped</p>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${THEME[previewAvatar.id].badge}`}>
                      Active
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">Equip {previewAvatar.name}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Set this character as your loadout.</p>
                    </div>
                    <Button onClick={() => onSelect(previewAvatar.id)} disabled={disabled || savingId === previewAvatar.id}>
                      Equip
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Compact selector */}
        <div
          className="q-card rounded-[1.8rem] p-3 sm:p-4"
        >
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500/70">
            Select Character
          </p>

          <div className="grid gap-2">
            {AVATARS.map((avatar) => {
              const isSelected = avatar.id === selectedId;
              const isPreview = avatar.id === previewId;
              const isSaving = savingId === avatar.id;
              const cardTheme = THEME[avatar.id];
              const premium = Boolean(avatar.isPremium);
              const owned = isOwned(avatar.id);
              const locked = premium && !owned;

              return (
                <button
                  key={avatar.id}
                  type="button"
                  disabled={disabled || isSaving}
                  onMouseEnter={() => onPreviewChange(avatar.id)}
                  onFocus={() => onPreviewChange(avatar.id)}
                  onClick={() => {
                    // Locked premium avatars are still fully previewable; equipping is gated elsewhere.
                    if (locked) {
                      onPreviewChange(avatar.id);
                      return;
                    }
                    onSelect(avatar.id);
                  }}
                  className={`group relative flex min-h-[74px] w-full items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                    isSelected
                      ? `border-white/[0.12] bg-slate-900/50 shadow-[0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ${cardTheme.ring}`
                      : isPreview
                        ? "border-white/[0.10] bg-slate-900/38"
                        : "border-slate-500/20 bg-slate-950/48 hover:border-slate-400/35 hover:bg-slate-900/62"
                  } ${disabled ? "cursor-not-allowed opacity-60" : "active:scale-[0.99]"}`}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/[0.07] bg-slate-950/50">
                    <Image
                      src={getAvatarImageSrc(avatar.id)}
                      alt={`${avatar.name} avatar`}
                      width={192}
                      height={192}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{avatar.name}</p>
                        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                          Ultimate: {avatar.ultimateName}
                        </p>
                      </div>

                      {isSaving ? (
                        <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
                          Saving…
                        </span>
                      ) : isSelected ? (
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${cardTheme.badge}`}>
                          Equipped
                        </span>
                      ) : locked ? (
                        <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
                          Locked · Premium
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
                          Equip
                        </span>
                      )}
                    </div>

                    {premium ? (
                      <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200/90">
                        Premium{typeof avatar.priceUsd === "number" ? ` · $${avatar.priceUsd.toFixed(2)}` : ""}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
