"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Baby,
  Bell,
  BookHeart,
  Bot,
  ChevronRight,
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
          "fixed inset-0 z-[75] bg-slate-950/34 backdrop-blur-[2px] transition-opacity duration-200",
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
          "fixed left-0 top-0 z-[80] flex h-dvh w-[10.75rem] max-w-[46vw] flex-col overflow-hidden rounded-r-[22px] border-r border-indigo-100 bg-white/96 shadow-[0_20px_54px_rgb(15_23_42_/_0.16)] transition-transform duration-300 ease-out sm:w-[23rem] sm:max-w-[calc(100vw-0.75rem)] sm:rounded-r-[30px] sm:bg-[#f7f9ff] sm:shadow-[0_28px_80px_rgb(15_23_42_/_0.20)]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative overflow-hidden border-b border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_58%,#e9fbff_100%)] px-3 py-3 pr-9 sm:px-5 sm:py-5 sm:pr-14">
          <Link href="/" className="relative flex items-center gap-2 font-bold text-slate-950 sm:gap-3" onClick={close}>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#6656ff,#27c8bd)] text-white shadow-[0_10px_24px_rgb(79_70_229_/_0.16)] sm:h-12 sm:w-12 sm:rounded-2xl sm:shadow-[0_14px_34px_rgb(79_70_229_/_0.18)]">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm sm:text-base">慧育童行</span>
              <span className="mt-0.5 block truncate text-[10px] font-semibold text-(--text-helper) sm:mt-1 sm:text-xs">
                {ROLE_LABEL_MAP[currentUser.role]} · {currentUser.name}
              </span>
            </div>
          </Link>
          <div className="relative mt-3 rounded-2xl border border-white/90 bg-white/76 p-2.5 shadow-[0_12px_24px_rgb(99_102_241_/_0.10)] sm:mt-4 sm:rounded-3xl sm:p-4 sm:shadow-[0_16px_34px_rgb(99_102_241_/_0.10)]">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div>
                <p className="text-[10px] font-bold text-indigo-600 sm:text-xs">移动工作台</p>
                <p className="mt-0.5 truncate text-xs font-bold text-slate-900 sm:mt-1 sm:text-sm">{currentUser.className ?? "今日任务"}</p>
              </div>
              <span className="hidden sm:inline-flex">
                <RoleBadge role={ROLE_BADGE_MAP[currentUser.role]} label={ROLE_LABEL_MAP[currentUser.role]} />
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/85 text-slate-500 shadow-sm transition hover:bg-indigo-50 hover:text-indigo-700 sm:right-4 sm:top-4 sm:h-10 sm:w-10 sm:rounded-2xl"
            aria-label="关闭菜单"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 sm:px-4 sm:py-5">
          <div className="space-y-3 sm:space-y-5">
            {navGroups.map((group, groupIndex) => (
              <div key={group.key}>
                <p className="px-2 text-[11px] font-bold text-slate-400 sm:px-3 sm:text-xs">{group.label}</p>
                <div className="mt-2 space-y-1">
                  {group.items.map((item, itemIndex) => (
                    <MobileNavLink
                      key={`${item.href}-${item.label}`}
                      item={item}
                      pathname={currentLocation}
                      role={currentUser.role}
                      onClick={close}
                      ref={groupIndex === 0 && itemIndex === 0 ? firstLinkRef : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-indigo-100 bg-white px-2.5 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="mb-3 rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-2.5 shadow-sm sm:mb-4 sm:rounded-3xl sm:p-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-lg sm:h-11 sm:w-11 sm:text-xl" aria-hidden="true">
                {currentUser.avatar}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-(--text-primary) sm:text-sm">{currentUser.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-(--text-tertiary) sm:mt-1 sm:text-xs">
                  {currentUser.className ?? currentUser.role}
                </p>
              </div>
              <span className="hidden sm:inline-flex">
                <RoleBadge role={ROLE_BADGE_MAP[currentUser.role]} label={ROLE_LABEL_MAP[currentUser.role]} />
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              close();
              void onLogout();
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-bold text-slate-600 shadow-sm transition hover:bg-indigo-50 hover:text-indigo-700 sm:min-h-12 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm"
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
    role: AccountRole;
    onClick: () => void;
  }
>(function MobileNavLink(
  {
    item,
    pathname,
    role,
    onClick,
  },
  ref
) {
  const Icon = ICON_MAP[item.icon];
  const active = isPrimaryNavItemActive(pathname, item.href);
  const directorTone = role === "机构管理员";

  return (
    <Link
      ref={ref}
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-bold transition-all sm:min-h-12 sm:gap-3 sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-sm",
        active && directorTone
          ? "bg-[linear-gradient(135deg,#6656ff,#7c3aed)] text-white shadow-[0_12px_28px_rgb(99_102_241_/_0.26)] sm:bg-white sm:text-indigo-700 sm:shadow-[0_12px_30px_rgb(79_70_229_/_0.13),inset_4px_0_0_rgb(99_102_241)]"
          : active
            ? "bg-[#f0ebff] text-indigo-700 shadow-[inset_3px_0_0_rgb(99_102_241)] sm:bg-white sm:shadow-[0_12px_30px_rgb(79_70_229_/_0.13),inset_4px_0_0_rgb(99_102_241)]"
            : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm"
      )}
    >
      <span
        className={cn(
          "hidden h-7 w-7 shrink-0 items-center justify-center rounded-xl sm:flex sm:h-9 sm:w-9 sm:rounded-2xl",
          active ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-400"
        )}
      >
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
      </span>
      <span className="truncate">{item.label}</span>
      {!active ? <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300 sm:hidden" aria-hidden="true" /> : null}
    </Link>
  );
});
