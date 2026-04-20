"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Baby, BookHeart, House, LogOut, Menu, Monitor, Salad, ShieldCheck, Users, X } from "lucide-react";
import {
  buildPrimaryNavItems,
  isPrimaryNavItemActive,
  type PrimaryNavIconKey,
} from "@/lib/navigation/primary-nav";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

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

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Teacher",
  parent: "Parent",
};

export default function MobileNav({ onLogout }: { onLogout: () => void | Promise<void> }) {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const navItems = buildPrimaryNavItems(currentUser.role);
  const roleLabel = ROLE_LABELS[currentUser.role] ?? currentUser.role;

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
        onClick={() => setOpen((previous) => !previous)}
        className="premium-glass-panel surface-glass flex h-10 w-10 items-center justify-center rounded-2xl border border-white/14 text-white/76 transition hover:bg-white/10 hover:text-white"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-[rgba(3,4,12,0.62)] backdrop-blur-md transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={close}
        aria-hidden="true"
      />

      <nav
        ref={panelRef}
        id="mobile-nav-panel"
        aria-label="Mobile navigation"
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-white/10 bg-[rgba(8,10,24,0.94)] shadow-[0_28px_80px_rgba(2,6,23,0.52)] backdrop-blur-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-white" onClick={close}>
            <div className="premium-glass-panel surface-glass flex h-8 w-8 items-center justify-center rounded-xl border border-white/14">
              <Baby className="h-5 w-5 text-indigo-200" />
            </div>
            <span className="text-sm">Childcare Smart</span>
          </Link>
          <button
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/48 transition hover:bg-white/8 hover:text-white"
            aria-label="Close navigation menu"
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
                      ? "bg-white/10 text-white shadow-[var(--shadow-card)]"
                      : "text-white/68 hover:bg-white/6 hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <div className="mb-3 text-sm">
            <p className="text-xs text-white/42">Signed in</p>
            <p className="font-semibold text-white">
              {currentUser.avatar} {currentUser.name} <span className="text-white/46">·</span> {roleLabel}
            </p>
          </div>
          <button
            onClick={() => {
              close();
              void onLogout();
            }}
            className="premium-glass-panel surface-glass flex w-full items-center justify-center gap-2 rounded-2xl border border-white/14 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );
}
