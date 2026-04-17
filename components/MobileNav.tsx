"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Baby, BookHeart, House, LogOut, Menu, Monitor, Salad, ShieldCheck, Users, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  buildPrimaryNavItems,
  isPrimaryNavItemActive,
  type PrimaryNavIconKey,
} from "@/lib/navigation/primary-nav";

const ICON_MAP: Record<PrimaryNavIconKey, typeof House> = {
  overview: House,
  "role-home": House,
  children: Users,
  health: ShieldCheck,
  growth: BookHeart,
  diet: Salad,
  parent: Baby,
  screen: Monitor,
};

export default function MobileNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const navItems = buildPrimaryNavItems(currentUser.role);

  const close = () => setOpen(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
      return;
    }

    firstLinkRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusableItems = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (focusableItems.length === 0) {
        return;
      }

      const firstItem = focusableItems[0];
      const lastItem = focusableItems[focusableItems.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        className="glass-surface surface-solid flex h-10 w-10 items-center justify-center rounded-2xl text-slate-600 transition hover:bg-white/85"
        aria-label={open ? "鍏抽棴瀵艰埅鑿滃崟" : "鎵撳紑瀵艰埅鑿滃崟"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/26 backdrop-blur-md transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={close}
        aria-hidden="true"
      />

      <nav
        ref={panelRef}
        id="mobile-nav-panel"
        aria-label="绉诲姩绔富瀵艰埅"
        className={cn(
          "surface-luminous fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-white/70 shadow-[var(--shadow-card-strong)] backdrop-blur-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/70 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-indigo-600" onClick={close}>
            <div className="glass-surface surface-solid flex h-8 w-8 items-center justify-center rounded-xl">
              <Baby className="h-5 w-5 text-indigo-600" />
            </div>
            <span className="text-sm">鏅儬鎵樿偛鏅烘収骞冲彴</span>
          </Link>
          <button
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/70 hover:text-slate-600"
            aria-label="鍏抽棴鑿滃崟"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navItems.map(({ href, label, icon }, index) => {
              const Icon = ICON_MAP[icon];
              const active = isPrimaryNavItemActive(pathname, href);

              return (
                <Link
                  key={`${href}-${label}`}
                  ref={index === 0 ? firstLinkRef : undefined}
                  href={href}
                  onClick={close}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/78 text-indigo-600 shadow-[var(--shadow-card)]"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-t border-white/70 px-5 py-4">
          <div className="mb-3 text-sm">
            <p className="text-xs text-slate-400">褰撳墠韬唤</p>
            <p className="font-semibold text-slate-700">
              {currentUser.avatar} {currentUser.name} 路 {currentUser.role}
            </p>
          </div>
          <button
            onClick={() => {
              close();
              onLogout();
            }}
            className="glass-surface surface-solid flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white/85"
          >
            <LogOut className="h-4 w-4" />
            閫€鍑虹櫥褰?
          </button>
        </div>
      </nav>
    </div>
  );
}
