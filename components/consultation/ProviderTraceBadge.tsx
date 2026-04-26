"use client";

import { Badge } from "@/components/ui/badge";
import { formatAdminSourceLabel } from "@/lib/agent/admin-display-text";
import type { ConsultationProviderTrace } from "@/lib/consultation/trace-types";
import { cn } from "@/lib/utils";

export interface ProviderTraceBadgeProps {
  trace?: ConsultationProviderTrace | null;
  providerTrace?: ConsultationProviderTrace | null;
  compact?: boolean;
  showRequestId?: boolean;
  className?: string;
}

function getTraceValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function getModeLabel(trace: ConsultationProviderTrace) {
  if (trace.realProvider) return "智能生成";
  if (trace.fallback) return "本地兜底";
  return "";
}

export default function ProviderTraceBadge({
  trace,
  providerTrace,
  compact = false,
  showRequestId = false,
  className,
}: ProviderTraceBadgeProps) {
  const resolvedTrace = trace ?? providerTrace;
  if (!resolvedTrace) return null;

  const sourceRaw = getTraceValue(resolvedTrace.source);
  const providerRaw = getTraceValue(resolvedTrace.provider);
  const source = sourceRaw ? formatAdminSourceLabel(sourceRaw) : "";
  const provider = providerRaw ? formatAdminSourceLabel(providerRaw) : "";
  const model = getTraceValue(resolvedTrace.model);
  const requestId = getTraceValue(resolvedTrace.requestId);
  const transportRaw =
    getTraceValue(resolvedTrace.transport) ||
    getTraceValue(resolvedTrace.transportSource);
  const transport = transportRaw ? formatAdminSourceLabel(transportRaw) : "";
  const primaryLabel = compact ? "" : source || provider;
  const modeLabel = getModeLabel(resolvedTrace);

  if (!primaryLabel && !provider && !model && !requestId && !transport && !modeLabel) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {primaryLabel ? (
        <Badge variant={resolvedTrace.realProvider ? "success" : resolvedTrace.fallback ? "warning" : "secondary"}>
          {primaryLabel}
        </Badge>
      ) : null}
      {!compact && provider && provider !== primaryLabel ? <Badge variant="outline">{provider}</Badge> : null}
      {!compact && transport ? <Badge variant="outline">{transport}</Badge> : null}
      {!compact && model ? <Badge variant="outline">{model}</Badge> : null}
      {modeLabel ? <Badge variant={resolvedTrace.realProvider ? "success" : "warning"}>{modeLabel}</Badge> : null}
      {(showRequestId || !compact) && requestId ? <Badge variant="outline">{requestId}</Badge> : null}
    </div>
  );
}
