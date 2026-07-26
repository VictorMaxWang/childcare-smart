"use client";

import { useEffect } from "react";
import { Home, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state-block";
import { isChunkLoadError } from "@/lib/errors/chunk-load";

const CHUNK_RETRY_STORAGE_KEY = "smartchildcare.chunk-retry-at.v1";
const CHUNK_RETRY_COOLDOWN_MS = 60_000;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkLoadFailed = isChunkLoadError(error);

  useEffect(() => {
    console.error(error);

    if (!isChunkLoadError(error)) return;

    try {
      const lastRetryAt = Number(window.sessionStorage.getItem(CHUNK_RETRY_STORAGE_KEY));
      if (Number.isFinite(lastRetryAt) && Date.now() - lastRetryAt < CHUNK_RETRY_COOLDOWN_MS) {
        return;
      }

      // 发布切换或短暂网络抖动可能让旧页面缺少一个分片；只自动整页重载一次，
      // 第二次失败时停在错误页，避免网络持续异常时形成刷新循环。
      window.sessionStorage.setItem(CHUNK_RETRY_STORAGE_KEY, String(Date.now()));
      window.location.reload();
    } catch {
      // 隐私模式可能禁用 sessionStorage，此时保留下面的手动重载入口。
    }
  }, [error]);

  return (
    <div className="app-page flex min-h-[calc(100vh-64px)] items-center justify-center page-enter">
      <ErrorState
        className="w-full max-w-3xl"
        title="页面出现异常"
        description={
          chunkLoadFailed
            ? "页面资源加载中断。系统已尝试恢复；如果页面没有自动刷新，请重新加载一次。"
            : "系统已拦截当前错误。可以先重试当前页面；如果问题持续存在，请检查最近录入的数据或接口配置。"
        }
        action={
          <>
            <Button
              onClick={chunkLoadFailed ? () => window.location.reload() : reset}
              className="gap-2"
            >
              <RefreshCcw className="h-4 w-4" />
              {chunkLoadFailed ? "重新加载页面" : "重试当前页面"}
            </Button>
            <Button variant="outline" onClick={() => window.location.assign("/")} className="gap-2">
              <Home className="h-4 w-4" />
              返回首页
            </Button>
          </>
        }
      />
    </div>
  );
}
