"use client";

import type { ReactNode } from "react";
import { BrainCircuit } from "lucide-react";
import ConsultationDebugMetaCard from "./ConsultationDebugMetaCard";
import ConsultationStageTimeline from "./ConsultationStageTimeline";
import ProviderTraceBadge from "./ProviderTraceBadge";
import TraceStepCard from "./TraceStepCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsultationTraceCallout, ConsultationTraceViewModel } from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

function getStatusVariant(status: ConsultationTraceViewModel["overallStatus"]) {
  if (status === "error") return "destructive" as const;
  if (status === "streaming" || status === "partial") return "warning" as const;
  if (status === "done") return "success" as const;
  return "outline" as const;
}

function getCalloutClasses(callout: ConsultationTraceCallout) {
  if (callout.tone === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  if (callout.tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (callout.tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
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
    <div className={cn("space-y-4", className)}>
      <Card className="border-slate-100 bg-white/95 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={viewModel.mode === "debug" ? "warning" : "info"}>
                  {viewModel.mode === "debug" ? "详细查看" : "常规展示"}
                </Badge>
                <Badge variant={getStatusVariant(viewModel.overallStatus)}>{viewModel.overallStatusLabel}</Badge>
                {viewModel.mode === "debug" && viewModel.traceId ? <Badge variant="outline">{viewModel.traceId}</Badge> : null}
              </div>
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                  <BrainCircuit className="h-5 w-5 text-indigo-500" />
                  高风险会诊过程
                </CardTitle>
                <p className="text-sm leading-7 text-slate-600">{viewModel.streamMessage}</p>
              </div>
              {viewModel.providerTrace ? <ProviderTraceBadge trace={viewModel.providerTrace} compact={viewModel.mode !== "debug"} /> : null}
            </div>

            {headerActions ? <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 md:justify-end">{headerActions}</div> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {viewModel.syncTargets.length ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
              <p className="text-sm font-semibold text-emerald-900">结果同步去向</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {viewModel.syncTargets.map((item) => (
                  <Badge key={item} variant="success">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {!viewModel.hasContent && viewModel.overallStatus === "idle" ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
              启动会诊后，这里会按“长期画像 {"->"} 最近会诊 / 快照 {"->"} 当前建议”依次展开，便于老师讲解与查看重点。
            </div>
          ) : null}
        </CardContent>
      </Card>

      {viewModel.callouts.length ? (
        <div className="space-y-3">
          {viewModel.callouts.map((callout, index) => (
            <div key={`${callout.title}-${index}`} className={cn("rounded-2xl border p-4", getCalloutClasses(callout))}>
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
