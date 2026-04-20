"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  GraduationCap,
  MessageSquareQuote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  TeacherCopilotPayload,
  TeacherCopilotSectionId,
} from "@/lib/teacher-copilot/types";

interface TeacherCopilotPanelProps {
  payload: TeacherCopilotPayload | null;
  defaultOpenSection?: TeacherCopilotSectionId | null;
  sectionOrder?: TeacherCopilotSectionId[];
}

function hasSOPContent(payload: TeacherCopilotPayload["microTrainingSOP"]) {
  if (!payload) return false;
  return Boolean(payload.summary) || payload.steps.length > 0;
}

function hasScriptContent(payload: TeacherCopilotPayload["parentCommunicationScript"]) {
  if (!payload) return false;
  return Boolean(
    payload.opening ||
      payload.situation ||
      payload.ask ||
      payload.closing ||
      payload.bullets?.length
  );
}

function ToggleIcon({ open }: { open: boolean }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(24,20,52,0.78),rgba(11,12,30,0.72))] text-white/58 shadow-[var(--shadow-card)]">
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </span>
  );
}

export default function TeacherCopilotPanel({
  payload,
  defaultOpenSection = null,
  sectionOrder = [
    "recordCompletionHints",
    "microTrainingSOP",
    "parentCommunicationScript",
  ],
}: TeacherCopilotPanelProps) {
  const sections = useMemo(() => {
    if (!payload) return [];

    return sectionOrder.filter((sectionId) => {
      if (sectionId === "recordCompletionHints") {
        return Boolean(payload.recordCompletionHints?.length);
      }
      if (sectionId === "microTrainingSOP") {
        return hasSOPContent(payload.microTrainingSOP);
      }
      return hasScriptContent(payload.parentCommunicationScript);
    });
  }, [payload, sectionOrder]);
  const [manualOpenSectionId, setManualOpenSectionId] =
    useState<TeacherCopilotSectionId | null>(defaultOpenSection);
  const openSectionId =
    manualOpenSectionId && sections.includes(manualOpenSectionId)
      ? manualOpenSectionId
      : defaultOpenSection && sections.includes(defaultOpenSection)
        ? defaultOpenSection
        : null;

  if (!payload || sections.length === 0) {
    return null;
  }

  return (
    <div className="teacher-copilot-panel space-y-3">
      {sections.map((sectionId) => {
        const isOpen = openSectionId === sectionId;

        if (sectionId === "recordCompletionHints" && payload.recordCompletionHints?.length) {
          return (
            <Card
              key={sectionId}
              surface="luminous"
              glow="soft"
              interactive={false}
              className="border-[rgba(164,168,255,0.18)] bg-[linear-gradient(160deg,rgba(25,18,54,0.95),rgba(14,12,37,0.92),rgba(15,18,43,0.88))]"
            >
              <CardContent className="p-4">
                <button
                  type="button"
                  onClick={() =>
                    setManualOpenSectionId((current) =>
                      current === sectionId ? null : sectionId
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-violet-200" />
                    <p className="text-sm font-semibold text-slate-900">记录补全提示</p>
              <Badge variant="info">{payload.recordCompletionHints.length} 条</Badge>
                  </div>
                  <ToggleIcon open={isOpen} />
                </button>

                {isOpen ? (
                  <div className="mt-4 space-y-3">
                    {payload.recordCompletionHints.map((hint) => (
                      <Card
                        key={hint.id ?? hint.title}
                        surface="glass"
                        glow="soft"
                        interactive={false}
                        className="border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(16,19,44,0.84),rgba(9,11,27,0.74))]"
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{hint.title}</p>
                            {hint.tone === "warning" ? (
            <Badge variant="info">优先补齐</Badge>
                            ) : (
                              <Badge variant="info">辅助提示</Badge>
                            )}
                            {hint.tags?.map((tag) => (
                              <Badge key={tag} variant="outline">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          {hint.detail ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600">{hint.detail}</p>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        }

        if (sectionId === "microTrainingSOP" && payload.microTrainingSOP) {
          return (
            <Card
              key={sectionId}
              surface="glass"
              glow="soft"
              interactive={false}
              className="border-[rgba(164,168,255,0.16)] bg-[linear-gradient(180deg,rgba(16,21,50,0.88),rgba(10,12,31,0.8))]"
            >
              <CardContent className="p-4">
                <button
                  type="button"
                  onClick={() =>
                    setManualOpenSectionId((current) =>
                      current === sectionId ? null : sectionId
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-indigo-200" />
                    <p className="text-sm font-semibold text-slate-900">
                      {payload.microTrainingSOP.title}
                    </p>
                    <Badge variant="info">
                      {payload.microTrainingSOP.durationLabel ?? "30 秒"}
                    </Badge>
                  </div>
                  <ToggleIcon open={isOpen} />
                </button>

                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {payload.microTrainingSOP.summary ?? "按这 3 步把本轮老师动作落到位。"}
                </p>

                {isOpen && payload.microTrainingSOP.steps.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {payload.microTrainingSOP.steps.map((step, index) => (
                      <Card
                        key={`${step.title}-${index}`}
                        surface="glass"
                        glow="soft"
                        interactive={false}
                        className="border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))]"
                      >
                        <CardContent className="p-4">
                          <p className="text-sm font-semibold text-slate-900">
                            {index + 1}. {step.title}
                          </p>
                          {step.detail ? (
                            <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        }

        if (sectionId === "parentCommunicationScript" && payload.parentCommunicationScript) {
          return (
            <Card
              key={sectionId}
              surface="luminous"
              glow="brand"
              interactive={false}
              className="border-[rgba(164,168,255,0.18)] bg-[linear-gradient(160deg,rgba(26,20,59,0.96),rgba(15,13,39,0.92),rgba(15,19,46,0.88))]"
            >
              <CardContent className="p-4">
                <button
                  type="button"
                  onClick={() =>
                    setManualOpenSectionId((current) =>
                      current === sectionId ? null : sectionId
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquareQuote className="h-4 w-4 text-violet-200" />
                    <p className="text-sm font-semibold text-slate-900">
                      {payload.parentCommunicationScript.title}
                    </p>
                  </div>
                  <ToggleIcon open={isOpen} />
                </button>

                {isOpen ? (
                  <div className="mt-4 space-y-3">
                    {payload.parentCommunicationScript.opening ? (
                      <Card
                        surface="glass"
                        glow="soft"
                        interactive={false}
                        className="border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))]"
                      >
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                            开场
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {payload.parentCommunicationScript.opening}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                    {payload.parentCommunicationScript.situation ? (
                      <Card
                        surface="glass"
                        glow="soft"
                        interactive={false}
                        className="border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))]"
                      >
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                            现状
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {payload.parentCommunicationScript.situation}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                    {payload.parentCommunicationScript.ask ? (
                      <Card
                        surface="glass"
                        glow="soft"
                        interactive={false}
                        className="border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))]"
                      >
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                            请家长配合
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {payload.parentCommunicationScript.ask}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                    {payload.parentCommunicationScript.closing ? (
                      <Card
                        surface="glass"
                        glow="soft"
                        interactive={false}
                        className="border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))]"
                      >
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                            收口
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {payload.parentCommunicationScript.closing}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                    {payload.parentCommunicationScript.bullets?.length ? (
                      <Card
                        surface="glass"
                        glow="soft"
                        interactive={false}
                        className="border-[rgba(164,168,255,0.14)] bg-[linear-gradient(180deg,rgba(15,18,44,0.84),rgba(9,11,28,0.74))]"
                      >
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                            话术要点
                          </p>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                            {payload.parentCommunicationScript.bullets.map((bullet) => (
                              <li key={bullet}>- {bullet}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        }

        return null;
      })}
    </div>
  );
}
