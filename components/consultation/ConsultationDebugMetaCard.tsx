"use client";

import { useMemo, useState } from "react";
import { Bug, ChevronDown, ChevronUp, FileJson } from "lucide-react";
import MemoryContextCard from "./MemoryContextCard";
import ProviderTraceBadge from "./ProviderTraceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CONSULTATION_STAGE_ORDER,
  getConsultationStageLabel,
  type ConsultationProviderTrace,
  type ConsultationTraceViewModel,
} from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "n/a";
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join(" / ") : "n/a";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

export default function ConsultationDebugMetaCard({
  traceId,
  providerTrace,
  memoryMeta,
  traceMemoryMeta,
  rawStageInfo,
  defaultOpen = false,
  className,
}: {
  traceId?: string | null;
  providerTrace?: ConsultationProviderTrace | null;
  memoryMeta?: Record<string, unknown> | null;
  traceMemoryMeta?: Record<string, unknown> | null;
  rawStageInfo?: ConsultationTraceViewModel["rawStageInfo"];
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const stageRows = useMemo(
    () =>
      CONSULTATION_STAGE_ORDER.flatMap((stage) => {
        const status = rawStageInfo?.statuses[stage];
        const notes =
          rawStageInfo?.notes.filter((item) => item.stage === stage) ?? [];
        const ui = rawStageInfo?.ui[stage];
        const uiCards = [
          ui?.summaryCard ? "summaryCard" : null,
          ui?.followUpCard ? "followUpCard" : null,
        ].filter(Boolean) as string[];

        if (!status && notes.length === 0 && !uiCards.length) {
          return [];
        }

        return [{ stage, status, notes, uiCards }];
      }),
    [rawStageInfo]
  );

  if (!traceId && !providerTrace && !memoryMeta && !traceMemoryMeta && stageRows.length === 0) {
    return null;
  }

  return (
    <Card
      surface="glass"
      glow="soft"
      interactive={false}
      className={cn(
        "border-dashed border-white/14 bg-[linear-gradient(180deg,rgba(17,20,44,0.92),rgba(10,11,28,0.84))]",
        className
      )}
    >
      <CardHeader className="gap-3 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Debug</Badge>
            {traceId ? <Badge variant="outline">{traceId}</Badge> : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? (
              <ChevronUp className="mr-2 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-2 h-4 w-4" />
            )}
            {open ? "鏀惰捣璇︽儏" : "灞曞紑璇︽儏"}
          </Button>
        </div>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Bug className="h-4 w-4 text-violet-100" />
          Provider / memory / raw stage info
        </CardTitle>
      </CardHeader>

      {open ? (
        <CardContent className="space-y-4 text-sm text-white/68">
          {providerTrace ? (
            <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                providerTrace
              </p>
              <div className="mt-3 space-y-3">
                <ProviderTraceBadge trace={providerTrace} showRequestId />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>source: {renderValue(providerTrace.source)}</div>
                  <div>provider: {renderValue(providerTrace.provider)}</div>
                  <div>model: {renderValue(providerTrace.model)}</div>
                  <div>requestId: {renderValue(providerTrace.requestId)}</div>
                  <div>realProvider: {renderValue(providerTrace.realProvider)}</div>
                  <div>fallback: {renderValue(providerTrace.fallback)}</div>
                </div>
              </div>
            </div>
          ) : null}

          {memoryMeta ? (
            <MemoryContextCard
              memoryMeta={memoryMeta}
              mode="debug"
              title="memoryMeta"
              compact={false}
            />
          ) : null}

          {traceMemoryMeta ? (
            <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                <FileJson className="h-3.5 w-3.5" />
                traceMeta.memory
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>backend: {renderValue(traceMemoryMeta.backend)}</div>
                <div>usedSources: {renderValue(traceMemoryMeta.usedSources)}</div>
                <div>
                  matchedSnapshotIds: {renderValue(traceMemoryMeta.matchedSnapshotIds)}
                </div>
                <div>matchedTraceIds: {renderValue(traceMemoryMeta.matchedTraceIds)}</div>
                <div>
                  memory_context_used: {renderValue(traceMemoryMeta.memory_context_used)}
                </div>
                <div>
                  memory_context_backend:{" "}
                  {renderValue(traceMemoryMeta.memory_context_backend)}
                </div>
              </div>
            </div>
          ) : null}

          {stageRows.length ? (
            <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                raw stage info
              </p>
              <div className="mt-3 space-y-3">
                {stageRows.map((row) => (
                  <div
                    key={row.stage}
                    className="rounded-[1.3rem] border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {getConsultationStageLabel(row.stage)}
                      </Badge>
                      {row.status?.traceId ? (
                        <Badge variant="outline">{row.status.traceId}</Badge>
                      ) : null}
                      {row.uiCards.map((cardType) => (
                        <Badge key={cardType} variant="outline">
                          {cardType}
                        </Badge>
                      ))}
                      {row.notes.length ? (
                        <Badge variant="outline">{row.notes.length} 鏉?text</Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div>title: {renderValue(row.status?.title)}</div>
                      <div>message: {renderValue(row.status?.message)}</div>
                      <div>providerTrace: {renderValue(row.status?.providerTrace)}</div>
                      <div>memory: {renderValue(row.status?.memory)}</div>
                    </div>
                    {row.notes.length ? (
                      <div className="mt-3 space-y-2 text-sm leading-6 text-white/68">
                        {row.notes.slice(0, 2).map((note, index) => (
                          <div
                            key={`${row.stage}-${index}`}
                            className="rounded-xl border border-white/10 bg-white/6 px-3 py-2"
                          >
                            {note.text}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
