"use client";

import { useMemo } from "react";
import ProviderTraceBadge from "./ProviderTraceBadge";
import { Badge } from "@/components/ui/badge";
import type { HighRiskConsultationResult } from "@/lib/ai/types";
import { buildConsultationResultTraceViewModel } from "@/lib/consultation/trace-view-model";
import { cn } from "@/lib/utils";

function getCalloutBadgeVariant(tone: "info" | "warning" | "error" | "success") {
  if (tone === "error") return "destructive" as const;
  if (tone === "warning") return "warning" as const;
  if (tone === "success") return "success" as const;
  return "info" as const;
}

function getMemoryStateLabel(memoryState: ReturnType<typeof buildConsultationResultTraceViewModel>["memoryState"]) {
  if (memoryState === "ready") return "记忆已命中";
  if (memoryState === "empty") return "空记忆";
  if (memoryState === "degraded") return "记忆降级";
  return "记忆未知";
}

export default function ConsultationStoryCard({
  result,
  className,
}: {
  result: HighRiskConsultationResult;
  className?: string;
}) {
  const viewModel = useMemo(
    () =>
      buildConsultationResultTraceViewModel({
        result,
        mode: "demo",
        streamMessage: "以下三阶段摘要适合作为园长端会诊回顾入口。",
      }),
    [result]
  );

  return (
    <div className={cn("rounded-3xl border border-white/80 bg-white/90 p-4 shadow-sm", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">三阶段故事</Badge>
            <Badge variant={viewModel.providerState === "fallback" ? "warning" : viewModel.providerState === "real" ? "success" : "outline"}>
              {viewModel.providerState === "fallback" ? "本地兜底" : viewModel.providerState === "real" ? "智能生成" : "来源未说明"}
            </Badge>
            <Badge variant={viewModel.memoryState === "degraded" ? "warning" : viewModel.memoryState === "ready" ? "success" : "outline"}>
              {getMemoryStateLabel(viewModel.memoryState)}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-slate-600">{viewModel.streamMessage}</p>
        </div>
        {viewModel.providerTrace ? <ProviderTraceBadge trace={viewModel.providerTrace} compact className="sm:justify-end" /> : null}
      </div>

      <div className="mt-4 grid gap-3">
        {viewModel.stages.map((stage, index) => (
          <div key={stage.key} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={stage.status === "completed" ? "success" : "outline"}>{index + 1}</Badge>
              <p className="text-sm font-semibold text-slate-900">{stage.shortLabel}</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{stage.summary || stage.emptyState}</p>
            {stage.items.length ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">{stage.items.slice(0, 2).join("；")}</p>
            ) : null}
          </div>
        ))}
      </div>

      {viewModel.callouts.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {viewModel.callouts
            .filter((callout) => callout.tone !== "success")
            .slice(0, 2)
            .map((callout, index) => (
              <Badge key={`${callout.title}-${index}`} variant={getCalloutBadgeVariant(callout.tone)}>
                {callout.title}
              </Badge>
            ))}
        </div>
      ) : null}

      {viewModel.syncTargets.length ? (
        <p className="mt-4 text-xs leading-5 text-slate-500">同步去向：{viewModel.syncTargets.join(" / ")}</p>
      ) : null}
    </div>
  );
}
