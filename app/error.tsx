"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import AmbientBackground from "@/components/visuals/AmbientBackground";

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
    <AmbientBackground intensity="light" interactive={false} className="py-10">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-3xl items-center justify-center px-6 page-enter">
        <div className="surface-luminous w-full rounded-[2rem] border border-rose-100/80 p-8 text-center shadow-[var(--shadow-card-strong)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-800">椤甸潰鍑虹幇寮傚父</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            绯荤粺宸叉嫤鎴綋鍓嶉敊璇紝寤鸿鍏堥噸璇曞綋鍓嶉〉闈紱濡傛灉闂鎸佺画瀛樺湪锛屽啀妫€鏌ユ渶杩戠殑褰曞叆鏁版嵁鎴栨帴鍙ｉ厤缃€?
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={reset} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              閲嶈瘯褰撳墠椤甸潰
            </Button>
            <Button variant="outline" onClick={() => window.location.assign("/")}>
              杩斿洖棣栭〉
            </Button>
          </div>
        </div>
      </div>
    </AmbientBackground>
  );
}
