import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileBottomNavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  match: (pathname: string) => boolean;
  highlight?: boolean;
};

export function MobileBottomNav({ items, pathname }: { items: MobileBottomNavItem[]; pathname: string }) {
  return (
    <nav
      data-testid="r02-mobile-bottom-nav"
      className="pixel-bottom-tabs fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 rounded-[1.65rem] border border-white/85 bg-white/94 px-2 py-2 shadow-[var(--replica-shadow-shell)] backdrop-blur-xl lg:hidden"
      aria-label="移动端快捷导航"
    >
      <div className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-bold transition",
                active
                  ? "text-indigo-700"
                  : item.highlight
                    ? "text-indigo-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-2xl transition",
                  item.highlight
                    ? "bg-[var(--replica-gradient-primary)] text-white shadow-[0_10px_24px_rgb(99_102_241_/_0.26)]"
                    : active
                      ? "bg-indigo-50 text-indigo-700 shadow-sm"
                      : "bg-slate-50 text-slate-500"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
