import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { PageContent } from "@/components/page-content";
import { cn } from "@/lib/utils";

export default function CoinsCancelPage() {
  return (
    <PageShell className="flex items-start justify-center sm:items-center">
      <PageContent size="wide" variant="plain" className="w-full min-w-0">
        <div className="q-card-strong rounded-3xl p-6 text-center sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-amber-200">Checkout Cancelled</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">No worries</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-200/85 sm:text-base">
            You can buy coins anytime.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/shop/coins"
              className={cn(
                "inline-flex min-h-12 items-center justify-center rounded-xl border border-cyan-200/35 bg-[linear-gradient(120deg,rgba(56,199,232,0.92),rgba(124,92,255,0.88))] px-6 py-3 text-base font-semibold text-slate-950 shadow-[0_0_0_1px_rgba(136,170,220,0.28),0_14px_34px_rgba(7,12,31,0.52),0_0_24px_rgba(99,102,241,0.35)] transition hover:brightness-[1.06] sm:w-auto"
              )}
            >
              Try again
            </Link>
            <Link
              href="/shop"
              className={cn(
                "inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-6 py-3 text-base font-semibold text-[var(--qx-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_26px_rgba(3,7,20,0.45)] transition hover:border-cyan-400/22 hover:bg-[var(--qx-card-hover)] hover:shadow-[0_0_20px_rgba(34,211,238,0.08),inset_0_1px_0_rgba(255,255,255,0.07)] sm:w-auto"
              )}
            >
              Back to shop
            </Link>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}

