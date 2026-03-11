"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
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
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-100 text-amber-600">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-slate-800">页面加载出现异常</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
        系统已拦截本次错误，当前不会影响你已有的数据。可以先重试页面，如仍持续出现，再检查接口或环境变量配置。
      </p>
      <Button className="mt-6" onClick={reset}>
        重试加载
      </Button>
    </div>
  );
}