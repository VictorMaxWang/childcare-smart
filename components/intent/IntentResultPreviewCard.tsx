"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Compass, Loader2, Route, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  toIntentResultPreviewModel,
  type IntentResultPreviewModel,
} from "@/lib/ai/intent-router-client";
import type { IntentRouterResult } from "@/lib/ai/types";

type IntentResultPreviewCardProps = {
  result: IntentRouterResult | null;
  loading?: boolean;
  error?: string | null;
  onNavigate?: (href: string, result: IntentRouterResult) => void;
};

function MetaPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/80 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 break-all text-sm text-slate-700">{value}</p>
    </div>
  );
}

function ResultBody({
  model,
  result,
  onNavigate,
}: {
  model: IntentResultPreviewModel;
  result: IntentRouterResult;
  onNavigate?: (href: string, result: IntentRouterResult) => void;
}) {
  const cta = model.canNavigate ? (
    <Button asChild variant="premium" className="min-h-11 rounded-xl px-4">
      <Link href={model.href} onClick={() => onNavigate?.(model.href, result)}>
        {model.ctaLabel}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  ) : (
    <Button type="button" variant="outline" className="min-h-11 rounded-xl px-4" disabled>
      {model.ctaLabel}
    </Button>
  );

  return (
    <div className="rounded-[26px] border border-indigo-100 bg-linear-to-br from-white via-indigo-50/60 to-sky-50/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {model.badges.length > 0 ? (
          model.badges.slice(0, 4).map((badge) => (
            <Badge key={badge} variant="secondary">
              {badge}
            </Badge>
          ))
        ) : (
          <Badge variant="outline">推荐入口</Badge>
        )}
      </div>

      <p className="mt-4 text-lg font-semibold text-slate-900">{model.title}</p>
      <p className="mt-3 text-sm leading-7 text-slate-600">{model.summary}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MetaPill icon={<Workflow className="h-3.5 w-3.5" />} label="推荐方式" value={model.workflowLabel} />
        <MetaPill icon={<Compass className="h-3.5 w-3.5" />} label="目标页面" value={model.pageLabel} />
        <MetaPill icon={<Route className="h-3.5 w-3.5" />} label="跳转入口" value={model.deeplinkLabel} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-slate-500">这是一次入口推荐，不保留长对话历史。</p>
        {cta}
      </div>
    </div>
  );
}

export default function IntentResultPreviewCard({
  result,
  loading = false,
  error = null,
  onNavigate,
}: IntentResultPreviewCardProps) {
  if (loading) {
    return (
      <div className="rounded-[26px] border border-indigo-100 bg-white/85 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          正在为你匹配最合适的入口…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[26px] border border-rose-100 bg-rose-50/80 p-5 shadow-sm">
        <p className="text-sm font-semibold text-rose-700">
          {
            "\u7edf\u4e00\u610f\u56fe\u5165\u53e3\u6682\u65f6\u672a\u8fd4\u56de\u7ed3\u679c\u3002"
          }
        </p>
        <p className="mt-2 text-sm leading-6 text-rose-600">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-[26px] border border-dashed border-slate-200 bg-white/70 p-5">
        <p className="text-sm font-semibold text-slate-900">
          {
            "\u95ee\u4e00\u53e5\uff0c\u7cfb\u7edf\u4f1a\u7ed9\u51fa\u4e00\u4e2a\u6700\u5339\u914d\u7684\u5165\u53e3\u3002"
          }
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          返回结果会包含推荐卡片、目标页面和可直接进入的入口。
        </p>
      </div>
    );
  }

  return <ResultBody model={toIntentResultPreviewModel(result)} result={result} onNavigate={onNavigate} />;
}
