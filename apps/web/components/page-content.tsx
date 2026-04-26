import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContentProps = {
  children: ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl" | "wide";
  variant?: "panel" | "plain";
};

const SIZE_CLASS: Record<NonNullable<PageContentProps["size"]>, string> = {
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
  wide: "max-w-[min(92rem,calc(100vw-2rem))]",
};

export function PageContent({
  children,
  className,
  size = "lg",
  variant = "panel",
}: PageContentProps) {
  return (
    <div
      className={cn(
        "q-content-focus mx-auto w-full min-w-0 shrink-0 px-4 sm:px-6",
        SIZE_CLASS[size],
        variant === "panel"
          ? "q-card-strong relative rounded-[1.75rem] p-4 sm:p-6"
          : null,
        className
      )}
    >
      <div className={cn(variant === "panel" ? "relative z-[1] min-w-0" : "relative z-[1] min-w-0")}>
        {children}
      </div>
    </div>
  );
}
