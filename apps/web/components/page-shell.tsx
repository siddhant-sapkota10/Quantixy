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
        "min-h-screen bg-hero-grid px-4 py-6 text-slate-100 sm:px-6 sm:py-10",
        className
      )}
    >
      {children}
    </main>
  );
}
