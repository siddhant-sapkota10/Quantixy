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
        "neon-input w-full rounded-xl px-4 py-3",
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
