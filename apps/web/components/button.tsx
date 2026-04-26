import { ButtonHTMLAttributes } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  keepWidthOnLoading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-cyan-200/35 bg-[linear-gradient(120deg,rgba(56,199,232,0.92),rgba(124,92,255,0.88))] text-slate-950 shadow-[0_0_0_1px_rgba(136,170,220,0.28),0_14px_34px_rgba(7,12,31,0.52),0_0_24px_rgba(99,102,241,0.35)] hover:brightness-[1.06] hover:shadow-[0_0_0_1px_rgba(165,200,240,0.32),0_18px_42px_rgba(7,12,31,0.58),0_0_28px_rgba(99,102,241,0.42)] active:brightness-[0.98]",
  secondary:
    "border border-[var(--qx-border-soft)] bg-[var(--qx-card)] text-[var(--qx-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_26px_rgba(3,7,20,0.45)] hover:border-cyan-400/22 hover:bg-[var(--qx-card-hover)] hover:shadow-[0_0_20px_rgba(34,211,238,0.08),inset_0_1px_0_rgba(255,255,255,0.07)]",
  ghost:
    "border border-transparent bg-transparent text-slate-200/85 hover:border-white/12 hover:bg-white/[0.06] hover:text-white"
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  disabled,
  loading = false,
  loadingText = "Loading...",
  keepWidthOnLoading = true,
  children,
  ...props
}: ButtonProps) {
  const wrapperWidthClasses = className
    ?.split(/\s+/)
    .filter((token) => /^(?:(?:sm|md|lg|xl|2xl):)?w-(?:auto|fit|full|max|min)$/.test(token))
    .join(" ");
  const isDisabled = Boolean(disabled || loading);

  return (
    <motion.span
      className={cn("inline-flex", wrapperWidthClasses)}
      whileHover={isDisabled ? undefined : { scale: 1.015, y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.975, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
    >
      <button
        type={type}
        className={cn(
          "relative inline-flex w-full select-none items-center justify-center rounded-xl px-6 py-3.5 text-base font-semibold transition-[transform,filter,opacity,box-shadow,background-color,color,border-color] duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-[0.72] disabled:saturate-[0.88] disabled:brightness-[0.94] disabled:text-slate-200/90",
          variantClasses[variant],
          className
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        <span
          className={cn(
            "inline-flex items-center justify-center",
            loading && keepWidthOnLoading ? "opacity-0" : "opacity-100"
          )}
        >
          {children}
        </span>
        {loading ? (
          <span className="absolute inset-0 inline-flex items-center justify-center gap-2" aria-live="polite">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
            <span>{loadingText}</span>
          </span>
        ) : null}
      </button>
    </motion.span>
  );
}
