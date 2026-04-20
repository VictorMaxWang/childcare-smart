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
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function getStageLabel(stage?: string) {
  return stage && isConsultationStageKey(stage)
    ? getConsultationStageLabel(stage)
    : "闃舵鎽樿";
}

export default function ConsultationSummaryCard({
  data,
}: {
  data: ConsultationSummaryCardData;
}) {
  const memoryMeta =
    data.memoryMeta &&
    typeof data.memoryMeta === "object" &&
    !Array.isArray(data.memoryMeta)
      ? data.memoryMeta
      : {};
  const memoryBackend =
    typeof memoryMeta.backend === "string" ? memoryMeta.backend : "";
  const memorySources = toStringArray(memoryMeta.usedSources);
  const content =
    data.content ??
    data.summary ??
    "褰撳墠闃舵宸茶繑鍥炴憳瑕侊紝渚夸簬蹇€熻娓呮湰杞細璇婄殑鍏抽敭淇℃伅銆?";

  return (
    <Card
      surface="luminous"
      glow="brand"
      interactive={false}
      className="overflow-hidden border-white/14 bg-[linear-gradient(180deg,rgba(20,25,59,0.94),rgba(10,13,33,0.9))]"
    >
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{getStageLabel(data.stage)}</Badge>
          {memoryBackend ? <Badge variant="outline">{memoryBackend}</Badge> : null}
          {memorySources.length ? (
            <Badge variant="secondary">命中 {memorySources.length} 个来源</Badge>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-violet-100/60">
            Stage Summary
          </p>
          <CardTitle className="text-xl text-white">{data.title}</CardTitle>
          {data.summary ? (
            <p className="text-sm leading-7 text-white/72">{data.summary}</p>
          ) : null}
        </div>
        {data.providerTrace ? (
          <ProviderTraceBadge trace={data.providerTrace} compact />
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
          <p className="text-sm leading-7 text-white/74">{content}</p>
        </div>

        {data.items?.length ? (
          <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
            <p className="text-sm font-semibold text-white">本阶段要点</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-white/68">
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
