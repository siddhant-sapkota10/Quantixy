"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/button";
import type { PremiumItem } from "@/lib/premium-items";

export function PurchaseSuccessModal({
  open,
  item,
  confirming,
  error,
  onEquipNow,
  onContinue,
}: {
  open: boolean;
  item: PremiumItem | null;
  confirming: boolean;
  error: string | null;
  onEquipNow?: () => void;
  onContinue: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onContinue}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/85 shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.9 }}
          >
            {/* Premium burst */}
            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.35, 0] }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{
                background:
                  "radial-gradient(circle at 50% 22%, rgba(251,191,36,0.28) 0%, rgba(56,189,248,0.12) 34%, rgba(2,6,23,0) 68%)",
                mixBlendMode: "screen",
              }}
            />
            <div className="pointer-events-none absolute inset-0 opacity-55 [background:radial-gradient(700px_circle_at_18%_10%,rgba(255,255,255,0.10),transparent_40%),radial-gradient(620px_circle_at_80%_18%,rgba(255,255,255,0.06),transparent_46%)]" />

            <div className="relative p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-300">
                    Unlocked
                  </p>
                  <p className="text-sm text-slate-300">
                    {item?.subtitle ?? "Purchase successful."}
                  </p>
                </div>
                {item?.premiumTag ? (
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200">
                    {item.premiumTag}
                  </span>
                ) : null}
              </div>

              {/* Item reveal */}
              <motion.div
                className="mt-6 rounded-[1.6rem] border border-white/10 bg-slate-950/55 p-4"
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.12, duration: 0.35, ease: "easeOut" }}
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
                    {item?.imageSrc ? (
                      <Image
                        src={item.imageSrc}
                        alt={item.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                        priority
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-slate-300">
                        ✨
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-black text-white">{item?.name ?? "Unlocked Item"}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {confirming ? "Confirming purchase…" : error ? "Verification failed" : "Ready"}
                    </p>
                  </div>
                </div>

                {error ? (
                  <p className="mt-3 text-sm text-rose-300">
                    {error}
                  </p>
                ) : null}
              </motion.div>

              {/* CTA */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {item?.equipAction ? (
                  <Button
                    className="w-full"
                    onClick={onEquipNow}
                    disabled={confirming || Boolean(error)}
                    loading={confirming}
                    loadingText="Equipping…"
                  >
                    Equip now
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={onContinue}
                    disabled={confirming}
                    loading={confirming}
                    loadingText="Confirming…"
                  >
                    Claim
                  </Button>
                )}

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={onContinue}
                  disabled={confirming}
                >
                  {item?.equipAction ? "Keep current" : "Continue"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

