"use client";

import {
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type {
  ConsultationStageView,
  ConsultationTraceViewModel,
} from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

function StageIcon({
  stage,
  overallStatus,
}: {
  stage: ConsultationStageView;
  overallStatus: ConsultationTraceViewModel["overallStatus"];
}) {
  if ((overallStatus === "error" || overallStatus === "partial") && stage.status === "active") {
    return <TriangleAlert className="h-4 w-4 text-violet-200" />;
  }
  if (stage.status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-violet-100" />;
  }
  if (stage.status === "active") {
    return <LoaderCircle className="h-4 w-4 animate-spin text-indigo-100" />;
  }
  return <CircleDashed className="h-4 w-4 text-white/38" />;
}

function getOverallStatusVariant(
  status: ConsultationTraceViewModel["overallStatus"]
) {
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
    <Card
      surface="glass"
      glow="brand"
      interactive={false}
      className={cn(
        "overflow-hidden border-white/14 bg-[linear-gradient(180deg,rgba(19,24,57,0.94),rgba(9,12,31,0.88))]",
        className
      )}
    >
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/42">
              Trace Timeline
            </p>
            <CardTitle className="mt-2 text-lg text-white">
              涓夐樁娈典細璇婃椂闂寸嚎
            </CardTitle>
          </div>
          <Badge variant={getOverallStatusVariant(overallStatus)}>
            {overallStatusLabel}
          </Badge>
        </div>
        <Progress
          value={progressValue}
          className="h-2 bg-white/6"
          indicatorClassName="bg-linear-to-r from-indigo-500 via-violet-500 to-fuchsia-400"
        />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {stages.map((stage, index) => (
            <div
              key={stage.key}
              className={cn(
                "rounded-[1.5rem] border p-4 transition-all",
                stage.status === "active"
                  ? "border-violet-300/24 bg-[linear-gradient(180deg,rgba(31,24,71,0.9),rgba(15,16,42,0.82))] shadow-[var(--shadow-brand)]"
                  : stage.status === "completed"
                    ? "border-indigo-300/20 bg-[linear-gradient(180deg,rgba(18,23,54,0.9),rgba(10,12,31,0.82))]"
                    : "border-white/10 bg-white/5"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge
                  variant={
                    stage.status === "completed"
                      ? "success"
                      : stage.status === "active"
                        ? "warning"
                        : "outline"
                  }
                >
                  {index + 1}
                </Badge>
                <StageIcon stage={stage} overallStatus={overallStatus} />
              </div>
              <p className="mt-3 text-sm font-semibold text-white">{stage.label}</p>
              <p className="mt-2 text-xs leading-5 text-white/56">
                {stage.summary || stage.description}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
