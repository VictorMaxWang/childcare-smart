"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import IntentResultPreviewCard from "@/components/intent/IntentResultPreviewCard";
import { SectionCard } from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchIntentRoute } from "@/lib/ai/intent-router-client";
import type {
  IntentRouterResult,
  IntentRouterRoleHint,
} from "@/lib/ai/types";
import { cn } from "@/lib/utils";

type UnifiedIntentEntryCardProps = {
  roleHint: IntentRouterRoleHint;
  sourcePage: string;
  title: string;
  placeholder: string;
  examples: string[];
  childId?: string;
  institutionId?: string;
  compact?: boolean;
  initiallyCollapsed?: boolean;
  collapsedSummary?: string;
  className?: string;
};

const ROLE_HELPER_TEXT: Record<IntentRouterRoleHint, string> = {
  teacher:
    "\u4e00\u53e5\u8bdd\u547d\u4e2d\u4f1a\u8bca\u3001\u89c2\u5bdf\u3001\u5468\u62a5\u6216\u5bb6\u957f\u6c9f\u901a\u5165\u53e3\u3002",
  admin:
    "\u4e00\u53e5\u8bdd\u547d\u4e2d\u673a\u6784\u4f18\u5148\u7ea7\u6216\u5468\u62a5\u5165\u53e3\u3002",
  parent:
    "\u4e00\u53e5\u8bdd\u547d\u4e2d\u4eca\u665a\u4efb\u52a1\u3001\u8d8b\u52bf\u6216\u5bb6\u957f\u52a9\u624b\u5165\u53e3\u3002",
};

export default function UnifiedIntentEntryCard({
  roleHint,
  sourcePage,
  title,
  placeholder,
  examples,
  childId,
  institutionId,
  compact = false,
  initiallyCollapsed = false,
  collapsedSummary,
  className,
}: UnifiedIntentEntryCardProps) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<IntentRouterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!initiallyCollapsed);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      requestAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (result || error || message.trim()) {
      setExpanded(true);
    }
  }, [error, message, result]);

  async function submitIntent(nextMessage: string) {
    const trimmedMessage = nextMessage.trim();
    if (!trimmedMessage) {
      setError("\u5148\u8f93\u5165\u4e00\u53e5\u9700\u6c42\u3002");
      return;
    }

    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;

    setLoading(true);
    setError(null);
    setMessage(trimmedMessage);

    try {
      const nextResult = await fetchIntentRoute(
        {
          message: trimmedMessage,
          roleHint,
          sourcePage,
          childId,
          institutionId,
        },
        { signal: controller.signal }
      );
      setResult(nextResult);
    } catch (requestError) {
      if (controller.signal.aborted) {
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "\u7edf\u4e00\u610f\u56fe\u5165\u53e3\u6682\u65f6\u4e0d\u53ef\u7528\u3002"
      );
    } finally {
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  return (
    <SectionCard
      title={title}
      description={ROLE_HELPER_TEXT[roleHint]}
      className={cn(
        "border-indigo-100 bg-linear-to-br from-indigo-50 via-white to-sky-50 shadow-sm",
        className
      )}
      actions={
        <Badge variant="info" className="gap-1 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5" />
          {"\u7edf\u4e00\u5165\u53e3"}
        </Badge>
      }
    >
      <div className="space-y-4">
        {!expanded ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <p className="text-sm leading-6 text-slate-600">
                {collapsedSummary ?? ROLE_HELPER_TEXT[roleHint]}
              </p>
              <div className="flex flex-wrap gap-2">
                {examples.slice(0, compact ? 2 : 3).map((example) => (
                  <Button
                    key={example}
                    type="button"
                    variant="outline"
                    className="rounded-full border-indigo-200 bg-white/80 text-slate-700 hover:bg-indigo-50"
                    disabled={loading}
                    onClick={() => void submitIntent(example)}
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              type="button"
              variant="premium"
              className="min-h-11 rounded-xl px-4"
              onClick={() => setExpanded(true)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              展开统一入口
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitIntent(message);
                }
              }}
              placeholder={placeholder}
              className={cn(
                "rounded-3xl border-white/80 bg-white/90 shadow-sm",
                compact ? "min-h-20" : "min-h-24"
              )}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {examples.slice(0, compact ? 3 : 4).map((example) => (
                  <Button
                    key={example}
                    type="button"
                    variant="outline"
                    className="rounded-full border-indigo-200 bg-white/80 text-slate-700 hover:bg-indigo-50"
                    disabled={loading}
                    onClick={() => void submitIntent(example)}
                  >
                    {example}
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {initiallyCollapsed ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl px-4"
                    onClick={() => setExpanded(false)}
                  >
                    收起
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="premium"
                  className="min-h-11 rounded-xl px-4"
                  disabled={loading || message.trim().length === 0}
                  onClick={() => void submitIntent(message)}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {"\u95ee\u4e00\u53e5"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {(result || loading || error) ? (
          <IntentResultPreviewCard result={result} loading={loading} error={error} />
        ) : null}
      </div>
    </SectionCard>
  );
}
