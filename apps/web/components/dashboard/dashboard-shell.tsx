"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV, isDashboardNavActive } from "@/lib/dashboard-nav";
import { DashboardWallet } from "@/components/dashboard/dashboard-wallet";
import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";

export function DashboardShell({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "relative isolate flex min-h-[100dvh] min-h-screen w-full max-w-[100vw] min-w-0 flex-col overflow-x-hidden",
        className
      )}
    >
      <header className="sticky top-0 z-50 border-b border-[var(--qx-border-soft)] bg-[rgba(2,6,23,0.82)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-[min(92rem,calc(100vw-1rem))] grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] items-center gap-2 px-3 py-2 pt-[max(0.35rem,env(safe-area-inset-top))] sm:gap-3 sm:px-6 sm:py-2.5 lg:px-10 xl:px-12">
          <Link
            href="/"
            aria-label="Quantixy home"
            className="group inline-flex min-w-0 max-w-[40vw] items-center gap-2 rounded-xl py-1 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          >
            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg sm:h-9 sm:w-9">
              <Image
                src="/assets/quantixytransparent.png"
                alt=""
                fill
                sizes="36px"
                className="object-contain"
                priority
              />
            </span>
            <span className="truncate text-[11px] font-black uppercase tracking-[0.2em] text-[var(--qx-text-primary)] sm:text-xs">
              Quantixy
            </span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden min-w-0 justify-self-center md:flex"
          >
            <div className="flex max-w-[min(52rem,calc(100vw-12rem))] flex-wrap justify-center gap-0.5 rounded-2xl border border-[var(--qx-border-soft)] bg-[rgba(6,12,28,0.92)] p-1 shadow-[0_18px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
              {DASHBOARD_NAV.map((item) => {
                const active = isDashboardNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-[9px] font-black uppercase tracking-[0.1em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 lg:px-2.5 lg:text-[10px] xl:tracking-[0.14em]",
                      active
                        ? "bg-cyan-500/15 text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(34,211,238,0.12)] ring-1 ring-cyan-400/30"
                        : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    <svg
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d={item.icon} />
                    </svg>
                    <span className="max-w-[5.5rem] truncate lg:max-w-none">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="flex shrink-0 items-center justify-end justify-self-end gap-2">
            <DashboardWallet />
          </div>
        </div>
      </header>

      <main className="qx-dashboard-main mx-auto w-full min-w-0 flex-1">{children}</main>

      <DashboardMobileNav pathname={pathname} />
    </div>
  );
}
