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
  if (source === "memory") return "璁板繂涓婁笅鏂?";
  return source;
}

function getCalloutClasses(
  tone: NonNullable<ConsultationStageView["callout"]>["tone"]
) {
  if (tone === "error") {
    return "border-rose-300/20 bg-rose-400/10 text-rose-100";
  }
  if (tone === "warning") {
    return "border-violet-300/20 bg-violet-400/10 text-violet-100";
  }
  if (tone === "success") {
    return "border-indigo-300/20 bg-indigo-400/10 text-indigo-100";
  }
  return "border-indigo-300/18 bg-indigo-400/10 text-indigo-100";
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
  const shouldShowMemory =
    (stage.key === "long_term_profile" || stage.key === "recent_context") &&
    Boolean(stage.memoryMeta);
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
      surface={stage.status === "active" ? "luminous" : "glass"}
      glow={
        stage.status === "active"
          ? "brand"
          : stage.status === "completed"
            ? "soft"
            : "none"
      }
      className={cn(
        "overflow-hidden transition-all",
        stage.status === "active"
          ? "border-white/16 bg-[linear-gradient(180deg,rgba(29,23,71,0.96),rgba(12,14,36,0.88))]"
          : stage.status === "completed"
            ? "border-indigo-300/18 bg-[linear-gradient(180deg,rgba(19,23,55,0.92),rgba(10,12,31,0.84))]"
            : "border-white/12 bg-[linear-gradient(180deg,rgba(15,18,42,0.88),rgba(9,12,28,0.82))]",
        className
      )}
    >
      <CardHeader className="gap-3 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  stage.status === "completed"
                    ? "success"
                    : stage.status === "active"
                      ? "warning"
                      : "secondary"
                }
              >
                {stage.shortLabel}
              </Badge>
              <Badge variant="outline">
                {getConsultationStageStatusLabel(stage.status)}
              </Badge>
              {sourceLabel ? <Badge variant="outline">{sourceLabel}</Badge> : null}
            </div>
            <div className="space-y-2">
              <CardTitle className="text-lg text-white">{stage.title}</CardTitle>
              <p className="text-sm leading-7 text-white/70">{stage.summary}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl text-white/68"
            onClick={() =>
              setUserOpen((current) => !(current ?? stage.expandedByDefault))
            }
            aria-expanded={open}
          >
            {open ? (
              <ChevronUp className="mr-2 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-2 h-4 w-4" />
            )}
            {open ? "鏀惰捣" : "灞曞紑"}
          </Button>
        </div>

        {stage.providerTrace ? (
          <ProviderTraceBadge trace={stage.providerTrace} compact={mode !== "debug"} />
        ) : null}
      </CardHeader>

      {open ? (
        <CardContent className="space-y-4">
          {stage.callout ? (
            <div
              className={cn(
                "rounded-[1.4rem] border p-4 text-sm leading-6 shadow-[var(--shadow-card)]",
                getCalloutClasses(stage.callout.tone)
              )}
            >
              <p className="font-semibold">{stage.callout.title}</p>
              <p className="mt-1">{stage.callout.description}</p>
            </div>
          ) : null}

          {stage.items.length ? (
            <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
              <p className="text-sm font-semibold text-white">闃舵瑕佺偣</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/68">
                {stage.items.map((item, index) => (
                  <li key={`${stage.key}-${index}`}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {stage.evidence.length || stage.evidenceItems.length ? (
            <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
              <p className="text-sm font-semibold text-white">鍏抽敭淇″彿</p>
              {evidencePreviewModel.mode === "structured" ? (
                <div className="mt-3 space-y-3">
                  {evidencePreviewModel.leadItems.map((evidence) => (
                    <div
                      key={evidence.item.id}
                      className="rounded-[1.3rem] border border-white/10 bg-white/6 p-3"
                    >
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="info">{evidence.item.sourceLabel}</Badge>
                        <Badge
                          variant={getEvidenceConfidenceBadgeVariant(
                            evidence.item.confidence
                          )}
                        >
                          {getConsultationEvidenceConfidenceLabel(
                            evidence.item.confidence
                          )}
                        </Badge>
                        <Badge
                          variant={
                            evidence.item.requiresHumanReview ? "outline" : "success"
                          }
                        >
                          {getConsultationEvidenceHumanReviewLabel(
                            evidence.item.requiresHumanReview
                          )}
                        </Badge>
                        {evidence.supportLabels[0] ? (
                          <Badge variant="outline">{evidence.supportLabels[0]}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/72">
                        {evidence.item.summary}
                      </p>
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
              title={
                stage.key === "long_term_profile"
                  ? "闀挎湡鐢诲儚璁板繂涓婁笅鏂?"
                  : "鏈€杩戜細璇?/ 蹇収璁板繂涓婁笅鏂?"
              }
            />
          ) : null}

          {stage.summaryCard ? <ConsultationSummaryCard data={stage.summaryCard} /> : null}
          {stage.followUpCard ? <FollowUp48hCard data={stage.followUpCard} /> : null}

          {!hasStructuredContent ? (
            <div className="rounded-[1.4rem] border border-dashed border-white/14 bg-white/5 p-4 text-sm leading-6 text-white/58">
              {stage.emptyState}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
