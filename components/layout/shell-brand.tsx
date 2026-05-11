import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function ShellBrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span
      data-testid="r02-shell-brand-mark"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-[var(--replica-gradient-brand)] text-white shadow-[0_14px_36px_rgb(99_102_241_/_0.25)]",
        compact ? "h-11 w-11" : "h-12 w-12",
        className
      )}
    >
      <ShieldCheck className={compact ? "h-5 w-5" : "h-6 w-6"} aria-hidden="true" />
    </span>
  );
}

export function ShellBrandLockup({
  compact = false,
  href = "/",
  subtitle,
  title,
  className,
}: {
  compact?: boolean;
  href?: string;
  subtitle: string;
  title: string;
  className?: string;
}) {
  return (
    <Link href={href} data-testid="r02-shell-brand" className={cn("min-w-0 shrink-0 items-center gap-3", className)}>
      <ShellBrandMark compact={compact} />
      <div className="min-w-0">
        <p className={cn("truncate font-bold leading-tight text-slate-950", compact ? "text-base" : "text-base lg:text-lg")}>
          {title}
        </p>
        <p className={cn("mt-0.5 truncate font-semibold text-slate-500", compact ? "text-[11px]" : "text-xs")}>
          {subtitle}
        </p>
      </div>
    </Link>
  );
}
