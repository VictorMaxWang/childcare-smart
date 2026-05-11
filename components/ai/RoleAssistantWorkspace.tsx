"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AlertCircle, Bot, Loader2, Mic, Send, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantProviderStatus } from "@/lib/voice-assistant/types";
import { cn } from "@/lib/utils";

type AssistantSource = "ai" | "fallback" | "mock" | string | null | undefined;

function sourceText(source: AssistantSource) {
  if (source === "ai") return "vivo Chat";
  if (source === "fallback") return "显式 fallback";
  if (source === "mock") return "mock";
  return source ? String(source) : "等待生成";
}

function sourceTone(source: AssistantSource) {
  if (source === "ai") return "success" as const;
  if (source === "fallback") return "warning" as const;
  if (source === "mock") return "neutral" as const;
  return "info" as const;
}

function statusLabel(status: AssistantProviderStatus | null, loading: boolean) {
  if (loading) return "正在读取 provider 状态";
  if (!status) return "provider unavailable";
  const capabilities = [status.chat, status.ocr, status.asr, status.tts];
  if (capabilities.every((capability) => capability.status === "ready")) return "provider ready";
  if (capabilities.some((capability) => capability.configured)) return "provider degraded";
  return "provider unavailable";
}

function statusTone(status: AssistantProviderStatus | null, loading: boolean) {
  if (loading) return "neutral" as const;
  if (!status) return "danger" as const;
  const capabilities = [status.chat, status.ocr, status.asr, status.tts];
  if (capabilities.every((capability) => capability.status === "ready")) return "success" as const;
  if (capabilities.some((capability) => capability.configured)) return "warning" as const;
  return "danger" as const;
}

export function RoleAssistantWorkspace({
  actionCards,
  className,
  description,
  emptyText = "选择快捷问题或直接输入问题后，AI 回复会显示在这里。",
  error,
  inputPlaceholder = "输入问题，继续追问当前数据...",
  loading,
  model,
  onPromptClick,
  onSubmit,
  prompts,
  response,
  roleLabel,
  source,
  title,
  value,
  onValueChange,
}: {
  actionCards?: ReactNode;
  className?: string;
  description?: ReactNode;
  emptyText?: string;
  error?: string | null;
  inputPlaceholder?: string;
  loading?: boolean;
  model?: string | null;
  onPromptClick?: (prompt: string) => void;
  onSubmit: () => void;
  prompts: string[];
  response?: ReactNode;
  roleLabel: string;
  source?: AssistantSource;
  title: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [providerStatus, setProviderStatus] = useState<AssistantProviderStatus | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState("");
  const disabled = Boolean(loading) || value.trim().length === 0;
  const status = useMemo(() => statusLabel(providerStatus, providerLoading), [providerLoading, providerStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/provider-status", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { ok: true; data: AssistantProviderStatus }
          | { ok: false; error?: string }
          | null;
        if (!response.ok || !body || body.ok !== true) {
          throw new Error(body && body.ok === false ? body.error ?? "provider status failed" : "provider status failed");
        }
        if (!cancelled) {
          setProviderStatus(body.data);
          setProviderError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProviderStatus(null);
          setProviderError(err instanceof Error ? err.message : "provider status failed");
        }
      })
      .finally(() => {
        if (!cancelled) setProviderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled) onSubmit();
  }

  function openVoiceOrb() {
    window.dispatchEvent(new CustomEvent("smartchildcare:open-voice-orb"));
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.35rem] border border-indigo-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7f8ff_58%,#eef6ff_100%)] shadow-[0_18px_54px_rgb(79_70_229_/_0.12)]",
        className
      )}
      data-testid="r04-assistant-workspace"
    >
      <div className="flex flex-col gap-4 border-b border-indigo-100/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 text-white">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </span>
            <Badge variant="info">{roleLabel}</Badge>
            <Badge variant={statusTone(providerStatus, providerLoading)} data-testid="r04-assistant-provider-status">
              {status}
            </Badge>
            <Badge variant={sourceTone(source)} data-testid="r04-assistant-source">
              {sourceText(source)}
            </Badge>
          </div>
          <h2 className="mt-3 text-lg font-bold leading-tight text-slate-950 sm:text-xl" data-testid="r04-assistant-title">
            {title}
          </h2>
          {description ? <div className="mt-1 text-sm leading-6 text-slate-600">{description}</div> : null}
          {model ? <p className="mt-1 text-xs text-slate-400">model: {model}</p> : null}
        </div>
        <Button type="button" size="icon" variant="outline" onClick={openVoiceOrb} data-testid="r04-assistant-voice" aria-label="打开语音助手">
          <Mic className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2" data-testid="r04-assistant-prompts">
            {prompts.slice(0, 8).map((prompt) => (
              <button
                type="button"
                key={prompt}
                className="rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => onPromptClick?.(prompt)}
                disabled={loading}
                data-testid="r04-prompt-chip"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div
            className="min-h-[12rem] rounded-[1.1rem] border border-white/80 bg-white/90 p-4 shadow-sm"
            data-testid="r04-assistant-conversation"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1 text-sm leading-6 text-slate-700">
                {loading ? <p data-testid="r04-assistant-loading">AI 正在整理当前数据...</p> : response ?? <p className="text-slate-500">{emptyText}</p>}
              </div>
            </div>
            {error || providerError ? (
              <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="r04-assistant-error">
                <span className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error ?? providerError}</span>
                </span>
              </div>
            ) : null}
          </div>

          <form className="rounded-[1.1rem] border border-slate-200 bg-white p-3 shadow-sm" onSubmit={handleSubmit} data-testid="r04-assistant-composer">
            <div className="flex items-start gap-3">
              <span className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 sm:flex">
                <UserRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <Textarea
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                placeholder={inputPlaceholder}
                className="min-h-16 flex-1 resize-none border-0 bg-transparent px-0 py-1 text-sm shadow-none focus-visible:ring-0"
                data-testid="r04-assistant-input"
              />
              <Button type="submit" size="icon" disabled={disabled} data-testid="r04-assistant-send" aria-label="发送问题">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </form>
        </div>

        <aside className="min-w-0 space-y-3" data-testid="r04-assistant-action-rail">
          {actionCards ?? (
            <div className="rounded-[1rem] border border-indigo-100 bg-white/86 p-4 text-sm leading-6 text-slate-600">
              快捷操作会随当前回答生成，写入类操作需在语音球内二次确认。
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
