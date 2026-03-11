"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Baby, BookHeart, LayoutDashboard, Salad, ShieldCheck, Users, LogOut, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

const navItems = [
  { href: "/", label: "数据概览", icon: LayoutDashboard },
  { href: "/children", label: "幼儿档案", icon: Users },
  { href: "/health", label: "晨检与健康", icon: ShieldCheck },
  { href: "/growth", label: "成长行为", icon: BookHeart },
  { href: "/diet", label: "饮食记录", icon: Salad },
  { href: "/parent", label: "家长端", icon: Baby },
  { href: "/teacher", label: "机构大屏", icon: Monitor },
];

export default function MobileNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const { currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const close = () => setOpen(false);

  // 打开时禁止 body 滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
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
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
        aria-label={open ? "关闭导航菜单" : "打开导航菜单"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={close}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <nav
        ref={panelRef}
        id="mobile-nav-panel"
        aria-label="移动端主导航"
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-indigo-600" onClick={close}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
              <Baby className="h-5 w-5 text-indigo-600" />
            </div>
            <span className="text-sm">普惠托育智慧平台</span>
          </Link>
          <button
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  ref={href === navItems[0].href ? firstLinkRef : undefined}
                  href={href}
                  onClick={close}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer: user info + logout */}
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="mb-3 text-sm">
            <p className="text-xs text-slate-400">当前身份</p>
            <p className="font-semibold text-slate-700" aria-label={`当前身份 ${currentUser.name}，角色 ${currentUser.role}`}>
              {currentUser.avatar} {currentUser.name} · {currentUser.role}
            </p>
          </div>
          <button
            onClick={() => {
              close();
              onLogout();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </nav>
    </div>
  );
}
