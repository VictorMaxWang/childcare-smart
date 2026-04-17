import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "../lib/store";
import Navbar from "@/components/Navbar";
import GlobalVisualShell from "@/components/visuals/GlobalVisualShell";
import MotionProvider from "@/components/visuals/MotionProvider";
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
      <body className="site-shell antialiased">
        <MotionProvider>
          <AppProvider>
            <Navbar />
            <main className="site-main">
              <GlobalVisualShell>{children}</GlobalVisualShell>
            </main>
            <Toaster position="top-right" richColors closeButton />
          </AppProvider>
        </MotionProvider>
        <Analytics />
      </body>
    </html>
  );
}
