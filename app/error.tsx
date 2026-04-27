"use client";

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state-block";

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
    <div className="app-page flex min-h-[calc(100vh-64px)] items-center justify-center page-enter">
      <ErrorState
        className="w-full max-w-3xl"
        title="页面出现异常"
        description="系统已拦截当前错误，建议先重试当前页面；如果问题持续存在，再检查最近的录入数据或接口配置。"
        action={
          <>
            <Button onClick={reset} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              重试当前页面
            </Button>
            <Button variant="outline" onClick={() => window.location.assign("/")}>
              返回首页
            </Button>
          </>
        }
      />
    </div>
  );
}
