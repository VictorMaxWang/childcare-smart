"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Baby,
  Bell,
  BookHeart,
  Bot,
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  House,
  LogOut,
  MessageCircle,
  Monitor,
  Salad,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import MobileNav from "@/components/MobileNav";
import { RoleBadge, type RoleBadgeRole } from "@/components/ui/role-badge";
import { LoadingState } from "@/components/ui/state-block";
import type { AccountRole } from "@/lib/auth/accounts";
import {
  ACCESS_DENIED_QUERY_PARAM,
  canRoleAccessPath,
  resolveUnauthorizedRedirectPath,
  sanitizeNextPath,
} from "@/lib/auth/route-access";
import {
  buildPrimaryNavGroups,
  buildPrimaryNavItems,
  isPrimaryNavItemActive,
  type PrimaryNavGroup,
  type PrimaryNavIconKey,
  type PrimaryNavItem,
} from "@/lib/navigation/primary-nav";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ICON_MAP: Record<PrimaryNavIconKey, LucideIcon> = {
  overview: Monitor,
  "role-home": House,
  children: Users,
  health: ShieldCheck,
  growth: BookHeart,
  diet: Salad,
  parent: Baby,
  screen: Monitor,
  ai: Bot,
  consultation: Stethoscope,
  file: FileText,
  feedback: MessageCircle,
  storybook: BookHeart,
  reminders: Bell,
};

type ShellRole = "director" | "teacher" | "parent";
type ShellMode = "sidebar" | "top-tabs" | "mobile-app";

const ROLE_META: Record<
  AccountRole,
  {
    shellLabel: string;
    badgeRole: RoleBadgeRole;
    shellRole: ShellRole;
    shellMode: ShellMode;
    description: string;
    shortDescription: string;
    navCue: string;
    accentClassName: string;
    heroToneClassName: string;
  }
> = {
  机构管理员: {
    shellLabel: "园长端",
    badgeRole: "director",
    shellRole: "director",
    shellMode: "sidebar",
    description: "全园运营、风险优先级与数据决策",
    shortDescription: "春芽智慧托育中心",
    navCue: "全园运营",
    accentClassName: "border-indigo-200 bg-indigo-50 text-indigo-700",
    heroToneClassName: "from-indigo-50 via-white to-sky-50",
  },
  教师: {
    shellLabel: "教师端",
    badgeRole: "teacher",
    shellRole: "teacher",
    shellMode: "top-tabs",
    description: "班级任务、每日记录与家园沟通",
    shortDescription: "向阳班工作台",
    navCue: "教师工作台",
    accentClassName: "border-violet-200 bg-violet-50 text-violet-700",
    heroToneClassName: "from-violet-50 via-white to-cyan-50",
  },
  家长: {
    shellLabel: "家长端",
    badgeRole: "parent",
    shellRole: "parent",
    shellMode: "mobile-app",
    description: "孩子状态、成长回看与反馈闭环",
    shortDescription: "普惠托育智慧管理平台",
    navCue: "孩子状态",
    accentClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    heroToneClassName: "from-emerald-50 via-white to-violet-50",
  },
};

const ROUTE_TITLE_MAP = [
  { prefix: "/teacher/high-risk-consultation", title: "高风险会诊" },
  { prefix: "/teacher/health-file-bridge", title: "健康材料解析" },
  { prefix: "/teacher/agent", title: "教师 AI 助手" },
  { prefix: "/teacher", title: "教师工作台" },
  { prefix: "/admin/agent", title: "园长 AI 助手" },
  { prefix: "/admin", title: "园所首页" },
  { prefix: "/parent/storybook", title: "成长绘本" },
  { prefix: "/parent/agent", title: "家长 AI 助手" },
  { prefix: "/parent", title: "家长首页" },
  { prefix: "/children", title: "幼儿档案" },
  { prefix: "/health", title: "晨检与健康" },
  { prefix: "/growth", title: "成长行为" },
  { prefix: "/diet", title: "饮食记录" },
  { prefix: "/", title: "数据总览" },
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser, logout, authLoading, isAuthenticated } = useApp();
  const accessDeniedNoticeKeyRef = useRef<string | null>(null);
  const currentLocation = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const hideShell = pathname === "/login" || pathname.startsWith("/auth/login");

  useEffect(() => {
    if (hideShell || authLoading) {
      return;
    }

    if (!isAuthenticated) {
      const currentPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : pathname;
      const nextPath = sanitizeNextPath(currentPath);
      router.replace(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
      return;
    }

    if (!canRoleAccessPath(currentUser.role, pathname)) {
      router.replace(resolveUnauthorizedRedirectPath(currentUser.role));
    }
  }, [authLoading, currentUser.role, hideShell, isAuthenticated, pathname, router]);

  useEffect(() => {
    if (hideShell || authLoading || !isAuthenticated || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get(ACCESS_DENIED_QUERY_PARAM) !== "1") {
      return;
    }

    const noticeKey = `${url.pathname}${url.search}`;
    if (accessDeniedNoticeKeyRef.current === noticeKey) {
      return;
    }
    accessDeniedNoticeKeyRef.current = noticeKey;

    toast.warning("已回到当前角色首页", {
      description: "当前账号无权访问刚才请求的页面。",
    });

    url.searchParams.delete(ACCESS_DENIED_QUERY_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [authLoading, hideShell, isAuthenticated, pathname]);

  if (hideShell) {
    return <main className="min-h-screen bg-(--background)">{children}</main>;
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-(--background) p-6">
        <LoadingState
          title="正在校验登录状态"
          description="系统正在确认当前账号身份与页面访问权限。"
        />
      </main>
    );
  }

  if (!isAuthenticated || !canRoleAccessPath(currentUser.role, pathname)) {
    return (
      <main className="min-h-screen bg-(--background) p-6">
        <LoadingState
          title={isAuthenticated ? "正在回到当前角色首页" : "正在进入登录页"}
          description={isAuthenticated ? "当前账号无权访问该页面，系统正在安全重定向。" : "请先登录后继续访问该页面。"}
        />
      </main>
    );
  }

  const childId = currentUser.childIds?.[0];
  const navOptions = { childId };
  const navItems = buildPrimaryNavItems(currentUser.role, navOptions);
  const navGroups = buildPrimaryNavGroups(currentUser.role, navOptions);
  const roleMeta = ROLE_META[currentUser.role];
  const activeItem = findActiveNavItem(currentLocation, navItems);
  const pageTitle = resolvePageTitle(currentLocation, activeItem);
  const bottomNavItems = buildMobileBottomNavItems(roleMeta.badgeRole, childId);

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div
      className="pixel-app-shell min-h-screen text-(--foreground)"
      data-role-shell={roleMeta.shellRole}
      data-shell-mode={roleMeta.shellMode}
    >
      <ShellTopbar
        activeItem={activeItem}
        currentUser={currentUser}
        navItems={navItems}
        onLogout={handleLogout}
        pageTitle={pageTitle}
        pathname={currentLocation}
        roleMeta={roleMeta}
      />

      {roleMeta.shellMode === "sidebar" ? (
        <DesktopSidebar
          currentUser={currentUser}
          navGroups={navGroups}
          onLogout={handleLogout}
          pathname={currentLocation}
          roleMeta={roleMeta}
        />
      ) : null}

      <div
        className={cn(
          "pixel-shell-stage",
          roleMeta.shellMode === "sidebar" ? "lg:pl-[196px]" : "lg:pl-0",
          roleMeta.shellMode === "mobile-app" && "parent-app-stage"
        )}
      >
        <main className="pixel-app-main min-h-[calc(100vh-86px)] overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+5.9rem)] sm:min-h-[calc(100vh-72px)] lg:min-h-[calc(100vh-80px)] lg:pb-0">
          {children}
        </main>
        <MobileBottomTabBar items={bottomNavItems} pathname={currentLocation} />
      </div>
    </div>
  );
}

type CurrentShellUser = {
  avatar: string;
  name: string;
  role: AccountRole;
  className?: string;
  childIds?: string[];
};

function ShellTopbar({
  activeItem,
  currentUser,
  navItems,
  onLogout,
  pageTitle,
  pathname,
  roleMeta,
}: {
  activeItem?: PrimaryNavItem;
  currentUser: CurrentShellUser;
  navItems: PrimaryNavItem[];
  onLogout: () => void;
  pageTitle: string;
  pathname: string;
  roleMeta: (typeof ROLE_META)[AccountRole];
}) {
  const topNavItems = roleMeta.shellMode === "top-tabs" ? navItems.slice(0, 7) : navItems.slice(0, 5);
  const showUnavailableNotice = (feature: string) => {
    toast.info(`${feature}暂未开放`, {
      description: "当前为演示环境，后续将接入真实业务消息与检索能力。",
    });
  };

  return (
    <header className="pixel-topbar sticky top-0 z-50 border-b border-slate-200/80 bg-white/94 shadow-[0_1px_0_rgb(15_23_42_/_0.03),0_10px_34px_rgb(79_70_229_/_0.06)] backdrop-blur-xl">
      <div className="flex min-h-[86px] items-center justify-between gap-3 px-4 sm:min-h-[72px] sm:px-6 lg:min-h-20 lg:px-8">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <MobileNav onLogout={onLogout} />
          <Link href="/" className="hidden min-w-0 shrink-0 items-center gap-3 sm:flex">
            <BrandMark compact={roleMeta.shellMode === "sidebar"} />
            <div className="min-w-0">
              <p className="truncate text-base font-bold leading-tight text-slate-950 lg:text-lg">智慧托育平台</p>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500">普惠托育智慧管理平台</p>
            </div>
          </Link>
          <Link href="/" className="flex min-w-0 items-center gap-2 sm:hidden">
            <BrandMark compact />
            <div className="min-w-0">
              <p className="truncate text-base font-bold leading-tight text-slate-950">智慧托育平台</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{roleMeta.shortDescription}</p>
            </div>
          </Link>
        </div>

        {roleMeta.shellMode === "top-tabs" ? (
          <DesktopTopTabs items={topNavItems} pathname={pathname} />
        ) : roleMeta.shellMode === "mobile-app" ? (
          <ParentDesktopPills items={topNavItems} pathname={pathname} />
        ) : (
          <div className="hidden min-w-0 items-center gap-2 text-sm font-medium text-slate-500 xl:flex">
            <span>{roleMeta.navCue}</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span className="truncate text-slate-900">{activeItem?.label ?? pageTitle}</span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => showUnavailableNotice("通知中心")}
            className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_10px_24px_rgb(15_23_42_/_0.08)] ring-1 ring-slate-200/80 sm:hidden"
            aria-label="通知"
            title="通知中心暂未开放"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              3
            </span>
          </button>
          <button
            type="button"
            onClick={() => showUnavailableNotice("消息中心")}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_10px_24px_rgb(15_23_42_/_0.08)] ring-1 ring-slate-200/80 sm:hidden"
            aria-label="消息"
            title="消息中心暂未开放"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </button>
          <ShellIconButton label="搜索" onClick={() => showUnavailableNotice("全局搜索")}>
            <Search className="h-4 w-4" aria-hidden="true" />
          </ShellIconButton>
          <ShellIconButton label="通知" badge="6" onClick={() => showUnavailableNotice("通知中心")}>
            <Bell className="h-4 w-4" aria-hidden="true" />
          </ShellIconButton>
          <ShellIconButton label="消息" onClick={() => showUnavailableNotice("消息中心")}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </ShellIconButton>
          <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-[0_10px_26px_rgb(15_23_42_/_0.07)] sm:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-cyan-50 text-lg">
              {currentUser.avatar}
            </span>
            <div className="hidden min-w-0 xl:block">
              <p className="truncate text-sm font-semibold leading-tight text-slate-950">{currentUser.name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{currentUser.className ?? currentUser.role}</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 xl:block" aria-hidden="true" />
          </div>
          <div className="hidden sm:block">
            <RoleBadge role={roleMeta.badgeRole} label={roleMeta.shellLabel} />
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 sm:flex"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            退出
          </button>
        </div>
      </div>
    </header>
  );
}

function DesktopTopTabs({ items, pathname }: { items: PrimaryNavItem[]; pathname: string }) {
  return (
    <nav aria-label="桌面主导航" className="hidden min-w-0 flex-1 items-center justify-center gap-1 px-3 lg:flex">
      {items.map((item, index) => {
        const Icon = ICON_MAP[item.icon];
        const active = isPrimaryNavItemActive(pathname, item.href);

        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-semibold transition xl:px-4",
              index > 3 ? "hidden xl:flex" : "flex",
              active
                ? "bg-indigo-50 text-indigo-700 shadow-[inset_0_-3px_0_rgb(99_102_241)]"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ParentDesktopPills({ items, pathname }: { items: PrimaryNavItem[]; pathname: string }) {
  return (
    <nav aria-label="家长端快捷导航" className="hidden min-w-0 flex-1 justify-center gap-2 px-4 lg:flex">
      {items.map((item) => {
        const Icon = ICON_MAP[item.icon];
        const active = isPrimaryNavItemActive(pathname, item.href);

        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold shadow-sm transition",
              active
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-transparent bg-white/70 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function DesktopSidebar({
  currentUser,
  navGroups,
  onLogout,
  pathname,
  roleMeta,
}: {
  currentUser: CurrentShellUser;
  navGroups: PrimaryNavGroup[];
  onLogout: () => void;
  pathname: string;
  roleMeta: (typeof ROLE_META)[AccountRole];
}) {
  return (
    <aside className="pixel-sidebar fixed bottom-0 left-0 top-[80px] z-40 hidden w-[196px] flex-col border-r border-slate-200/80 bg-white/92 shadow-[12px_0_36px_rgb(15_23_42_/_0.05)] backdrop-blur-xl lg:flex">
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className={cn("mb-6 rounded-2xl border px-4 py-3 text-xs font-semibold", roleMeta.accentClassName)}>
          {roleMeta.description}
        </div>
        <SidebarNav pathname={pathname} navGroups={navGroups} />
      </div>
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm">
              {currentUser.avatar}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{currentUser.name}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{currentUser.className ?? currentUser.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:text-indigo-700"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            退出登录
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarNav({
  pathname,
  navGroups,
}: {
  pathname: string;
  navGroups: PrimaryNavGroup[];
}) {
  return (
    <nav aria-label="主导航" className="space-y-5">
      {navGroups.map((group) => (
        <div key={group.key}>
          <p className="px-2 text-xs font-semibold text-slate-400">{group.label}</p>
          <div className="mt-2 space-y-1.5">
            {group.items.map((item) => (
              <SidebarNavLink key={`${item.href}-${item.label}`} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarNavLink({ item, pathname }: { item: PrimaryNavItem; pathname: string }) {
  const Icon = ICON_MAP[item.icon];
  const active = isPrimaryNavItemActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-12 items-center gap-2.5 rounded-2xl px-3 text-sm font-semibold transition-all",
        active
          ? "bg-[linear-gradient(135deg,#6557ff,#7c3aed)] text-white shadow-[0_14px_30px_rgb(99_102_241_/_0.24)]"
          : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
          active ? "bg-white/18 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-indigo-600"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

type MobileBottomTabItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  highlight?: boolean;
};

function buildMobileBottomNavItems(role: RoleBadgeRole, childId?: string): MobileBottomTabItem[] {
  const childQuery = childId ? `child=${encodeURIComponent(childId)}` : "";
  const withChild = (path: string) => (childQuery ? `${path}?${childQuery}` : path);

  if (role === "parent") {
    return [
      { href: withChild("/parent"), label: "首页", icon: Home, match: (pathname) => stripLocationPath(pathname) === "/parent" },
      { href: withChild("/parent/agent"), label: "沟通", icon: MessageCircle, match: (pathname) => pathname.startsWith("/parent/agent"), highlight: true },
      { href: withChild("/growth"), label: "档案", icon: BookHeart, match: (pathname) => stripLocationPath(pathname) === "/growth" },
      { href: withChild("/parent/storybook"), label: "绘本", icon: BookHeart, match: (pathname) => pathname.startsWith("/parent/storybook") },
      { href: withChild("/parent/reminders"), label: "提醒", icon: Bell, match: (pathname) => pathname.startsWith("/parent/reminders") },
    ];
  }

  if (role === "teacher") {
    return [
      { href: "/teacher", label: "工作台", icon: House, match: (pathname) => stripLocationPath(pathname) === "/teacher" || stripLocationPath(pathname) === "/teacher/home" },
      { href: "/health", label: "晨检", icon: ShieldCheck, match: (pathname) => stripLocationPath(pathname) === "/health" },
      { href: "/diet", label: "饮食", icon: Salad, match: (pathname) => stripLocationPath(pathname) === "/diet" },
      { href: "/growth", label: "成长", icon: BookHeart, match: (pathname) => stripLocationPath(pathname) === "/growth" },
      { href: "/teacher/agent", label: "AI", icon: Sparkles, match: (pathname) => pathname.startsWith("/teacher/agent"), highlight: true },
    ];
  }

  return [
    { href: "/admin", label: "首页", icon: House, match: (pathname) => stripLocationPath(pathname) === "/admin" },
    { href: "/admin/agent", label: "AI", icon: Sparkles, match: (pathname) => isPrimaryNavItemActive(pathname, "/admin/agent"), highlight: true },
    { href: "/admin/agent?action=weekly-report", label: "周报", icon: Monitor, match: (pathname) => isPrimaryNavItemActive(pathname, "/admin/agent?action=weekly-report") },
    { href: "/children", label: "儿童", icon: Users, match: (pathname) => stripLocationPath(pathname) === "/children" },
    { href: "/health", label: "健康", icon: ShieldCheck, match: (pathname) => stripLocationPath(pathname) === "/health" },
  ];
}

function stripLocationPath(value: string) {
  return (value.split("#")[0] ?? value).split("?")[0] || "/";
}

function MobileBottomTabBar({ items, pathname }: { items: MobileBottomTabItem[]; pathname: string }) {
  return (
    <nav
      className="pixel-bottom-tabs fixed inset-x-3 bottom-3 z-40 rounded-[1.65rem] border border-white/85 bg-white/94 px-2 py-2 shadow-[0_18px_52px_rgb(15_23_42_/_0.18)] backdrop-blur-xl lg:hidden"
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
                    ? "bg-[linear-gradient(135deg,#6757ff,#8b5cf6)] text-white shadow-[0_10px_24px_rgb(99_102_241_/_0.26)]"
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

function ShellIconButton({
  badge,
  children,
  label,
  onClick,
}: {
  badge?: string;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative hidden h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 sm:flex"
      aria-label={label}
      title={`${label}暂未开放`}
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

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6656ff,#7c5cff_56%,#26c7bd)] text-white shadow-[0_14px_36px_rgb(99_102_241_/_0.25)]",
        compact ? "h-11 w-11" : "h-12 w-12"
      )}
    >
      <ShieldCheck className={compact ? "h-5 w-5" : "h-6 w-6"} aria-hidden="true" />
    </span>
  );
}

function findActiveNavItem(currentLocation: string, navItems: PrimaryNavItem[]) {
  return [...navItems].reverse().find((item) => isPrimaryNavItemActive(currentLocation, item.href));
}

function resolvePageTitle(currentLocation: string, activeItem?: PrimaryNavItem) {
  if (isPrimaryNavItemActive(currentLocation, "/admin/agent?action=weekly-report")) {
    return "周报分析";
  }

  const pathname = currentLocation.split("?")[0] ?? currentLocation;
  const routeTitle = ROUTE_TITLE_MAP.find((item) => {
    if (item.prefix === "/") {
      return pathname === "/";
    }
    return pathname === item.prefix || pathname.startsWith(`${item.prefix}/`);
  });

  return routeTitle?.title ?? activeItem?.label ?? "智慧托育平台";
}
