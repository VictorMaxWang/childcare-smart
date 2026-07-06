import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "../lib/store";
import AppShell from "@/components/Navbar";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";

const enableVercelAnalytics =
  process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "1" ||
  process.env.VERCEL_ENV === "production";

export const metadata: Metadata = {
  title: "慧育童行 | SmartChildcare Agent",
  description: "面向托育场景的多智能体闭环决策系统",
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
                actionButton: "rounded-[var(--replica-radius-control)] bg-indigo-600 [background-image:var(--replica-gradient-primary)] px-3 py-2 text-sm font-semibold text-white",
                cancelButton: "rounded-[var(--replica-radius-control)] border border-[var(--replica-border)] bg-white px-3 py-2 text-sm font-semibold text-(--text-secondary)",
                closeButton: "border border-[var(--replica-border)] bg-white text-(--text-tertiary)",
              },
            }}
          />
        </AppProvider>
        {enableVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
