import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ShellIconButton({
  badge,
  children,
  className,
  disabled = true,
  label,
  reason,
  testId,
}: {
  badge?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  reason?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      className={cn(
        "relative hidden h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm sm:flex",
        disabled ? "cursor-not-allowed opacity-70" : "text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700",
        className
      )}
      aria-label={label}
      title={reason ? `${label}暂未开放：${reason}` : label}
    >
      {children}
      {badge ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
