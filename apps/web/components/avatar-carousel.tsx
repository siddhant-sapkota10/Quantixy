"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AVATARS, type Avatar, type AvatarId } from "@/lib/avatars";

type AvatarCarouselProps = {
  selectedId: AvatarId;
  savingId?: AvatarId | null;
  disabled?: boolean;
  onFocusChange?: (avatarId: AvatarId) => void;
  onSelect: (avatarId: AvatarId) => void;
};

function clampIndex(index: number, total: number) {
  if (total <= 0) return 0;
  return ((index % total) + total) % total;
}

type CardPose = {
  x: number;
  scale: number;
  rotateY: number;
  opacity: number;
  zIndex: number;
  blur: string;
};

function getPose(offset: number, sideOffset: number, farOffset: number): CardPose {
  if (offset === 0) {
    return {
      x: 0,
      scale: 1,
      rotateY: 0,
      opacity: 1,
      zIndex: 30,
      blur: "blur(0px)"
    };
  }

  if (offset === -1) {
    return {
      x: -sideOffset,
      scale: 0.9,
      rotateY: 14,
      opacity: 0.86,
      zIndex: 20,
      blur: "blur(0.4px)"
    };
  }

  if (offset === 1) {
    return {
      x: sideOffset,
      scale: 0.9,
      rotateY: -14,
      opacity: 0.86,
      zIndex: 20,
      blur: "blur(0.4px)"
    };
  }

  return {
    x: offset < 0 ? -farOffset : farOffset,
    scale: 0.78,
    rotateY: offset < 0 ? 24 : -24,
    opacity: 0,
    zIndex: 10,
    blur: "blur(1.2px)"
  };
}

const ROLE_COLORS: Record<string, { badge: string; accent: string }> = {
  Speed:   { badge: "border-sky-400/40 bg-sky-500/15 text-sky-200",    accent: "bg-sky-400" },
  Disrupt: { badge: "border-violet-400/40 bg-violet-500/15 text-violet-200", accent: "bg-violet-400" },
  Defense: { badge: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200", accent: "bg-emerald-400" },
  Burst:   { badge: "border-rose-400/40 bg-rose-500/15 text-rose-200",  accent: "bg-rose-400" },
};

function AvatarCard({
  avatar,
  isActive,
  isSaving,
  disabled,
  onSelect
}: {
  avatar: Avatar;
  isActive: boolean;
  isSaving: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const roleStyle = ROLE_COLORS[avatar.role] ?? ROLE_COLORS["Speed"];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`relative h-full w-full overflow-hidden rounded-[1.35rem] border px-4 py-4 text-left transition sm:px-5 sm:py-5 ${
        isActive
          ? "border-sky-300/70 bg-slate-950/95 shadow-[0_18px_55px_rgba(2,6,23,0.76)]"
          : "border-slate-700/70 bg-slate-950/72"
      } ${disabled ? "cursor-not-allowed opacity-65 saturate-50" : "active:scale-[0.98]"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60`}
      style={
        isActive
          ? {
              boxShadow: `0 16px 54px rgba(2,6,23,0.8), 0 0 28px ${avatar.theme.glow}`
            }
          : undefined
      }
      aria-pressed={isActive}
      aria-busy={isSaving || undefined}
    >
      {isActive ? (
        <div className="pointer-events-none absolute inset-0 rounded-[1.35rem] ring-2 ring-white/10" />
      ) : null}
      <div
        className="pointer-events-none absolute -right-9 -top-9 h-28 w-28 rounded-full opacity-35 blur-2xl"
        style={{ background: avatar.theme.accent }}
      />

      {/* Header: role badge + icon */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <span
            className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] ${roleStyle.badge}`}
          >
            {avatar.role}
          </span>
          <h3 className="mt-1.5 text-xl font-black text-white sm:text-2xl">{avatar.name}</h3>
        </div>
        <div className="text-4xl leading-none sm:text-5xl" aria-hidden="true">
          {avatar.icon}
        </div>
      </div>

      {/* Passive / playstyle */}
      <div className="relative z-10 mt-3 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">Playstyle</p>
        <p className="mt-1 min-h-[2.25rem] text-[11px] leading-relaxed text-slate-300">{avatar.passive}</p>
      </div>

      {/* Ultimate ability */}
      <div className="relative z-10 mt-2.5 rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${roleStyle.accent}`}
          />
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">Signature Ultimate</p>
        </div>
        <p className="mt-1 text-sm font-bold text-white">{avatar.ultimateName}</p>
        <p className="mt-1 min-h-[2rem] text-[11px] leading-relaxed text-slate-300">{avatar.ultimateDescription}</p>
      </div>

      <div className="relative z-10 mt-3 flex min-h-[1.5rem] items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
            isActive
              ? "border border-sky-300/40 bg-sky-500/20 text-sky-100"
              : "border border-slate-700/70 bg-slate-900/70 text-slate-300"
          }`}
        >
          {isSaving ? "Saving..." : isActive ? "Equipped" : "Equip"}
        </span>
      </div>
    </button>
  );
}

export function AvatarCarousel({
  selectedId,
  savingId = null,
  disabled = false,
  onFocusChange,
  onSelect
}: AvatarCarouselProps) {
  const selectedIndex = useMemo(
    () => Math.max(0, AVATARS.findIndex((avatar) => avatar.id === selectedId)),
    [selectedId]
  );
  const [focusIndex, setFocusIndex] = useState(selectedIndex);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setFocusIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    const focusedAvatarId = AVATARS[focusIndex]?.id;
    if (focusedAvatarId) {
      onFocusChange?.(focusedAvatarId);
    }
  }, [focusIndex, onFocusChange]);

  useEffect(() => {
    const updateLayout = () => {
      setIsMobile(window.innerWidth < 640);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  const sideOffset = isMobile ? 132 : 184;
  const farOffset = isMobile ? 214 : 300;

  const goPrev = () => {
    setFocusIndex((current) => clampIndex(current - 1, AVATARS.length));
  };

  const goNext = () => {
    setFocusIndex((current) => clampIndex(current + 1, AVATARS.length));
  };

  const focusedAvatar = AVATARS[focusIndex] ?? AVATARS[0];

  return (
    <div className="w-full">
      <div
        className="relative mx-auto w-full max-w-3xl"
        role="region"
        aria-label="Character selection"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            goPrev();
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            goNext();
          }
        }}
        tabIndex={0}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[1.8rem] border border-slate-800/80 bg-gradient-to-b from-slate-900/42 via-slate-950/30 to-slate-950/55" />

        <motion.div
          className="relative h-[26rem] overflow-hidden px-2 pt-4 sm:h-[28rem] sm:px-4 sm:pt-5"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.08}
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.x) < 36) return;
            if (info.offset.x < 0) {
              goNext();
            } else {
              goPrev();
            }
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-800/70" />
          <div className="relative h-full [perspective:1000px]">
            {AVATARS.map((avatar, index) => {
              const offset = index - focusIndex;
              const wrappedOffset =
                offset > AVATARS.length / 2
                  ? offset - AVATARS.length
                  : offset < -AVATARS.length / 2
                    ? offset + AVATARS.length
                    : offset;
              const pose = getPose(wrappedOffset, sideOffset, farOffset);
              const isActive = avatar.id === focusedAvatar.id;

              return (
                <div
                  key={avatar.id}
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ zIndex: pose.zIndex }}
                >
                  <motion.div
                    className="pointer-events-auto h-[21.75rem] w-[min(92vw,18.1rem)] sm:h-[23.75rem] sm:w-[19.4rem]"
                    animate={{
                      x: pose.x,
                      scale: pose.scale,
                      rotateY: pose.rotateY,
                      opacity: pose.opacity
                    }}
                    transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.88 }}
                    style={{ filter: pose.blur }}
                  >
                    <AvatarCard
                      avatar={avatar}
                      isActive={isActive}
                      isSaving={savingId === avatar.id}
                      disabled={disabled}
                      onSelect={() => {
                        setFocusIndex(index);
                        onSelect(avatar.id);
                      }}
                    />
                  </motion.div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <div className="relative z-20 mt-3 flex items-center justify-between gap-3 px-2 pb-5 sm:px-4 sm:pb-6">
          <button
            type="button"
            onClick={goPrev}
            disabled={disabled}
            className="h-11 min-w-[3rem] rounded-xl border border-slate-700 bg-slate-950/82 px-3 text-base font-semibold text-slate-100 transition-all duration-150 ease-out hover:border-slate-500 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 disabled:cursor-not-allowed disabled:opacity-55 disabled:saturate-50"
            aria-label="Previous character"
          >
            {"<"}
          </button>

          <div className="min-w-0 flex-1 space-y-2 text-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={focusedAvatar.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="truncate text-xs uppercase tracking-[0.24em] text-slate-300 sm:text-sm"
              >
                {focusedAvatar.name} — {focusedAvatar.role}
              </motion.p>
            </AnimatePresence>
            <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
              {AVATARS.map((avatar) => {
                const isFocused = avatar.id === focusedAvatar.id;
                return (
                  <span
                    key={avatar.id}
                    className={`h-1.5 rounded-full transition-all ${
                      isFocused ? "w-5 bg-sky-300" : "w-1.5 bg-slate-600"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={disabled}
            className="h-11 min-w-[3rem] rounded-xl border border-slate-700 bg-slate-950/82 px-3 text-base font-semibold text-slate-100 transition-all duration-150 ease-out hover:border-slate-500 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 disabled:cursor-not-allowed disabled:opacity-55 disabled:saturate-50"
            aria-label="Next character"
          >
            {">"}
          </button>
        </div>
      </div>
    </div>
  );
}
