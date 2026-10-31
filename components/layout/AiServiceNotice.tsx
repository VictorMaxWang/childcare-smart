"use client";

import { useEffect, useState } from "react";

export function AiServiceNotice() {
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<Record<string, { configured?: boolean; status?: string; live?: boolean; verification?: { status?: string } }> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // 状态由运行环境提供，避免把临时服务故障固化进前端构建。
    void fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!controller.signal.aborted) {
          setUnavailable(body?.serviceStatus?.aiUnavailable === true);
          setCapabilities(body?.serviceStatus?.aiCapabilities ?? body?.aiCapabilities ?? null);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const labels: Record<string, string> = { llm: "文字与方案", vision: "识图", ocr: "材料识别", asr: "语音转写", tts: "朗读", storybookImage: "绘本图片", storybookAudio: "绘本音频" };
  return (
    // 保留固定摘要行，异步状态抵达时不会把移动端正文整体向下推移；分项由用户主动展开。
    <details data-testid={unavailable ? "ai-service-unavailable" : "ai-capability-status"} className="mx-auto my-3 min-h-12 w-full max-w-[92rem] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
      <summary className="cursor-pointer" aria-live="polite">
        {loading ? "正在读取 AI 能力状态…" : unavailable ? "AI 服务维护中，记录功能正常。" : capabilities ? "AI 能力状态 · 查看各项能力" : "AI 状态暂时无法读取"}
      </summary>
      {!unavailable && capabilities && <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(labels).map(([key, label]) => {
          const capability = capabilities[key];
          const state = capability?.verification?.status === "failed" || capability?.status === "provider-unavailable" ? "暂时失败" : capability?.live ? "最近调用通过" : capability?.configured ? "已配置，待调用验证" : "未配置";
          return <li key={key}>{label}：{state}</li>;
        })}
      </ul>}
    </details>
  );
}
