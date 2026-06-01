"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  FileScan,
  Image as ImageIcon,
  Mic,
  RefreshCw,
  ShieldCheck,
  Volume2,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getVoiceAssistantProviderStatus } from "@/lib/api/voice-assistant";
import type {
  AssistantProviderStatus,
  VoiceProviderCapabilityStatus,
} from "@/lib/voice-assistant/types";

type CapabilityKey =
  | "llm"
  | "ocr"
  | "asr"
  | "tts"
  | "storybookImage"
  | "storybookAudio";

const CAPABILITIES: Array<{
  key: CapabilityKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "llm", label: "LLM", icon: BrainCircuit },
  { key: "ocr", label: "OCR", icon: FileScan },
  { key: "asr", label: "ASR", icon: Mic },
  { key: "tts", label: "TTS", icon: Volume2 },
  { key: "storybookImage", label: "storybook image", icon: ImageIcon },
  { key: "storybookAudio", label: "storybook audio", icon: Waves },
];

function getCapabilityStatus(
  status: AssistantProviderStatus | null,
  key: CapabilityKey
): VoiceProviderCapabilityStatus | null {
  if (!status) return null;
  return status.capabilities?.[key] ?? status[key] ?? (key === "llm" ? status.chat : null);
}

function getBadgeVariant(
  capability: VoiceProviderCapabilityStatus | null
): BadgeProps["variant"] {
  if (!capability) return "neutral";
  if (capability.live || capability.state === "live") return "success";
  if (capability.configured || capability.state === "configured") return "info";
  if (capability.mock || capability.state === "mock") return "neutral";
  if (capability.fallback || capability.state === "fallback") return "warning";
  return "danger";
}

function formatFlag(value: boolean | undefined) {
  return value ? "yes" : "no";
}

function CapabilityCard({
  capability,
  label,
  icon: Icon,
  testId,
}: {
  capability: VoiceProviderCapabilityStatus | null;
  label: string;
  icon: LucideIcon;
  testId: string;
}) {
  const missingEnv =
    capability?.status === "missing-env" ? (capability.requiredEnv ?? []).join(", ") : "";
  const warnings = capability?.warnings ?? [];

  return (
    <Card data-testid={testId} className="min-h-[244px] border-slate-200 bg-white shadow-sm">
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{label}</CardTitle>
              <p className="truncate text-xs text-slate-500">
                {capability?.providerName ?? "provider-unavailable"}
              </p>
            </div>
          </div>
          <Badge variant={getBadgeVariant(capability)}>
            {capability?.mode ?? capability?.state ?? "unknown"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">configured</p>
            <p className="font-semibold text-slate-900">{formatFlag(capability?.configured)}</p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">live</p>
            <p className="font-semibold text-slate-900">{formatFlag(capability?.live)}</p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">fallback</p>
            <p className="font-semibold text-slate-900">{formatFlag(capability?.fallback)}</p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">mock</p>
            <p className="font-semibold text-slate-900">{formatFlag(capability?.mock)}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-normal text-slate-500">status</p>
          <p className="text-slate-800">{capability?.status ?? "unknown"}</p>
          {missingEnv ? <p className="break-words text-xs text-amber-700">{missingEnv}</p> : null}
          {warnings.length ? (
            <p className="line-clamp-2 text-xs text-slate-500">{warnings.join(" / ")}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAiProviderStatusPage() {
  const [status, setStatus] = useState<AssistantProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getVoiceAssistantProviderStatus());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "provider-status request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const visibleCapabilities = useMemo(
    () =>
      CAPABILITIES.map((item) => ({
        ...item,
        capability: getCapabilityStatus(status, item.key),
      })),
    [status]
  );

  const readyCount = visibleCapabilities.filter(
    (item) => item.capability?.configured || item.capability?.live
  ).length;
  const fallbackCount = visibleCapabilities.filter((item) => item.capability?.fallback).length;

  return (
    <main
      data-testid="admin-ai-provider-status-page"
      className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                secret values redacted
              </Badge>
              <Badge variant={fallbackCount ? "warning" : "success"}>
                {readyCount}/6 configured or live
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                AI Provider Status
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                LLM, OCR, ASR, TTS, storybook image and storybook audio use the same provider trace contract.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadStatus()}
            loading={loading}
            className="w-full gap-2 sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </header>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleCapabilities.map((item) => (
            <CapabilityCard
              key={item.key}
              label={item.label}
              icon={item.icon}
              capability={item.capability}
              testId={`admin-ai-provider-status-card-${item.key}`}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
