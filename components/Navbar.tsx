"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Baby,
  BookHeart,
  ChevronRight,
  House,
  LogOut,
  Monitor,
  Salad,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import MobileNav from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import { RoleBadge, type RoleBadgeRole } from "@/components/ui/role-badge";
import type { AccountRole } from "@/lib/auth/accounts";
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

const ROLE_META: Record<
  AccountRole,
  {
    shellLabel: string;
    badgeRole: RoleBadgeRole;
    description: string;
    accentClassName: string;
  }
> = {
  机构管理员: {
    shellLabel: "园长端",
    badgeRole: "director",
    description: "全园运营、风险优先级与数据决策",
    accentClassName: "border-indigo-100 bg-indigo-50 text-indigo-700",
  },
  教师: {
    shellLabel: "教师端",
    badgeRole: "teacher",
    description: "班级任务、每日记录与家园沟通",
    accentClassName: "border-violet-100 bg-violet-50 text-violet-700",
  },
  家长: {
    shellLabel: "家长端",
    badgeRole: "parent",
    description: "孩子状态、成长回看与反馈闭环",
    accentClassName: "border-emerald-100 bg-emerald-50 text-emerald-700",
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
  const { currentUser, logout } = useApp();

  const hideShell = pathname === "/login" || pathname.startsWith("/auth/login");
  const navItems = buildPrimaryNavItems(currentUser.role);
  const navGroups = buildPrimaryNavGroups(currentUser.role);
  const roleMeta = ROLE_META[currentUser.role];
  const activeItem = findActiveNavItem(pathname, navItems);
  const pageTitle = resolvePageTitle(pathname, activeItem);
  const pageDescription = currentUser.className
    ? `${roleMeta.description} · ${currentUser.className}`
    : roleMeta.description;

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  if (hideShell) {
    return <main className="min-h-screen bg-(--background)">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-(--app-background) text-(--foreground)">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-(--border) bg-white/95 shadow-[8px_0_28px_rgb(15_23_42_/_0.04)] backdrop-blur-xl lg:flex">
        <SidebarBrand roleMeta={roleMeta} />
        <SidebarNav pathname={pathname} navGroups={navGroups} />
        <SidebarUserCard currentUser={currentUser} roleMeta={roleMeta} onLogout={handleLogout} />
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-(--border) bg-white/90 backdrop-blur-xl">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <MobileNav onLogout={handleLogout} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium text-(--text-tertiary)">
                  <span>智慧托育平台</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="truncate">{roleMeta.shellLabel}</span>
                </div>
                <h1 className="mt-0.5 truncate text-lg font-semibold leading-tight text-(--text-primary) sm:text-xl">
                  {pageTitle}
                </h1>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-3 sm:flex">
              <div className="hidden max-w-80 truncate text-right text-sm text-(--text-tertiary) xl:block">
                {pageDescription}
              </div>
              <RoleBadge role={roleMeta.badgeRole} label={roleMeta.shellLabel} />
              <div className="flex items-center gap-2 rounded-lg border border-(--border) bg-white px-3 py-2 shadow-[var(--shadow-card)]">
                <span className="text-lg" aria-hidden="true">
                  {currentUser.avatar}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-none text-(--text-primary)">
                    {currentUser.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-(--text-helper)">
                    {currentUser.className ?? currentUser.role}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                退出
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-64px)] overflow-x-hidden bg-(--app-background)">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarBrand({
  roleMeta,
}: {
  roleMeta: (typeof ROLE_META)[AccountRole];
}) {
  return (
    <div className="border-b border-(--border-subtle) px-5 py-5">
      <Link href="/" className="group flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-(--primary-soft) text-(--primary) shadow-[var(--shadow-card)] transition-transform duration-200 group-hover:-translate-y-0.5">
          <Baby className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-(--text-primary)">普惠托育智慧平台</p>
          <p className="mt-1 truncate text-xs text-(--text-tertiary)">托育机构运营管理后台</p>
        </div>
      </Link>
      <div
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
          roleMeta.accentClassName
        )}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {roleMeta.description}
      </div>
    </div>
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
    <nav aria-label="主导航" className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
      {navGroups.map((group) => (
        <div key={group.key}>
          <p className="px-3 text-xs font-semibold text-(--text-helper)">{group.label}</p>
          <div className="mt-2 space-y-1">
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
        "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-(--primary-soft) text-(--primary-soft-foreground) shadow-[inset_3px_0_0_var(--primary)]"
          : "text-(--text-secondary) hover:bg-(--hover-surface) hover:text-(--text-primary)"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
          active ? "bg-white text-(--primary)" : "bg-(--panel-subtle) text-(--text-tertiary) group-hover:text-(--primary)"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarUserCard({
  currentUser,
  roleMeta,
  onLogout,
}: {
  currentUser: { avatar: string; name: string; role: AccountRole; className?: string };
  roleMeta: (typeof ROLE_META)[AccountRole];
  onLogout: () => void;
}) {
  return (
    <div className="border-t border-(--border-subtle) p-4">
      <div className="rounded-lg border border-(--border) bg-(--panel-subtle) p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-xl shadow-[var(--shadow-card)]">
            <span aria-hidden="true">{currentUser.avatar}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-(--text-primary)">{currentUser.name}</p>
              <RoleBadge role={roleMeta.badgeRole} label={roleMeta.shellLabel} />
            </div>
            <p className="mt-1 truncate text-xs text-(--text-tertiary)">
              {currentUser.className ?? currentUser.role}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout} className="mt-4 w-full gap-2">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          退出登录
        </Button>
      </div>
    </div>
  );
}

function findActiveNavItem(pathname: string, navItems: PrimaryNavItem[]) {
  return [...navItems].reverse().find((item) => isPrimaryNavItemActive(pathname, item.href));
}

function resolvePageTitle(pathname: string, activeItem?: PrimaryNavItem) {
  const routeTitle = ROUTE_TITLE_MAP.find((item) => {
    if (item.prefix === "/") {
      return pathname === "/";
    }
    return pathname === item.prefix || pathname.startsWith(`${item.prefix}/`);
  });

  return routeTitle?.title ?? activeItem?.label ?? "智慧托育平台";
}
