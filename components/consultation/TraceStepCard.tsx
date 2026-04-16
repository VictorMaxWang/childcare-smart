"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import ConsultationSummaryCard from "./ConsultationSummaryCard";
import FollowUp48hCard from "./FollowUp48hCard";
import MemoryContextCard from "./MemoryContextCard";
import ProviderTraceBadge from "./ProviderTraceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsultationEvidencePanelModel,
  getConsultationEvidenceConfidenceLabel,
  getConsultationEvidenceHumanReviewLabel,
  type ConsultationEvidenceDisplayItem,
} from "@/lib/consultation/evidence-display";
import {
  getConsultationStageStatusLabel,
  type ConsultationStageView,
  type ConsultationTraceMode,
} from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

function getSourceLabel(source?: string) {
  if (!source) return "";
  if (source === "memory") return "记忆上下文";
  return source;
}

function getCalloutClasses(tone: NonNullable<ConsultationStageView["callout"]>["tone"]) {
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function getEvidenceConfidenceBadgeVariant(
  confidence: ConsultationEvidenceDisplayItem["item"]["confidence"]
) {
  if (confidence === "high") return "success" as const;
  if (confidence === "medium") return "info" as const;
  return "outline" as const;
}

export default function TraceStepCard({
  stage,
  mode,
  className,
}: {
  stage: ConsultationStageView;
  mode: ConsultationTraceMode;
  className?: string;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? stage.expandedByDefault;

  const sourceLabel = getSourceLabel(stage.source);
  const shouldShowMemory = (stage.key === "long_term_profile" || stage.key === "recent_context") && Boolean(stage.memoryMeta);
  const evidencePreviewModel = buildConsultationEvidencePanelModel({
    evidenceItems: stage.evidenceItems,
    leadLimit: 2,
  });
  const hasStructuredContent =
    stage.items.length > 0 ||
    stage.evidenceItems.length > 0 ||
    stage.evidence.length > 0 ||
    Boolean(stage.summaryCard) ||
    Boolean(stage.followUpCard) ||
    shouldShowMemory;

  return (
    <Card
      className={cn(
        "overflow-hidden border-slate-100 shadow-sm transition-all",
        stage.status === "active"
          ? "border-sky-200 bg-linear-to-br from-sky-50/80 via-white to-white"
          : stage.status === "completed"
            ? "bg-linear-to-br from-emerald-50/70 via-white to-white"
            : "bg-white",
        className
      )}
    >
      <CardHeader className="gap-3 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={stage.status === "completed" ? "success" : stage.status === "active" ? "warning" : "outline"}>{stage.shortLabel}</Badge>
              <Badge variant="secondary">{getConsultationStageStatusLabel(stage.status)}</Badge>
              {sourceLabel ? <Badge variant="outline">{sourceLabel}</Badge> : null}
            </div>
            <div className="space-y-2">
              <CardTitle className="text-lg text-slate-900">{stage.title}</CardTitle>
              <p className="text-sm leading-7 text-slate-600">{stage.summary}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl text-slate-600"
            onClick={() => setUserOpen((current) => !(current ?? stage.expandedByDefault))}
            aria-expanded={open}
          >
            {open ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
            {open ? "收起" : "展开"}
          </Button>
        </div>

        {stage.providerTrace ? <ProviderTraceBadge trace={stage.providerTrace} compact={mode !== "debug"} /> : null}
      </CardHeader>

      {open ? (
        <CardContent className="space-y-4">
          {stage.callout ? (
            <div className={cn("rounded-2xl border p-4 text-sm leading-6", getCalloutClasses(stage.callout.tone))}>
              <p className="font-semibold">{stage.callout.title}</p>
              <p className="mt-1">{stage.callout.description}</p>
            </div>
          ) : null}

          {stage.items.length ? (
            <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
              <p className="text-sm font-semibold text-slate-900">阶段要点</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                {stage.items.map((item, index) => (
                  <li key={`${stage.key}-${index}`}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {stage.evidence.length || stage.evidenceItems.length ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-sm font-semibold text-slate-900">关键信号</p>
              {evidencePreviewModel.mode === "structured" ? (
                <div className="mt-3 space-y-3">
                  {evidencePreviewModel.leadItems.map((evidence) => (
                    <div
                      key={evidence.item.id}
                      className="rounded-2xl border border-slate-100 bg-white/90 p-3"
                    >
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="info">{evidence.item.sourceLabel}</Badge>
                        <Badge variant={getEvidenceConfidenceBadgeVariant(evidence.item.confidence)}>
                          {getConsultationEvidenceConfidenceLabel(evidence.item.confidence)}
                        </Badge>
                        <Badge variant={evidence.item.requiresHumanReview ? "warning" : "success"}>
                          {getConsultationEvidenceHumanReviewLabel(
                            evidence.item.requiresHumanReview
                          )}
                        </Badge>
                        {evidence.supportLabels[0] ? (
                          <Badge variant="outline">{evidence.supportLabels[0]}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{evidence.item.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stage.evidence.map((item, index) => (
                    <Badge key={`${stage.key}-${item.label}-${index}`} variant="outline">
                      {item.label}: {item.detail}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {shouldShowMemory ? (
            <MemoryContextCard
              memoryMeta={stage.memoryMeta as Record<string, unknown>}
              mode={mode}
              compact={mode !== "debug"}
              title={stage.key === "long_term_profile" ? "长期画像记忆上下文" : "最近会诊 / 快照记忆上下文"}
            />
          ) : null}

          {stage.summaryCard ? <ConsultationSummaryCard data={stage.summaryCard} /> : null}
          {stage.followUpCard ? <FollowUp48hCard data={stage.followUpCard} /> : null}

          {!hasStructuredContent ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-600">
              {stage.emptyState}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
