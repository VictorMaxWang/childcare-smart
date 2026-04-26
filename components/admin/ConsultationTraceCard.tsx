"use client";

import type { ReactNode } from "react";
import { BrainCircuit, Database, GitBranchPlus, Network, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminConsultationPriorityItem } from "@/lib/agent/admin-consultation";
import {
  buildConsultationEvidencePanelModel,
  getConsultationEvidenceCategoryLabel,
  getConsultationEvidenceConfidenceLabel,
  getConsultationEvidenceHumanReviewLabel,
  type ConsultationEvidenceDisplayGroup,
  type ConsultationEvidenceDisplayItem,
  type ConsultationEvidencePanelModel,
} from "@/lib/consultation/evidence-display";
import { cn } from "@/lib/utils";

const TRACE_EVIDENCE_LIMIT = 4;
const TRACE_SUMMARY_LIMIT = 160;
const TRACE_FINDINGS_LIMIT = 2;
const TRACE_EXPLAINABILITY_LIMIT = 2;

function getProviderBadgeVariant(state: AdminConsultationPriorityItem["trace"]["providerState"]) {
  if (state === "real") return "success" as const;
  if (state === "fallback") return "warning" as const;
  return "outline" as const;
}

function getMemoryBadgeVariant(state: AdminConsultationPriorityItem["trace"]["memoryState"]) {
  if (state === "ready") return "success" as const;
  if (state === "degraded") return "warning" as const;
  return "outline" as const;
}

function getEvidenceConfidenceBadgeVariant(
  confidence: ConsultationEvidenceDisplayItem["item"]["confidence"]
) {
  if (confidence === "high") return "success" as const;
  if (confidence === "medium") return "info" as const;
  return "outline" as const;
}

function getEvidenceCategoryBadgeVariant(
  category: ConsultationEvidenceDisplayItem["item"]["evidenceCategory"]
) {
  if (category === "risk_control") return "warning" as const;
  if (category === "family_communication") return "info" as const;
  if (category === "development_support") return "success" as const;
  return "secondary" as const;
}

function summarizeText(text: string, limit: number) {
  const normalized = text.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function countEvidenceGroups(groups: ConsultationEvidenceDisplayGroup[]) {
  return groups.reduce((total, group) => total + group.items.length, 0);
}

function SectionHeading({
  icon,
  title,
  toneClassName,
}: {
  icon: ReactNode;
  title: string;
  toneClassName: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", toneClassName)}>
        {icon}
      </span>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
    </div>
  );
}

function FilledList({
  items,
  emptyText,
  toneClassName = "bg-slate-50",
}: {
  items: string[];
  emptyText: string;
  toneClassName?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-2 text-sm leading-6 text-slate-600">
      {items.map((item) => (
        <p key={item} className={cn("rounded-xl px-3 py-2 whitespace-normal break-words", toneClassName)}>
          {item}
        </p>
      ))}
    </div>
  );
}

function MetaCard({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icon}
        <span>{title}</span>
      </div>
      <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function ExplainabilityList({
  items,
  emptyText,
}: {
  items: AdminConsultationPriorityItem["trace"]["explainability"];
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((itemExplainability) => (
        <div
          key={`${itemExplainability.label}-${itemExplainability.detail}`}
          className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-3"
        >
          <p className="text-sm font-semibold text-slate-900">{itemExplainability.label}</p>
          <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-600">
            {itemExplainability.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

function EvidenceCard({
  evidence,
  compact = false,
}: {
  evidence: ConsultationEvidenceDisplayItem;
  compact?: boolean;
}) {
  const excerpt =
    evidence.item.excerpt && evidence.item.excerpt !== evidence.item.summary
      ? summarizeText(evidence.item.excerpt, compact ? 80 : 120)
      : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="info">{evidence.item.sourceLabel}</Badge>
        <Badge variant={getEvidenceCategoryBadgeVariant(evidence.item.evidenceCategory)}>
          {getConsultationEvidenceCategoryLabel(evidence.item.evidenceCategory)}
        </Badge>
        <Badge variant={getEvidenceConfidenceBadgeVariant(evidence.item.confidence)}>
          {getConsultationEvidenceConfidenceLabel(evidence.item.confidence)}
        </Badge>
        <Badge variant={evidence.item.requiresHumanReview ? "warning" : "success"}>
          {getConsultationEvidenceHumanReviewLabel(evidence.item.requiresHumanReview)}
        </Badge>
      </div>

      <p className="mt-3 whitespace-normal break-words text-sm leading-6 text-slate-700">
        {evidence.item.summary}
      </p>
      {excerpt ? (
        <p className="mt-2 whitespace-normal break-words text-xs leading-5 text-slate-500">{excerpt}</p>
      ) : null}

      {evidence.supportLabels.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {evidence.supportLabels.slice(0, compact ? 1 : 2).map((label) => (
            <Badge key={`${evidence.item.id}-${label}`} variant="outline">
              {summarizeText(label, compact ? 20 : 28)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FallbackEvidenceList({
  model,
  emptyText,
}: {
  model: ConsultationEvidencePanelModel;
  emptyText: string;
}) {
  if (model.mode === "empty") {
    return <p className="text-sm leading-6 text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">兼容摘要</Badge>
        <p className="text-xs text-slate-500">当前结果暂以兼容摘要方式展示旧字段内容。</p>
      </div>
      <div className="space-y-2">
        {model.fallbackItems.map((item) => (
          <div
            key={`${item.source}-${item.detail}`}
            className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-3"
          >
            <p className="text-xs font-medium text-amber-700">{item.label}</p>
            <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-slate-700">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StructuredEvidenceSection({
  model,
  emptyText,
}: {
  model: ConsultationEvidencePanelModel;
  emptyText: string;
}) {
  if (model.mode !== "structured") {
    return <FallbackEvidenceList model={model} emptyText={emptyText} />;
  }

  const remainderCount = countEvidenceGroups(model.groupedRemainder);

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {model.leadItems.map((evidence) => (
          <EvidenceCard key={evidence.item.id} evidence={evidence} />
        ))}
      </div>

      {remainderCount > 0 ? (
        <details className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
            查看其余 {remainderCount} 条证据
          </summary>
          <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
            {model.groupedRemainder.map((group) => (
              <div key={group.category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant={getEvidenceCategoryBadgeVariant(group.category)}>{group.label}</Badge>
                  <p className="text-xs text-slate-500">{group.items.length} 条</p>
                </div>
                <div className="space-y-3">
                  {group.items.map((evidence) => (
                    <EvidenceCard key={evidence.item.id} evidence={evidence} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export default function ConsultationTraceCard({
  item,
  className,
}: {
  item: AdminConsultationPriorityItem;
  className?: string;
}) {
  const { trace } = item;
  const summaryPreview = summarizeText(trace.collaborationSummary, TRACE_SUMMARY_LIMIT);
  const visibleKeyFindings = trace.keyFindings.slice(0, TRACE_FINDINGS_LIMIT);
  const extraKeyFindings = trace.keyFindings.slice(TRACE_FINDINGS_LIMIT);
  const visibleExplainability = trace.explainability.slice(0, TRACE_EXPLAINABILITY_LIMIT);
  const extraExplainability = trace.explainability.slice(TRACE_EXPLAINABILITY_LIMIT);
  const evidenceModel = buildConsultationEvidencePanelModel({
    evidenceItems: trace.evidenceItems,
    evidenceHighlights: trace.evidenceHighlights,
    explainability: trace.explainability,
    leadLimit: TRACE_EVIDENCE_LIMIT,
  });

  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden rounded-[28px] border-slate-100 bg-white/95 shadow-sm",
        className
      )}
    >
      <CardHeader className="gap-4 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getProviderBadgeVariant(trace.providerState)}>{trace.providerStateLabel}</Badge>
          <Badge variant={getMemoryBadgeVariant(trace.memoryState)}>{trace.memoryStateLabel}</Badge>
        </div>

        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
            <BrainCircuit className="h-5 w-5 text-indigo-500" />
            会诊决策依据
          </CardTitle>
          <p className="mt-2 whitespace-normal break-words text-sm leading-6 text-slate-600">
            这里只保留可用于决策和答辩的依据摘要、证据链与协作状态，不展示调试日志。
          </p>
        </div>
      </CardHeader>

      <CardContent className="min-w-0 space-y-4 overflow-hidden">
        <div className="rounded-3xl border border-indigo-100 bg-linear-to-br from-indigo-50 via-white to-slate-50 p-5">
          <SectionHeading
            icon={<SearchCheck className="h-4 w-4 text-emerald-500" />}
            title="协作摘要"
            toneClassName="bg-emerald-100 text-emerald-700"
          />
          <p className="mt-3 whitespace-normal break-words text-sm leading-7 text-slate-700">
            {summaryPreview}
          </p>
          {summaryPreview !== trace.collaborationSummary ? (
            <details className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                查看完整协作摘要
              </summary>
              <p className="mt-3 whitespace-normal break-words text-sm leading-7 text-slate-600">
                {trace.collaborationSummary}
              </p>
            </details>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-5">
            <SectionHeading
              icon={<BrainCircuit className="h-4 w-4 text-indigo-500" />}
              title="关键发现"
              toneClassName="bg-indigo-100 text-indigo-700"
            />
            <div className="mt-3">
              <FilledList items={visibleKeyFindings} emptyText="当前没有额外关键发现。" />
            </div>
            {extraKeyFindings.length > 0 ? (
              <details className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  查看其余 {extraKeyFindings.length} 条关键发现
                </summary>
                <div className="mt-3">
                  <FilledList items={extraKeyFindings} emptyText="当前没有额外关键发现。" />
                </div>
              </details>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-5">
            <SectionHeading
              icon={<GitBranchPlus className="h-4 w-4 text-sky-500" />}
              title="判断依据"
              toneClassName="bg-sky-100 text-sky-700"
            />
            <div className="mt-3">
              <ExplainabilityList items={visibleExplainability} emptyText="当前没有额外判断依据。" />
            </div>
            {extraExplainability.length > 0 ? (
              <details className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  查看其余 {extraExplainability.length} 条判断依据
                </summary>
                <div className="mt-3">
                  <ExplainabilityList
                    items={extraExplainability}
                    emptyText="当前没有额外判断依据。"
                  />
                </div>
              </details>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-5">
            <SectionHeading
              icon={<SearchCheck className="h-4 w-4 text-amber-500" />}
              title="关键证据链"
              toneClassName="bg-amber-100 text-amber-700"
            />
            <div className="mt-3">
              <StructuredEvidenceSection model={evidenceModel} emptyText="当前没有可展示的证据摘要。" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5">
          <p className="text-sm font-semibold text-slate-900">协作状态</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-white/90 p-4">
              <p className="text-sm font-semibold text-slate-900">参与环节</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {trace.participants.length > 0 ? (
                  trace.participants.map((participant) => (
                    <Badge key={participant} variant="info">
                      {participant}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-500">当前没有参与者信息。</p>
                )}
              </div>
            </div>

            <MetaCard
              icon={<Network className="h-4 w-4 text-sky-500" />}
              title="生成方式"
              detail={trace.providerStateLabel}
            />
            <MetaCard
              icon={<Database className="h-4 w-4 text-emerald-500" />}
              title="参考范围"
              detail={trace.memoryDetail ?? trace.memoryStateLabel}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
            <p className="text-sm font-semibold text-emerald-900">同步去向</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {trace.syncTargets.length > 0 ? (
                trace.syncTargets.map((syncTarget) => (
                  <Badge key={syncTarget} variant="success">
                    {syncTarget}
                  </Badge>
                ))
              ) : (
                <p className="text-sm leading-6 text-emerald-700">当前没有同步目标。</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
