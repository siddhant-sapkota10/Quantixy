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
        "q-page-shell relative isolate flex min-h-[100dvh] min-h-screen w-full max-w-[100vw] min-w-0 overflow-x-hidden px-3 pb-6 pt-14 text-textPrimary sm:px-6 sm:pb-8 sm:pt-16 lg:px-8 lg:pb-10 lg:pt-[4.5rem]",
        className
      )}
    >
      <Link
        href="/"
        aria-label="Quantixy home"
        className="group absolute left-3 top-3 z-10 inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl px-3 py-2 transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50 sm:left-6 sm:top-6"
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
