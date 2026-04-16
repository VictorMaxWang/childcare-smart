"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  GraduationCap,
  MessageSquareQuote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-3">
      {sections.map((sectionId) => {
        const isOpen = openSectionId === sectionId;

        if (sectionId === "recordCompletionHints" && payload.recordCompletionHints?.length) {
          return (
            <section
              key={sectionId}
              className="rounded-3xl border border-amber-100 bg-amber-50/70 p-4"
            >
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
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-slate-900">记录补全提示</p>
                  <Badge variant="warning">{payload.recordCompletionHints.length} 条</Badge>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-slate-500">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {isOpen ? (
                <div className="mt-4 space-y-3">
                  {payload.recordCompletionHints.map((hint) => (
                    <div
                      key={hint.id ?? hint.title}
                      className="rounded-2xl border border-white/80 bg-white/80 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{hint.title}</p>
                        {hint.tone === "warning" ? (
                          <Badge variant="warning">优先补齐</Badge>
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
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        }

        if (sectionId === "microTrainingSOP" && payload.microTrainingSOP) {
          return (
            <section
              key={sectionId}
              className="rounded-3xl border border-sky-100 bg-sky-50/70 p-4"
            >
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
                  <GraduationCap className="h-4 w-4 text-sky-600" />
                  <p className="text-sm font-semibold text-slate-900">
                    {payload.microTrainingSOP.title}
                  </p>
                  <Badge variant="info">
                    {payload.microTrainingSOP.durationLabel ?? "30 秒"}
                  </Badge>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-slate-500">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {payload.microTrainingSOP.summary ?? "按这 3 步把本轮老师动作落到位。"}
              </p>

              {isOpen && payload.microTrainingSOP.steps.length > 0 ? (
                <ol className="mt-4 space-y-3">
                  {payload.microTrainingSOP.steps.map((step, index) => (
                    <li
                      key={`${step.title}-${index}`}
                      className="rounded-2xl border border-white/80 bg-white/80 p-4"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {index + 1}. {step.title}
                      </p>
                      {step.detail ? (
                        <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          );
        }

        if (sectionId === "parentCommunicationScript" && payload.parentCommunicationScript) {
          return (
            <section
              key={sectionId}
              className="rounded-3xl border border-indigo-100 bg-indigo-50/70 p-4"
            >
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
                  <MessageSquareQuote className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-semibold text-slate-900">
                    {payload.parentCommunicationScript.title}
                  </p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-slate-500">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {isOpen ? (
                <div className="mt-4 space-y-3">
                  {payload.parentCommunicationScript.opening ? (
                    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        开场
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {payload.parentCommunicationScript.opening}
                      </p>
                    </div>
                  ) : null}
                  {payload.parentCommunicationScript.situation ? (
                    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        现状
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {payload.parentCommunicationScript.situation}
                      </p>
                    </div>
                  ) : null}
                  {payload.parentCommunicationScript.ask ? (
                    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        请家长配合
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {payload.parentCommunicationScript.ask}
                      </p>
                    </div>
                  ) : null}
                  {payload.parentCommunicationScript.closing ? (
                    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        收口
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {payload.parentCommunicationScript.closing}
                      </p>
                    </div>
                  ) : null}
                  {payload.parentCommunicationScript.bullets?.length ? (
                    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        话术要点
                      </p>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                        {payload.parentCommunicationScript.bullets.map((bullet) => (
                          <li key={bullet}>- {bullet}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}
