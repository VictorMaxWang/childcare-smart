"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildTeacherAgentTimeLabel, type TeacherAgentResult } from "@/lib/agent/teacher-agent";

export interface TeacherAgentHistoryListItem {
  id: string;
  actionLabel: string;
  targetLabel: string;
  result: TeacherAgentResult;
}

function getTeacherHistorySourceLabel(source: string) {
  if (source === "ai" || source === "vivo") return "智能生成";
  if (source === "mock") return "演示结果";
  return "本地兜底";
}

export default function TeacherAgentHistoryList({ items }: { items: TeacherAgentHistoryListItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">还没有历史记录，先生成一次结果。</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-3xl border border-slate-100 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <p className="text-sm font-semibold text-slate-900">动作类型：{item.actionLabel}</p>
            <Badge variant={item.result.mode === "class" ? "info" : "warning"}>
              {item.result.mode === "class" ? "班级" : "单个儿童"}
            </Badge>
            <Badge variant="secondary">对象：{item.targetLabel}</Badge>
            <Badge variant={item.result.source === "ai" ? "success" : item.result.source === "mock" ? "info" : "secondary"}>
              {getTeacherHistorySourceLabel(item.result.source)}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-500">时间：{buildTeacherAgentTimeLabel(item.result.generatedAt)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">结果摘要：{item.result.summary}</p>
        </div>
      ))}
    </div>
  );
}
