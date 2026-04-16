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
  const isEmpty = usedSources.length === 0 && matchedSnapshotIds.length === 0 && matchedTraceIds.length === 0;
  const showDebugDetails = mode === "debug" && !compact;

  const summary = degraded
    ? "记忆上下文已降级，本轮会诊会继续生成，但历史命中信息可能不完整。"
    : isEmpty
      ? "暂无历史记忆命中，系统会按当前输入和实时上下文继续给出建议。"
      : `已命中 ${usedSources.length || matchedSnapshotIds.length || matchedTraceIds.length} 组历史线索，可用于解释本轮建议来源。`;

  return (
    <Card className={cn("border-slate-100 bg-white/95 shadow-sm", className)}>
      <CardHeader className="gap-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">memory</Badge>
          {backend ? <Badge variant={degraded ? "warning" : "secondary"}>{backend}</Badge> : null}
          {degraded ? <Badge variant="warning">降级</Badge> : isEmpty ? <Badge variant="outline">空记忆</Badge> : <Badge variant="success">已命中</Badge>}
        </div>
        <CardTitle className="flex items-center gap-2 text-base text-slate-900">
          <Database className="h-4 w-4 text-sky-500" />
          {title}
        </CardTitle>
        <p className="text-sm leading-6 text-slate-600">{summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {usedSources.length ? (
          <div>
            <p className="text-sm font-semibold text-slate-900">命中来源</p>
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
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <History className="h-4 w-4 text-indigo-500" />
              快照命中
            </div>
            <p className="mt-2 text-sm text-slate-600">{matchedSnapshotIds.length} 条</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <GitBranch className="h-4 w-4 text-emerald-500" />
              Trace 命中
            </div>
            <p className="mt-2 text-sm text-slate-600">{matchedTraceIds.length} 条</p>
          </div>
        </div>

        {!showDebugDetails && errors.length ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            记忆链路存在告警，当前页面已按降级状态展示，不影响继续查看本轮会诊结果。
          </div>
        ) : null}

        {showDebugDetails ? (
          <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
            {matchedSnapshotIds.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">matchedSnapshotIds</p>
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
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">matchedTraceIds</p>
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
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <ShieldAlert className="h-4 w-4" />
                  Memory warnings
                </div>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-amber-800">
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
