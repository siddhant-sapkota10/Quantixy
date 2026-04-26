import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  /** Match / game UI: skip dashboard header and bottom nav */
  hideChrome?: boolean;
};

export function PageShell({ children, className, hideChrome }: PageShellProps) {
  if (hideChrome) {
    return (
      <main
        className={cn(
          "relative isolate min-h-[100dvh] min-h-screen w-full max-w-[100vw] min-w-0 overflow-x-clip overflow-y-visible px-3 pb-6 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:px-5",
          className
        )}
      >
        {children}
      </main>
    );
  }

  return (
    <DashboardShell
      className={cn(
        "pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
      )}
    >
      <div className={cn("flex w-full min-w-0 flex-col", className)}>{children}</div>
    </DashboardShell>
  );
}
