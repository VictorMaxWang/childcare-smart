"use client";

import type { ReactNode } from "react";
import { BrainCircuit } from "lucide-react";
import ConsultationDebugMetaCard from "./ConsultationDebugMetaCard";
import ConsultationStageTimeline from "./ConsultationStageTimeline";
import ProviderTraceBadge from "./ProviderTraceBadge";
import TraceStepCard from "./TraceStepCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ConsultationTraceCallout,
  ConsultationTraceViewModel,
} from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

function getStatusVariant(status: ConsultationTraceViewModel["overallStatus"]) {
  if (status === "error") return "destructive" as const;
  if (status === "streaming" || status === "partial") return "warning" as const;
  if (status === "done") return "success" as const;
  return "outline" as const;
}

function getCalloutClasses(callout: ConsultationTraceCallout) {
  if (callout.tone === "error") {
    return "border-rose-300/20 bg-rose-400/10 text-rose-100";
  }
  if (callout.tone === "warning") {
    return "border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100";
  }
  if (callout.tone === "success") {
    return "border-violet-300/20 bg-violet-400/10 text-violet-100";
  }
  return "border-indigo-300/18 bg-indigo-400/10 text-indigo-100";
}

export default function ConsultationTracePanel({
  viewModel,
  className,
  headerActions,
}: {
  viewModel: ConsultationTraceViewModel;
  className?: string;
  headerActions?: ReactNode;
}) {
  return (
    <div className={cn("consultation-trace-panel space-y-4", className)}>
      <Card
        surface="luminous"
        glow="brand"
        interactive={false}
        className="relative overflow-hidden border-white/14 bg-[linear-gradient(180deg,rgba(22,24,58,0.96),rgba(9,11,28,0.94))]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(139,92,246,0.24),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(112,104,255,0.16),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(129,140,248,0.14),transparent_40%)]"
        />
        <CardHeader className="relative gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={viewModel.mode === "debug" ? "warning" : "info"}>
                  {viewModel.mode === "debug" ? "璇︾粏鏌ョ湅" : "甯歌灞曠ず"}
                </Badge>
                <Badge variant={getStatusVariant(viewModel.overallStatus)}>
                  {viewModel.overallStatusLabel}
                </Badge>
                {viewModel.mode === "debug" && viewModel.traceId ? (
                  <Badge variant="outline">{viewModel.traceId}</Badge>
                ) : null}
              </div>
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-xl text-white">
                  <BrainCircuit className="h-5 w-5 text-violet-100" />
                  楂橀闄╀細璇婅繃绋?
                </CardTitle>
                <p className="max-w-3xl text-sm leading-7 text-white/70">
                  {viewModel.streamMessage}
                </p>
              </div>
              {viewModel.providerTrace ? (
                <ProviderTraceBadge
                  trace={viewModel.providerTrace}
                  compact={viewModel.mode !== "debug"}
                />
              ) : null}
            </div>

            {headerActions ? (
              <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 md:justify-end">
                {headerActions}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="relative space-y-3">
          {viewModel.syncTargets.length ? (
            <div className="rounded-[1.6rem] border border-white/12 bg-white/6 p-4 shadow-[var(--shadow-card)]">
              <p className="text-sm font-semibold text-white">缁撴灉鍚屾鍘诲悜</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {viewModel.syncTargets.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {!viewModel.hasContent && viewModel.overallStatus === "idle" ? (
            <div className="rounded-[1.6rem] border border-dashed border-white/14 bg-white/5 p-4 text-sm leading-6 text-white/60 shadow-[var(--shadow-card)]">
              鍚姩浼氳瘖鍚庯紝杩欓噷浼氭寜鈥滈暱鏈熺敾鍍?{"->"} 鏈€杩戜細璇?/ 蹇収 {"->"} 褰撳墠寤鸿鈥濅緷娆″睍寮€锛屼究浜庤€佸笀璁茶В涓庢煡鐪嬮噸鐐广€?
            </div>
          ) : null}
        </CardContent>
      </Card>

      {viewModel.callouts.length ? (
        <div className="space-y-3">
          {viewModel.callouts.map((callout, index) => (
            <div
              key={`${callout.title}-${index}`}
              className={cn(
                "rounded-[1.4rem] border p-4 shadow-[var(--shadow-card)]",
                getCalloutClasses(callout)
              )}
            >
              <p className="text-sm font-semibold">{callout.title}</p>
              <p className="mt-1 text-sm leading-6">{callout.description}</p>
            </div>
          ))}
        </div>
      ) : null}

      <ConsultationStageTimeline
        stages={viewModel.stages}
        progressValue={viewModel.progressValue}
        overallStatus={viewModel.overallStatus}
        overallStatusLabel={viewModel.overallStatusLabel}
      />

      <div className="space-y-3">
        {viewModel.stages.map((stage) => (
          <TraceStepCard key={stage.key} stage={stage} mode={viewModel.mode} />
        ))}
      </div>

      {viewModel.mode === "debug" ? (
        <ConsultationDebugMetaCard
          traceId={viewModel.traceId}
          providerTrace={viewModel.providerTrace}
          memoryMeta={viewModel.memoryMeta as Record<string, unknown> | null}
          traceMemoryMeta={viewModel.traceMemoryMeta}
          rawStageInfo={viewModel.rawStageInfo}
          defaultOpen={false}
        />
      ) : null}
    </div>
  );
}
