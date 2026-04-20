"use client";

import { Database, GitBranch, History, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConsultationTraceMode } from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export default function MemoryContextCard({
  memoryMeta,
  mode,
  title = "记忆上下文",
  className,
  compact = false,
}: {
  memoryMeta?: Record<string, unknown> | null;
  mode: ConsultationTraceMode;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  if (!isRecord(memoryMeta)) return null;

  const backend = typeof memoryMeta.backend === "string" ? memoryMeta.backend.trim() : "";
  const usedSources = toStringArray(memoryMeta.usedSources);
  const matchedSnapshotIds = toStringArray(memoryMeta.matchedSnapshotIds);
  const matchedTraceIds = toStringArray(memoryMeta.matchedTraceIds);
  const errors = toStringArray(memoryMeta.errors);
  const degraded = Boolean(memoryMeta.degraded) || errors.length > 0;
  const isEmpty =
    usedSources.length === 0 &&
    matchedSnapshotIds.length === 0 &&
    matchedTraceIds.length === 0;
  const showDebugDetails = mode === "debug" && !compact;

  const matchedCount =
    usedSources.length || matchedSnapshotIds.length || matchedTraceIds.length;

  const summary = degraded
    ? "记忆上下文当前处于降级状态，系统仍会返回摘要，但历史命中信息可能不完整。"
    : isEmpty
      ? "当前没有命中的历史快照或链路，本轮结果主要基于实时上下文生成。"
      : `当前命中 ${matchedCount} 组上下文线索，可用于解释本轮结论来源。`;

  return (
    <Card
      surface="glass"
      glow="soft"
      interactive={false}
      className={cn(
        "border-white/14 bg-[linear-gradient(180deg,rgba(18,22,50,0.94),rgba(10,12,30,0.88))]",
        className
      )}
    >
      <CardHeader className="gap-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Memory</Badge>
          {backend ? <Badge variant="outline">{backend}</Badge> : null}
          {degraded ? (
            <Badge variant="destructive">Degraded</Badge>
          ) : isEmpty ? (
            <Badge variant="outline">No Memory</Badge>
          ) : (
            <Badge variant="secondary">Matched</Badge>
          )}
        </div>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Database className="h-4 w-4 text-violet-100" />
          {title}
        </CardTitle>
        <p className="text-sm leading-6 text-white/68">{summary}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {usedSources.length ? (
          <div>
            <p className="text-sm font-semibold text-white">命中来源</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {usedSources.slice(0, compact ? 3 : usedSources.length).map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <History className="h-4 w-4 text-indigo-100" />
              快照命中
            </div>
            <p className="mt-2 text-sm text-white/62">{matchedSnapshotIds.length} 条</p>
          </div>

          <div className="rounded-[1.4rem] border border-white/12 bg-white/6 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <GitBranch className="h-4 w-4 text-violet-100" />
              Trace 命中
            </div>
            <p className="mt-2 text-sm text-white/62">{matchedTraceIds.length} 条</p>
          </div>
        </div>

        {!showDebugDetails && errors.length ? (
          <div className="rounded-[1.4rem] border border-fuchsia-300/18 bg-fuchsia-400/10 p-4 text-sm leading-6 text-fuchsia-100">
            记忆链路存在告警，当前页面已按降级状态展示，不影响继续查看本轮会诊结果。
          </div>
        ) : null}

        {showDebugDetails ? (
          <div className="space-y-4 rounded-[1.4rem] border border-dashed border-white/14 bg-white/5 p-4">
            {matchedSnapshotIds.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                  matchedSnapshotIds
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {matchedSnapshotIds.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {matchedTraceIds.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                  matchedTraceIds
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {matchedTraceIds.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {errors.length ? (
              <div className="rounded-[1.4rem] border border-fuchsia-300/18 bg-fuchsia-400/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-fuchsia-100">
                  <ShieldAlert className="h-4 w-4" />
                  Memory warnings
                </div>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-fuchsia-100/90">
                  {errors.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
