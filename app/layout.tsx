import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "../lib/store";
import AppShell from "@/components/Navbar";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "普惠托育智慧管理平台",
  description: "普惠性托育机构智慧干预管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppProvider>
          <AppShell>
            {children}
          </AppShell>
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              classNames: {
                toast: "rounded-lg border border-(--border) bg-white text-(--text-primary) shadow-[var(--shadow-raised)]",
                title: "text-sm font-semibold text-(--text-primary)",
                description: "text-sm leading-5 text-(--text-secondary)",
                actionButton: "rounded-md bg-(--primary) px-3 py-2 text-sm font-medium text-white",
                cancelButton: "rounded-md border border-(--border) bg-white px-3 py-2 text-sm font-medium text-(--text-secondary)",
                closeButton: "border border-(--border) bg-white text-(--text-tertiary)",
              },
            }}
          />
        </AppProvider>
        <Analytics />
      </body>
    </html>
  );
}
