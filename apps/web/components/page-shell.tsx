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
        "min-h-screen bg-hero-grid bg-hero-grid px-6 py-10 text-slate-100",
        className
      )}
    >
      {children}
    </main>
  );
}
