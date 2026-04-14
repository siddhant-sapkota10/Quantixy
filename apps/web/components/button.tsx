import { ButtonHTMLAttributes } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-sky-500 to-cyan-400 text-slate-950 shadow-lg shadow-sky-500/20 hover:brightness-110 focus:ring-2 focus:ring-sky-300/70",
  secondary:
    "border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 focus:ring-2 focus:ring-slate-400/40",
  ghost:
    "bg-transparent text-slate-300 hover:text-sky-300 hover:underline focus:ring-2 focus:ring-slate-400/30"
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.span
      className="inline-flex"
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <button
        type={type}
        className={cn(
          "inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-semibold transition duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          variantClasses[variant],
          className
        )}
        disabled={disabled}
        {...props}
      />
    </motion.span>
  );
}
