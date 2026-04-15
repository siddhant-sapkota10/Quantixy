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
    "bg-gradient-to-r from-sky-500 to-cyan-400 text-slate-950 shadow-lg shadow-sky-500/20 hover:brightness-110",
  secondary:
    "border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700",
  ghost:
    "bg-transparent text-slate-300 hover:text-sky-300 hover:underline"
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
  const shouldFillWidth = className?.includes("w-full");
  const isDisabled = Boolean(disabled || loading);

  return (
    <motion.span
      className={cn("inline-flex", shouldFillWidth && "w-full")}
      whileHover={isDisabled ? undefined : { scale: 1.015, y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.975, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
    >
      <button
        type={type}
        className={cn(
          "relative inline-flex w-full select-none items-center justify-center rounded-2xl px-6 py-4 text-base font-semibold transition-[filter,opacity,box-shadow,background-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-55 disabled:saturate-50 disabled:brightness-90",
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
