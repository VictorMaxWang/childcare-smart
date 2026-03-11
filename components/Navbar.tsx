"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Baby, BookHeart, LayoutDashboard, Monitor, Salad, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import MobileNav from "@/components/MobileNav";

const navItems = [
  { href: "/", label: "数据概览", icon: LayoutDashboard },
  { href: "/children", label: "幼儿档案", icon: Users },
  { href: "/health", label: "晨检与健康", icon: ShieldCheck },
  { href: "/growth", label: "成长行为", icon: BookHeart },
  { href: "/diet", label: "饮食记录", icon: Salad },
  { href: "/parent", label: "家长端", icon: Baby },
  { href: "/teacher", label: "机构大屏", icon: Monitor },
];

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, logout } = useApp();

  if (pathname === "/login") {
    return null;
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-white/60 bg-white/75 shadow-sm backdrop-blur-xl after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-gradient-to-r after:from-indigo-500/20 after:via-violet-500/20 after:to-transparent after:content-['']">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-6 py-3">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3 font-bold text-[var(--primary)]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-sky-100 shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5">
            <Baby className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <span className="block text-base leading-none">普惠托育智慧平台</span>
            <span className="mt-1 block text-[11px] font-medium text-slate-400">Smart Childcare Operations Suite</span>
          </div>
        </Link>

        {/* Nav Links — desktop only */}
        <div className="hidden flex-1 items-center justify-center gap-1 overflow-x-auto md:flex">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors after:absolute after:bottom-0 after:left-4 after:h-0.5 after:rounded-full after:transition-all after:duration-300 after:content-['']",
                  active
                    ? "bg-indigo-50/70 text-indigo-600 after:w-[calc(100%-2rem)] after:bg-indigo-500"
                    : "text-slate-600 after:w-0 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="rounded-2xl border border-indigo-100 bg-white/70 px-4 py-2 text-right shadow-sm ring-2 ring-indigo-100">
            <p className="text-xs text-slate-400">当前身份</p>
            <p className="text-sm font-semibold text-slate-700">
              {currentUser.avatar} {currentUser.name} · {currentUser.role}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>退出登录</Button>
        </div>

        {/* Mobile hamburger */}
        <MobileNav onLogout={handleLogout} />
      </div>
    </nav>
  );
}
