import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContentProps = {
  children: ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl";
  variant?: "panel" | "plain";
};

const SIZE_CLASS: Record<NonNullable<PageContentProps["size"]>, string> = {
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
};

export function PageContent({
  children,
  className,
  size = "xl",
  variant = "panel",
}: PageContentProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        SIZE_CLASS[size],
        variant === "panel"
          ? "relative rounded-[2.25rem] border border-white/10 bg-slate-950/45 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/10 backdrop-blur-md sm:p-6"
          : null,
        className
      )}
    >
      {variant === "panel" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[2.25rem] [background:radial-gradient(900px_circle_at_18%_12%,rgba(0,212,255,0.08),transparent_45%),radial-gradient(900px_circle_at_82%_10%,rgba(138,46,255,0.07),transparent_48%)]"
        />
      ) : null}
      <div className={variant === "panel" ? "relative" : undefined}>{children}</div>
    </div>
  );
}
