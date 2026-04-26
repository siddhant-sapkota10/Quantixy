import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeader({
  label,
  title,
  subtitle,
  className,
  actions,
}: {
  label: string;
  title: string;
  subtitle?: string;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/90">{label}</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--qx-text-primary)] sm:text-3xl md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--qx-text-secondary)] sm:text-base">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function NeonPanel({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-panel)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-3xl sm:p-6 md:p-8",
        glow && "border-cyan-400/25 shadow-[0_0_40px_rgba(34,211,238,0.08),0_20px_50px_rgba(0,0,0,0.5)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function NeonCard({
  children,
  className,
  interactive,
  equipped,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  equipped?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md sm:rounded-3xl sm:p-5",
        interactive && "qx-card-interactive cursor-pointer",
        equipped && "border-cyan-400/35 shadow-[0_0_28px_rgba(168,85,247,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatBlock({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "gold" | "cyan" | "purple";
}) {
  const toneCls =
    tone === "gold"
      ? "border-amber-400/20 bg-amber-500/[0.08]"
      : tone === "cyan"
        ? "border-cyan-400/22 bg-cyan-500/[0.08]"
        : tone === "purple"
          ? "border-purple-400/22 bg-purple-500/[0.08]"
          : "border-[var(--qx-border-soft)] bg-[var(--qx-card)]";

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3", toneCls)}>
      {icon ? <div className="flex h-10 w-10 shrink-0 items-center justify-center text-cyan-300/90">{icon}</div> : null}
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--qx-text-muted)]">{label}</p>
        <p className="text-lg font-black tabular-nums text-[var(--qx-text-primary)] sm:text-xl">{value}</p>
      </div>
    </div>
  );
}

export function PrimaryGradientButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-cyan-300/30 bg-[linear-gradient(115deg,#22d3ee_0%,#38bdf8_35%,#8b5cf6_88%,#a855f7_100%)] px-5 py-4 text-left font-black text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_16px_40px_rgba(0,0,0,0.45),0_0_36px_rgba(34,211,238,0.2)] transition-[filter,box-shadow,transform] duration-200 hover:brightness-[1.04] hover:shadow-[0_0_48px_rgba(168,85,247,0.25)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-3xl sm:py-5",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusStrip({
  slots,
}: {
  slots: Array<{ title: string; body: string; icon?: ReactNode }>;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] p-3 backdrop-blur-md sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--qx-border-soft)] sm:p-4">
      {slots.map((s, i) => (
        <div key={i} className="flex gap-3 px-1 sm:px-4">
          {s.icon ? <div className="mt-0.5 shrink-0 text-cyan-400/80">{s.icon}</div> : null}
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--qx-text-muted)]">{s.title}</p>
            <p className="mt-0.5 text-sm font-medium leading-snug text-[var(--qx-text-primary)]">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
