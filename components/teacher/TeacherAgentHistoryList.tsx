"use client";

import { Clock3, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    return (
      <Card
        surface="glass"
        glow="soft"
        interactive={false}
        className="border-dashed border-[rgba(164,168,255,0.16)] bg-[linear-gradient(180deg,rgba(13,17,39,0.84),rgba(9,12,27,0.76))]"
      >
        <CardContent className="p-4 text-sm text-slate-500">
          还没有历史记录，先生成一次结果。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <Card
          key={item.id}
          surface="glass"
          glow="soft"
          interactive={false}
          className="relative overflow-hidden border-[rgba(164,168,255,0.16)] bg-[linear-gradient(180deg,rgba(16,19,44,0.88),rgba(9,11,28,0.78))]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-4 left-7 top-4 w-px bg-[linear-gradient(180deg,rgba(132,122,255,0.58),rgba(132,122,255,0.12))]"
          />
          <CardContent className="relative p-4 pl-12">
            <span className="absolute left-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(164,168,255,0.22)] bg-[linear-gradient(180deg,rgba(38,28,78,0.96),rgba(18,18,50,0.92))] shadow-[0_14px_32px_rgba(84,72,196,0.22)]">
              <Sparkles className="h-3.5 w-3.5 text-violet-200" />
            </span>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.result.mode === "class" ? "info" : "warning"}>
                    {item.result.mode === "class" ? "班级模式" : "单儿童模式"}
                  </Badge>
                  <Badge variant="secondary">{item.actionLabel}</Badge>
                  <Badge variant="outline">对象：{item.targetLabel}</Badge>
                  {item.result.consultationMode ? <Badge variant="info">会诊协同</Badge> : null}
                  <Badge
                    variant={
                      item.result.source === "ai"
                        ? "success"
                        : item.result.source === "mock"
                          ? "info"
                          : "secondary"
                    }
                  >
                    {getTeacherHistorySourceLabel(item.result.source)}
                  </Badge>
                </div>
                <p className="text-sm font-semibold text-slate-900">{item.result.title}</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(164,168,255,0.16)] bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs text-slate-500">
                <Clock3 className="h-3.5 w-3.5 text-indigo-200" />
                {buildTeacherAgentTimeLabel(item.result.generatedAt)}
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.result.summary}</p>
            {index < items.length - 1 ? (
              <div className="mt-4 border-t border-[rgba(164,168,255,0.12)] pt-3 text-xs uppercase tracking-[0.18em] text-white/36">
                当前会话历史
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
