"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV, isDashboardNavActive } from "@/lib/dashboard-nav";

export function DashboardMobileNav({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Mobile main navigation"
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 rounded-[1.25rem] border border-[var(--qx-border-soft)] bg-[rgba(6,12,28,0.94)] p-1.5 shadow-[0_22px_60px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl md:hidden"
    >
      <div className="grid grid-cols-6 gap-0.5">
        {DASHBOARD_NAV.map((item) => {
          const active = isDashboardNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                active
                  ? "bg-cyan-500/18 text-cyan-100 ring-1 ring-cyan-400/28"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
              )}
            >
              <svg
                className="h-4 w-4"
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
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
