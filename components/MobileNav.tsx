"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Baby,
  Bell,
  BookHeart,
  Bot,
  ClipboardList,
  FileText,
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
  ai: Bot,
  consultation: ClipboardList,
  file: FileText,
  feedback: Bell,
  storybook: BookHeart,
  reminders: Bell,
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
  const searchParams = useSearchParams();
  const currentLocation = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const { currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const wasOpenRef = useRef(false);
  const navGroups = buildPrimaryNavGroups(currentUser.role, { childId: currentUser.childIds?.[0] });

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
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-100 bg-white text-slate-700 shadow-[0_12px_30px_rgb(79_70_229_/_0.12)] transition hover:bg-indigo-50 hover:text-indigo-700"
        aria-label={open ? "关闭导航菜单" : "打开导航菜单"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          "fixed inset-0 z-[75] bg-slate-950/48 backdrop-blur-md transition-opacity duration-200",
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
          "fixed left-0 top-0 z-[80] flex h-dvh w-[23rem] max-w-[calc(100vw-0.75rem)] flex-col overflow-hidden rounded-r-[30px] border-r border-indigo-100 bg-[#f7f9ff] shadow-[0_28px_80px_rgb(15_23_42_/_0.20)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative overflow-hidden border-b border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_58%,#e9fbff_100%)] px-5 py-5 pr-14">
          <Link href="/" className="relative flex items-center gap-3 font-bold text-slate-950" onClick={close}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6656ff,#27c8bd)] text-white shadow-[0_14px_34px_rgb(79_70_229_/_0.18)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-base">智慧托育平台</span>
              <span className="mt-1 block truncate text-xs font-semibold text-(--text-helper)">
                {ROLE_LABEL_MAP[currentUser.role]} · {currentUser.name}
              </span>
            </div>
          </Link>
          <div className="relative mt-4 rounded-3xl border border-white/90 bg-white/76 p-4 shadow-[0_16px_34px_rgb(99_102_241_/_0.10)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-indigo-600">移动工作台</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{currentUser.className ?? "今日任务"}</p>
              </div>
              <RoleBadge role={ROLE_BADGE_MAP[currentUser.role]} label={ROLE_LABEL_MAP[currentUser.role]} />
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 bg-white/85 text-slate-500 shadow-sm transition hover:bg-indigo-50 hover:text-indigo-700"
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-5">
            {navGroups.map((group, groupIndex) => (
              <div key={group.key}>
                <p className="px-3 text-xs font-bold text-slate-400">{group.label}</p>
                <div className="mt-2 space-y-1">
                  {group.items.map((item, itemIndex) => (
                    <MobileNavLink
                      key={`${item.href}-${item.label}`}
                      item={item}
                      pathname={currentLocation}
                      onClick={close}
                      ref={groupIndex === 0 && itemIndex === 0 ? firstLinkRef : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-indigo-100 bg-white px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="mb-4 rounded-3xl border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xl" aria-hidden="true">
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
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-indigo-50 hover:text-indigo-700"
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
        "flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all",
        active
          ? "bg-white text-indigo-700 shadow-[0_12px_30px_rgb(79_70_229_/_0.13),inset_4px_0_0_rgb(99_102_241)]"
          : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
          active ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-400"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
});
