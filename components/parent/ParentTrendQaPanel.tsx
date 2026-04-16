"use client";

import Link from "next/link";
import { Bug, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ParentTrendDebugCase } from "@/lib/agent/parent-trend";

const TREND_QA_CASES: Array<{
  id: ParentTrendDebugCase;
  label: string;
  expected: string;
}> = [
  {
    id: "loading",
    label: "Loading",
    expected: "显示趋势卡加载中骨架屏。",
  },
  {
    id: "success",
    label: "Success",
    expected: "显示 request_snapshot 正常趋势、图表、dataQuality 与 warnings。",
  },
  {
    id: "fallback",
    label: "Fallback",
    expected: "显示 demo_snapshot / fallbackUsed=true，且明确不是高质量趋势。",
  },
  {
    id: "insufficient",
    label: "Insufficient",
    expected: "请求成功，但有效点位不足，图表进入 insufficient-data 状态。",
  },
  {
    id: "empty",
    label: "Empty",
    expected: "结果结构完整，但图表区显示 empty state。",
  },
  {
    id: "error",
    label: "Error",
    expected: "显示查询失败态和重试入口。",
  },
];

export interface ParentTrendQaPanelProps {
  childId: string;
  activeCase: ParentTrendDebugCase | null;
}

export default function ParentTrendQaPanel({
  childId,
  activeCase,
}: ParentTrendQaPanelProps) {
  const encodedChildId = encodeURIComponent(childId);
  const liveHref = `/parent/agent?child=${encodedChildId}`;
  const debugBaseHref = `/parent/agent?child=${encodedChildId}&trace=debug`;

  return (
    <div
      className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4"
      data-testid="parent-trend-qa-panel"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-amber-700" />
            <p className="text-sm font-semibold text-slate-900">Parent Trend QA / Smoke</p>
            <Badge variant="warning">trace=debug</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            用同一页面直接切换 6 个趋势状态做录屏或手工验证。画面里至少要保留问题、trendLabel、source、fallback 标记、dataQuality、warnings 和图表状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={liveHref}>
              回到真实路径
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={debugBaseHref}>
              清空 QA case
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TREND_QA_CASES.map((item) => {
          const href = `${debugBaseHref}&trendCase=${item.id}`;
          const active = item.id === activeCase;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-3 ${
                active
                  ? "border-amber-300 bg-white shadow-sm"
                  : "border-amber-100 bg-white/80"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.expected}</p>
                </div>
                {active ? <Badge variant="warning">Active</Badge> : null}
              </div>
              <Button asChild variant={active ? "premium" : "outline"} className="mt-3 w-full rounded-xl">
                <Link href={href}>打开 {item.label}</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
