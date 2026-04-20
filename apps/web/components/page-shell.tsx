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
        "relative flex min-h-[100dvh] min-h-screen w-full max-w-[100vw] min-w-0 overflow-x-hidden bg-hero-grid px-3 pb-6 pt-14 text-textPrimary sm:px-6 sm:pb-8 sm:pt-16 lg:px-8 lg:pb-10 lg:pt-[4.5rem]",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-28 h-[46vh] min-h-[260px] max-w-full bg-[radial-gradient(circle_at_20%_0%,rgba(0,212,255,0.2),transparent_64%),radial-gradient(circle_at_80%_0%,rgba(138,46,255,0.18),transparent_62%)] blur-2xl"
      />
      <Link
        href="/"
        aria-label="Quantixy home"
        className="group absolute left-3 top-3 z-10 inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 backdrop-blur transition-colors hover:bg-slate-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:left-6 sm:top-6"
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
        <span className="truncate text-xs font-bold uppercase tracking-[0.28em] text-slate-200/90">
          Quantixy
        </span>
      </Link>
      {children}
    </main>
  );
}
