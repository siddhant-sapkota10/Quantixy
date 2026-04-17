import { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

export function PageShell({ children, className }: PageShellProps) {
  return (
    <main
      className={cn(
        "relative min-h-screen bg-hero-grid px-3 py-4 text-textPrimary sm:px-6 sm:py-8 lg:px-8 lg:py-10",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-28 h-[46vh] min-h-[260px] bg-[radial-gradient(circle_at_20%_0%,rgba(0,212,255,0.2),transparent_64%),radial-gradient(circle_at_80%_0%,rgba(138,46,255,0.18),transparent_62%)] blur-2xl"
      />
      <Link
        href="/"
        aria-label="Quantixy home"
        className="group absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 backdrop-blur transition-colors hover:bg-slate-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:left-6 sm:top-6"
      >
        <span className="relative h-6 w-6 overflow-hidden rounded-lg">
          <Image
            src="/assets/quantixytransparent.png"
            alt="Quantixy"
            fill
            sizes="24px"
            className="object-contain opacity-90 transition-opacity group-hover:opacity-100"
            priority={false}
          />
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.28em] text-slate-200/90">
          Quantixy
        </span>
      </Link>
      {children}
    </main>
  );
}
