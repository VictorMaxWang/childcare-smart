"use client";

import { useEffect, useState } from "react";

export function AiServiceNotice() {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    // 状态由运行环境提供，避免把临时服务故障固化进前端构建。
    void fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!controller.signal.aborted) {
          setUnavailable(body?.serviceStatus?.aiUnavailable === true);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!unavailable) return null;
  return (
    <div role="status" data-testid="ai-service-unavailable" className="mx-auto my-3 max-w-[92rem] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
      <strong>AI 服务暂不可用。</strong>
      记录、管理和查看功能可正常使用；AI 功能会提示暂不可用，已有规则建议会明确标注来源。
    </div>
  );
}
