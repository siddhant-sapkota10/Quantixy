import { ReactNode } from "react";
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
      {children}
    </main>
  );
}
