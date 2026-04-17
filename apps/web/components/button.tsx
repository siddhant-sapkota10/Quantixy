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
    "border border-cyan-300/35 bg-[linear-gradient(120deg,rgba(0,212,255,0.94),rgba(138,46,255,0.9))] text-slate-950 shadow-[0_0_0_1px_rgba(110,170,255,0.35),0_14px_34px_rgba(7,12,31,0.62),0_0_24px_rgba(0,212,255,0.28)] hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(136,180,255,0.5),0_18px_40px_rgba(7,12,31,0.72),0_0_32px_rgba(138,46,255,0.36)]",
  secondary:
    "border border-indigo-300/30 bg-slate-900/65 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_10px_26px_rgba(3,7,20,0.58)] hover:border-cyan-300/55 hover:bg-slate-900/85 hover:shadow-[0_0_22px_rgba(0,212,255,0.2)]",
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
