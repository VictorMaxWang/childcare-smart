"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Baby, BookHeart, House, Monitor, Salad, ShieldCheck, Users } from "lucide-react";
import MobileNav from "@/components/MobileNav";
import { Button } from "@/components/ui/button";
import MagneticCTA from "@/components/visuals/MagneticCTA";
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

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, logout } = useApp();

  if (pathname === "/login" || pathname === "/auth/login") {
    return null;
  }

  const navItems = buildPrimaryNavItems(currentUser.role);
  const roleLabel = ROLE_LABELS[currentUser.role] ?? currentUser.role;

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="stage-navbar sticky top-0 z-40 border-b border-white/10 bg-[rgba(8,10,24,0.78)] shadow-[0_24px_70px_rgba(2,6,23,0.42)] backdrop-blur-2xl after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:bg-linear-to-r after:from-indigo-400/35 after:via-violet-300/25 after:to-transparent after:content-['']">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <MagneticCTA strength={8}>
          <Link href="/" className="group flex items-center gap-3 font-bold">
            <div className="premium-glass-panel surface-glass flex h-10 w-10 items-center justify-center rounded-2xl border border-white/14 shadow-[var(--shadow-card)] transition-transform duration-300 group-hover:-translate-y-0.5">
              <Baby className="h-5 w-5 text-indigo-200" />
            </div>
            <div>
              <span className="block text-base leading-none text-white">Childcare Smart</span>
              <span className="mt-1 hidden text-[11px] font-medium text-white/42 sm:block">
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
                    ? "border border-white/14 bg-white/10 text-white shadow-[var(--shadow-card)] after:w-[calc(100%-2rem)] after:bg-violet-300"
                    : "text-white/68 after:w-0 hover:bg-white/6 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="premium-glass-panel surface-glass rounded-2xl border border-white/12 px-4 py-2 text-right ring-1 ring-white/6">
            <p className="text-xs text-white/42">Signed in</p>
            <p className="text-sm font-semibold text-white">
              {currentUser.avatar} {currentUser.name} <span className="text-white/46">·</span> {roleLabel}
            </p>
          </div>
          <Button
            variant="outline"
            className="border-white/14 bg-white/6 text-white hover:bg-white/10 hover:text-white"
            onClick={handleLogout}
          >
            Sign out
          </Button>
        </div>

        <MobileNav onLogout={handleLogout} />
      </div>
    </nav>
  );
}
