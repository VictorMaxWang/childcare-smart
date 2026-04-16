"use client";

import ProviderTraceBadge from "./ProviderTraceBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getConsultationStageLabel,
  isConsultationStageKey,
  type ConsultationSummaryCardData,
} from "@/lib/consultation/trace-types";

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function getStageLabel(stage?: string) {
  return stage && isConsultationStageKey(stage) ? getConsultationStageLabel(stage) : "阶段摘要";
}

export default function ConsultationSummaryCard({ data }: { data: ConsultationSummaryCardData }) {
  const memoryMeta =
    data.memoryMeta && typeof data.memoryMeta === "object" && !Array.isArray(data.memoryMeta)
      ? data.memoryMeta
      : {};
  const memoryBackend = typeof memoryMeta.backend === "string" ? memoryMeta.backend : "";
  const memorySources = toStringArray(memoryMeta.usedSources);
  const content = data.content ?? data.summary ?? "当前阶段已返回摘要，便于快速讲清本轮会诊的关键信息。";

  return (
    <Card className="border-sky-100 bg-linear-to-br from-sky-50/80 via-white to-indigo-50/60 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{getStageLabel(data.stage)}</Badge>
          {memoryBackend ? <Badge variant="secondary">{memoryBackend}</Badge> : null}
          {memorySources.length ? <Badge variant="outline">命中 {memorySources.length} 个来源</Badge> : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-sky-500">Stage summary</p>
          <CardTitle className="text-xl text-slate-900">{data.title}</CardTitle>
          {data.summary ? <p className="text-sm leading-7 text-slate-600">{data.summary}</p> : null}
        </div>
        {data.providerTrace ? <ProviderTraceBadge trace={data.providerTrace} compact /> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
          <p className="text-sm leading-7 text-slate-700">{content}</p>
        </div>

        {data.items?.length ? (
          <div className="rounded-2xl border border-white/70 bg-white/85 p-4">
            <p className="text-sm font-semibold text-slate-900">本阶段要点</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {data.items.map((item, index) => (
                <li key={`${data.title}-${index}`}>- {item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {memorySources.length ? (
          <div className="flex flex-wrap gap-2">
            {memorySources.slice(0, 3).map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
