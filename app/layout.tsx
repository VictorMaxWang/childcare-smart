import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "../lib/store";
import AppShell from "@/components/Navbar";
import { Analytics } from "@vercel/analytics/next";
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
                toast: "rounded-[var(--replica-radius-control)] border border-[var(--replica-border)] bg-white text-(--text-primary) shadow-[var(--replica-shadow-control)]",
                title: "text-sm font-semibold text-(--text-primary)",
                description: "text-sm leading-5 text-(--text-secondary)",
                actionButton: "rounded-[var(--replica-radius-control)] bg-[var(--replica-gradient-primary)] px-3 py-2 text-sm font-semibold text-white",
                cancelButton: "rounded-[var(--replica-radius-control)] border border-[var(--replica-border)] bg-white px-3 py-2 text-sm font-semibold text-(--text-secondary)",
                closeButton: "border border-[var(--replica-border)] bg-white text-(--text-tertiary)",
              },
            }}
          />
        </AppProvider>
        <Analytics />
      </body>
    </html>
  );
}
