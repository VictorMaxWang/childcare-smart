"use client";

import { CheckCircle2, CircleDashed, LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ConsultationStageView, ConsultationTraceViewModel } from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

function StageIcon({ stage, overallStatus }: { stage: ConsultationStageView; overallStatus: ConsultationTraceViewModel["overallStatus"] }) {
  if ((overallStatus === "error" || overallStatus === "partial") && stage.status === "active") {
    return <TriangleAlert className="h-4 w-4 text-amber-500" />;
  }
  if (stage.status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  }
  if (stage.status === "active") {
    return <LoaderCircle className="h-4 w-4 animate-spin text-sky-500" />;
  }
  return <CircleDashed className="h-4 w-4 text-slate-400" />;
}

function getOverallStatusVariant(status: ConsultationTraceViewModel["overallStatus"]) {
  if (status === "error") return "destructive" as const;
  if (status === "streaming" || status === "partial") return "warning" as const;
  if (status === "done") return "success" as const;
  return "outline" as const;
}

export default function ConsultationStageTimeline({
  stages,
  progressValue,
  overallStatus,
  overallStatusLabel,
  className,
}: {
  stages: ConsultationStageView[];
  progressValue: number;
  overallStatus: ConsultationTraceViewModel["overallStatus"];
  overallStatusLabel: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-slate-100 bg-linear-to-br from-white via-slate-50 to-white shadow-sm", className)}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Trace timeline</p>
            <CardTitle className="mt-2 text-lg text-slate-900">三阶段会诊时间线</CardTitle>
          </div>
          <Badge variant={getOverallStatusVariant(overallStatus)}>{overallStatusLabel}</Badge>
        </div>
        <Progress value={progressValue} className="h-2" indicatorClassName="bg-linear-to-r from-sky-500 via-amber-500 to-emerald-500" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {stages.map((stage, index) => (
            <div
              key={stage.key}
              className={cn(
                "rounded-3xl border p-4 transition-all",
                stage.status === "active"
                  ? "border-sky-200 bg-sky-50/80 shadow-sm"
                  : stage.status === "completed"
                    ? "border-emerald-100 bg-emerald-50/70"
                    : "border-slate-100 bg-white"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant={stage.status === "completed" ? "success" : stage.status === "active" ? "warning" : "outline"}>{index + 1}</Badge>
                <StageIcon stage={stage} overallStatus={overallStatus} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">{stage.label}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{stage.summary || stage.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
