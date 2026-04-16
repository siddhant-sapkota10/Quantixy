"use client";

import Image from "next/image";
import { useMemo } from "react";
import { AVATARS, type AvatarId } from "@/lib/avatars";

type ProfileCharacterSelectorProps = {
  selectedId: AvatarId;
  previewId: AvatarId;
  savingId?: AvatarId | null;
  disabled?: boolean;
  onPreviewChange: (avatarId: AvatarId) => void;
  onSelect: (avatarId: AvatarId) => void;
};

const THEME: Record<AvatarId, { ring: string; glow: string; badge: string; subtleBg: string }> = {
  flash: {
    ring: "ring-amber-300/40",
    glow: "shadow-[0_0_40px_rgba(250,204,21,0.18)]",
    badge: "border-amber-300/30 bg-amber-500/10 text-amber-200",
    subtleBg: "from-amber-500/15 via-amber-500/5",
  },
  guardian: {
    ring: "ring-sky-300/40",
    glow: "shadow-[0_0_40px_rgba(56,189,248,0.18)]",
    badge: "border-sky-300/30 bg-sky-500/10 text-sky-200",
    subtleBg: "from-sky-500/15 via-sky-500/5",
  },
  inferno: {
    ring: "ring-rose-300/35",
    glow: "shadow-[0_0_40px_rgba(251,113,133,0.18)]",
    badge: "border-rose-300/30 bg-rose-500/10 text-rose-200",
    subtleBg: "from-rose-500/15 via-rose-500/5",
  },
  shadow: {
    ring: "ring-violet-300/35",
    glow: "shadow-[0_0_40px_rgba(167,139,250,0.18)]",
    badge: "border-violet-300/30 bg-violet-500/10 text-violet-200",
    subtleBg: "from-violet-500/15 via-violet-500/5",
  },
};

function getAvatarImageSrc(id: AvatarId) {
  return `/assets/avatarCards/${id}.png`;
}

function firstSentence(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const dot = trimmed.indexOf(".");
  if (dot === -1) return trimmed;
  return trimmed.slice(0, dot + 1);
}

export function ProfileCharacterSelector({
  selectedId,
  previewId,
  savingId = null,
  disabled = false,
  onPreviewChange,
  onSelect,
}: ProfileCharacterSelectorProps) {
  const previewAvatar = useMemo(() => AVATARS.find((a) => a.id === previewId) ?? AVATARS[0], [previewId]);
  const theme = THEME[previewAvatar.id];

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300">
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
          className={`relative overflow-hidden rounded-[1.8rem] border border-slate-800 bg-gradient-to-b ${theme.subtleBg} to-slate-950/60 p-4 sm:p-5 ${theme.glow}`}
        >
          <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(600px_circle_at_20%_15%,rgba(255,255,255,0.08),transparent_40%),radial-gradient(520px_circle_at_70%_10%,rgba(255,255,255,0.05),transparent_46%)]" />

          <div className="relative grid gap-4 md:grid-cols-[240px_1fr] md:items-center">
            <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 ring-1 ${theme.ring}`}>
              <Image
                src={getAvatarImageSrc(previewAvatar.id)}
                alt={`${previewAvatar.name} avatar`}
                width={800}
                height={800}
                priority={false}
                className="h-auto w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-white">{previewAvatar.name}</p>
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300/90">
                    {previewAvatar.role}
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
                ) : null}
              </div>
            </div>

            <div className="relative space-y-4">
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
                  Playstyle
                </p>
                <p className="mt-2 text-sm text-slate-200">
                  {firstSentence(previewAvatar.passive)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
                    Ultimate (included)
                  </p>
                  <span className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                    {previewAvatar.ultimateId.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-2 text-base font-bold text-white">{previewAvatar.ultimateName}</p>
                <p className="mt-1 text-sm text-slate-300">{previewAvatar.ultimateDescription}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Compact selector */}
        <div className="rounded-[1.8rem] border border-slate-800 bg-slate-950/40 p-3 sm:p-4">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            Select Character
          </p>

          <div className="grid gap-2">
            {AVATARS.map((avatar) => {
              const isSelected = avatar.id === selectedId;
              const isPreview = avatar.id === previewId;
              const isSaving = savingId === avatar.id;
              const cardTheme = THEME[avatar.id];

              return (
                <button
                  key={avatar.id}
                  type="button"
                  disabled={disabled || isSaving}
                  onMouseEnter={() => onPreviewChange(avatar.id)}
                  onFocus={() => onPreviewChange(avatar.id)}
                  onClick={() => onSelect(avatar.id)}
                  className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                    isSelected
                      ? `border-white/15 bg-slate-900/70 ring-1 ${cardTheme.ring}`
                      : isPreview
                        ? "border-slate-600/80 bg-slate-900/55"
                        : "border-slate-800 bg-slate-950/55 hover:border-slate-600 hover:bg-slate-900/50"
                  } ${disabled ? "cursor-not-allowed opacity-60" : "active:scale-[0.99]"}`}
                >
                  <div className={`pointer-events-none absolute inset-0 opacity-70 bg-gradient-to-r ${cardTheme.subtleBg} to-transparent`} />

                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
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
                      ) : (
                        <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
                          Equip
                        </span>
                      )}
                    </div>
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

