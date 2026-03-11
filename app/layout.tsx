import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "../lib/store";
import Navbar from "@/components/Navbar";
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
          <Navbar />
          <main className="min-h-[calc(100vh-64px)] bg-[var(--background)]">
            {children}
          </main>
          <Toaster position="top-right" richColors closeButton />
        </AppProvider>
        <Analytics />
      </body>
    </html>
  );
}
