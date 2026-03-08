"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Baby, BookHeart, LayoutDashboard, Salad, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navItems = [
  { href: "/", label: "数据概览", icon: LayoutDashboard },
  { href: "/children", label: "幼儿档案", icon: Users },
  { href: "/health", label: "晨检与健康", icon: ShieldCheck },
  { href: "/growth", label: "成长行为", icon: BookHeart },
  { href: "/diet", label: "饮食记录", icon: Salad },
  { href: "/parent", label: "家长端", icon: Baby },
];

export default function Navbar() {
  const pathname = usePathname();
  const { currentUser, users, switchUser } = useApp();

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/80 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-6 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 font-bold text-[var(--primary)]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
            <Baby className="h-5 w-5 text-indigo-600" />
          </div>
          <span className="text-base">普惠托育智慧平台</span>
        </Link>

        {/* Nav Links */}
        <div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right md:block">
            <p className="text-xs text-slate-400">当前身份</p>
            <p className="text-sm font-semibold text-slate-700">
              {currentUser.avatar} {currentUser.name} · {currentUser.role}
            </p>
          </div>
          <Select value={currentUser.id} onValueChange={switchUser}>
            <SelectTrigger className="w-[170px] bg-white">
              <SelectValue placeholder="切换角色" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.avatar} {user.name}（{user.role}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </nav>
  );
}
