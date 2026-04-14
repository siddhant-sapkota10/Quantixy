import { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type DropdownOption = {
  label: string;
  value: string;
};

type DropdownProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: DropdownOption[];
};

export function Dropdown({ className, options, ...props }: DropdownProps) {
  return (
    <select
      className={cn(
        "w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-slate-100 shadow-glow outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
