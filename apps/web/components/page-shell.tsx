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
        "min-h-screen bg-hero-grid px-3 py-4 text-slate-100 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
        className
      )}
    >
      {children}
    </main>
  );
}
