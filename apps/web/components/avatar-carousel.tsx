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
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`relative h-full w-full overflow-hidden rounded-[1.35rem] border px-4 py-4 text-left transition sm:px-5 sm:py-5 ${
        isActive
          ? "border-sky-300/70 bg-slate-950/95 shadow-[0_18px_55px_rgba(2,6,23,0.76)]"
          : "border-slate-700/70 bg-slate-950/72"
      } ${disabled ? "cursor-not-allowed opacity-80" : ""}`}
      style={
        isActive
          ? {
              boxShadow: `0 16px 54px rgba(2,6,23,0.8), 0 0 28px ${avatar.theme.glow}`
            }
          : undefined
      }
      aria-pressed={isActive}
    >
      {isActive ? (
        <div className="pointer-events-none absolute inset-0 rounded-[1.35rem] ring-2 ring-white/10" />
      ) : null}
      <div
        className="pointer-events-none absolute -right-9 -top-9 h-28 w-28 rounded-full opacity-35 blur-2xl"
        style={{ background: avatar.theme.accent }}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{avatar.role}</p>
          <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{avatar.name}</h3>
        </div>
        <div className="text-4xl leading-none sm:text-5xl" aria-hidden="true">
          {avatar.icon}
        </div>
      </div>

      <p className="relative z-10 mt-3 min-h-[2.5rem] text-xs text-slate-300 sm:text-sm">{avatar.description}</p>

      <div className="relative z-10 mt-4 rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Ultimate</p>
        <p className="mt-1 text-sm font-semibold text-white">{avatar.ultimateName}</p>
        <p className="mt-1 min-h-[2rem] text-xs text-slate-300">{avatar.ultimateDescription}</p>
      </div>

      <div className="relative z-10 mt-4 flex min-h-[1.5rem] items-center justify-between">
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
        aria-label="Avatar carousel"
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
          className="relative h-[23.5rem] overflow-hidden px-2 pt-4 sm:h-[25.5rem] sm:px-4 sm:pt-5"
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
                    className="pointer-events-auto h-[19.25rem] w-[min(92vw,18.1rem)] sm:h-[21.25rem] sm:w-[19.4rem]"
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
            className="h-11 min-w-[3rem] rounded-xl border border-slate-700 bg-slate-950/82 px-3 text-base font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Previous avatar"
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
                {focusedAvatar.name} - {focusedAvatar.role}
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
            className="h-11 min-w-[3rem] rounded-xl border border-slate-700 bg-slate-950/82 px-3 text-base font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Next avatar"
          >
            {">"}
          </button>
        </div>
      </div>
    </div>
  );
}
