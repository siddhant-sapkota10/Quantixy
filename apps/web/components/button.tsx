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
    "border border-cyan-200/28 bg-[linear-gradient(120deg,rgba(56,199,232,0.86),rgba(124,92,255,0.82))] text-slate-950 shadow-[0_0_0_1px_rgba(136,170,220,0.22),0_12px_30px_rgba(7,12,31,0.46),0_0_18px_rgba(56,199,232,0.16)] hover:brightness-105 hover:shadow-[0_0_0_1px_rgba(150,180,230,0.3),0_16px_36px_rgba(7,12,31,0.54),0_0_24px_rgba(124,92,255,0.2)]",
  secondary:
    "border border-indigo-200/22 bg-slate-900/45 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_10px_24px_rgba(3,7,20,0.38)] hover:border-cyan-200/36 hover:bg-slate-900/58 hover:shadow-[0_0_18px_rgba(56,199,232,0.12)]",
  ghost:
    "border border-transparent bg-transparent text-slate-300 hover:border-indigo-300/30 hover:bg-indigo-400/10 hover:text-cyan-200"
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
          "relative inline-flex w-full select-none items-center justify-center rounded-xl px-6 py-3.5 text-base font-semibold transition-[transform,filter,opacity,box-shadow,background-color,color,border-color] duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-55 disabled:saturate-50 disabled:brightness-90",
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
