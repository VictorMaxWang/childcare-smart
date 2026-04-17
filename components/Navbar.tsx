"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Baby, BookHeart, House, Monitor, Salad, ShieldCheck, Users } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import MobileNav from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import MagneticCTA from "@/components/visuals/MagneticCTA";
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

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, logout } = useApp();

  if (pathname === "/login") {
    return null;
  }

  const navItems = buildPrimaryNavItems(currentUser.role);

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-white/60 bg-white/70 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-2xl after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-linear-to-r after:from-indigo-500/22 after:via-sky-500/12 after:to-transparent after:content-['']">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <MagneticCTA strength={8}>
          <Link href="/" className="group flex items-center gap-3 font-bold text-(--primary)">
            <div className="glass-surface surface-luminous flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 shadow-[var(--shadow-card)] transition-transform duration-300 group-hover:-translate-y-0.5">
              <Baby className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <span className="block text-base leading-none text-slate-900">鏅儬鎵樿偛鏅烘収骞冲彴</span>
              <span className="mt-1 hidden text-[11px] font-medium text-slate-400 sm:block">
                Smart Childcare Operations Suite
              </span>
            </div>
          </Link>
        </MagneticCTA>

        <div className="hidden flex-1 items-center justify-center gap-1 overflow-x-auto md:flex">
          {navItems.map(({ href, label, icon }) => {
            const Icon = ICON_MAP[icon];
            const active = isPrimaryNavItemActive(pathname, href);

            return (
              <Link
                key={`${href}-${label}`}
                href={href}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all after:absolute after:bottom-0 after:left-4 after:h-0.5 after:rounded-full after:transition-all after:duration-300 after:content-['']",
                  active
                    ? "border border-white/70 bg-white/82 text-indigo-600 shadow-[var(--shadow-card)] after:w-[calc(100%-2rem)] after:bg-indigo-500"
                    : "text-slate-600 after:w-0 hover:bg-white/68 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="glass-surface surface-solid rounded-2xl px-4 py-2 text-right ring-1 ring-indigo-100/80">
            <p className="text-xs text-slate-400">褰撳墠韬唤</p>
            <p className="text-sm font-semibold text-slate-700">
              {currentUser.avatar} {currentUser.name} 路 {currentUser.role}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            閫€鍑虹櫥褰?
          </Button>
        </div>

        <MobileNav onLogout={handleLogout} />
      </div>
    </nav>
  );
}
