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
        "mx-auto w-full min-w-0 shrink-0 px-4 sm:px-6",
        SIZE_CLASS[size],
        variant === "panel"
          ? "q-content-focus q-card-strong relative rounded-[1.75rem] p-4 sm:p-6"
          : null,
        className
      )}
    >
      <div
        className={cn(
          "relative z-[1] min-w-0",
          variant === "plain" ? "flex flex-col gap-8 sm:gap-10" : null
        )}
      >
        {children}
      </div>
    </div>
  );
}
