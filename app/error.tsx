"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-3xl items-center justify-center px-6 py-12 page-enter">
      <div className="w-full rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-800">页面出现异常</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          系统已拦截当前错误，建议先重试当前页面；如果问题持续存在，再检查最近的录入数据或接口配置。
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            重试当前页面
          </Button>
          <Button variant="outline" onClick={() => window.location.assign("/")}>
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}