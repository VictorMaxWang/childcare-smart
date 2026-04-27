"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Baby,
  BookHeart,
  House,
  LogOut,
  Menu,
  Monitor,
  Salad,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { RoleBadge, type RoleBadgeRole } from "@/components/ui/role-badge";
import type { AccountRole } from "@/lib/auth/accounts";
import {
  buildPrimaryNavGroups,
  isPrimaryNavItemActive,
  type PrimaryNavIconKey,
  type PrimaryNavItem,
} from "@/lib/navigation/primary-nav";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<PrimaryNavIconKey, LucideIcon> = {
  overview: House,
  "role-home": House,
  children: Users,
  health: ShieldCheck,
  growth: BookHeart,
  diet: Salad,
  parent: Baby,
  screen: Monitor,
};

const ROLE_BADGE_MAP: Record<AccountRole, RoleBadgeRole> = {
  机构管理员: "director",
  教师: "teacher",
  家长: "parent",
};

const ROLE_LABEL_MAP: Record<AccountRole, string> = {
  机构管理员: "园长端",
  教师: "教师端",
  家长: "家长端",
};

export default function MobileNav({ onLogout }: { onLogout: () => void | Promise<void> }) {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const wasOpenRef = useRef(false);
  const navGroups = buildPrimaryNavGroups(currentUser.role);

  const close = () => setOpen(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        triggerRef.current?.focus();
        wasOpenRef.current = false;
      }
      return;
    }

    wasOpenRef.current = true;
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
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-(--border) bg-white text-(--text-secondary) shadow-[var(--shadow-card)] transition hover:bg-(--hover-surface) hover:text-(--text-primary)"
        aria-label={open ? "关闭导航菜单" : "打开导航菜单"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={close}
        aria-hidden="true"
      />

      <nav
        ref={panelRef}
        id="mobile-nav-panel"
        aria-label="移动端主导航"
        className={cn(
          "fixed left-0 top-0 z-50 flex h-dvh w-[22rem] max-w-[calc(100vw-1rem)] flex-col border-r border-(--border) bg-white shadow-[var(--shadow-dialog)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-(--border-subtle) px-5 py-4 pr-14">
          <Link href="/" className="flex items-center gap-3 font-bold text-(--text-primary)" onClick={close}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--primary-soft) text-(--primary)">
              <Baby className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm">普惠托育智慧平台</span>
              <span className="mt-1 block truncate text-xs font-medium text-(--text-helper)">
                {ROLE_LABEL_MAP[currentUser.role]} · {currentUser.name}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md text-(--text-tertiary) transition hover:bg-(--secondary) hover:text-(--text-primary)"
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-5">
            {navGroups.map((group, groupIndex) => (
              <div key={group.key}>
                <p className="px-3 text-xs font-semibold text-(--text-helper)">{group.label}</p>
                <div className="mt-2 space-y-1">
                  {group.items.map((item, itemIndex) => (
                    <MobileNavLink
                      key={`${item.href}-${item.label}`}
                      item={item}
                      pathname={pathname}
                      onClick={close}
                      ref={groupIndex === 0 && itemIndex === 0 ? firstLinkRef : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-(--border-subtle) px-5 py-4">
          <div className="mb-4 rounded-lg border border-(--border) bg-(--panel-subtle) p-3">
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">
                {currentUser.avatar}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-(--text-primary)">{currentUser.name}</p>
                <p className="mt-1 truncate text-xs text-(--text-tertiary)">
                  {currentUser.className ?? currentUser.role}
                </p>
              </div>
              <RoleBadge role={ROLE_BADGE_MAP[currentUser.role]} label={ROLE_LABEL_MAP[currentUser.role]} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              close();
              void onLogout();
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-(--border) bg-white px-4 py-2.5 text-sm font-medium text-(--text-secondary) shadow-[var(--shadow-card)] transition hover:bg-(--hover-surface) hover:text-(--text-primary)"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </nav>
    </div>
  );
}

const MobileNavLink = forwardRef<
  HTMLAnchorElement,
  {
    item: PrimaryNavItem;
    pathname: string;
    onClick: () => void;
  }
>(function MobileNavLink(
  {
    item,
    pathname,
    onClick,
  },
  ref
) {
  const Icon = ICON_MAP[item.icon];
  const active = isPrimaryNavItemActive(pathname, item.href);

  return (
    <Link
      ref={ref}
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-(--primary-soft) text-(--primary-soft-foreground) shadow-[inset_3px_0_0_var(--primary)]"
          : "text-(--text-secondary) hover:bg-(--hover-surface) hover:text-(--text-primary)"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          active ? "bg-white text-(--primary)" : "bg-(--panel-subtle) text-(--text-tertiary)"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
});
