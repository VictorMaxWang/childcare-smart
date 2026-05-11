import type { ReactNode } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export type ShellAccount = {
  avatar: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
};

export function ShellAccountCard({
  account,
  actionLabel,
  className,
  onAction,
  showChevron = false,
  variant = "topbar",
}: {
  account: ShellAccount;
  actionLabel?: string;
  className?: string;
  onAction?: () => void | Promise<void>;
  showChevron?: boolean;
  variant?: "topbar" | "sidebar" | "mobile";
}) {
  const avatar = (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-cyan-50 text-lg",
        variant === "sidebar" || variant === "mobile" ? "h-10 w-10" : "h-9 w-9"
      )}
    >
      {account.avatar}
    </span>
  );

  if (variant === "topbar") {
    return (
      <div
        data-testid="r02-account-card"
        className={cn(
          "hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-[var(--replica-shadow-control)] sm:flex",
          className
        )}
      >
        {avatar}
        <div className="hidden min-w-0 xl:block">
          <p className="truncate text-sm font-semibold leading-tight text-slate-950">{account.name}</p>
          {account.meta ? <p className="mt-0.5 truncate text-xs text-slate-500">{account.meta}</p> : null}
        </div>
        {showChevron ? <ChevronDown className="hidden h-4 w-4 text-slate-400 xl:block" aria-hidden="true" /> : null}
      </div>
    );
  }

  return (
    <div
      data-testid="r02-account-card"
      className={cn("rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm", className)}
    >
      <div className="flex items-center gap-2">
        {avatar}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{account.name}</p>
          {account.meta ? <p className="mt-0.5 truncate text-xs text-slate-500">{account.meta}</p> : null}
        </div>
      </div>
      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:text-indigo-700"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
