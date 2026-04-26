"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, TriangleAlert, Workflow } from "lucide-react";
import ParentSpeakButton from "@/components/parent/ParentSpeakButton";
import type { ParentTransparencyViewModel } from "@/lib/agent/parent-transparency";
import { SectionCard } from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildParentSpeechScript } from "@/lib/voice/browser-tts";

export interface ParentTransparencyPanelProps {
  model: ParentTransparencyViewModel;
  title?: string;
  description?: string;
  institutionStatusNote?: string;
  careMode?: boolean;
}

function ParentTransparencyPanelContent({
  model,
  title = "这条建议怎么来的",
  description = "把当前建议的依据、完整度和后续跟进说明清楚。",
  institutionStatusNote,
  careMode = false,
}: ParentTransparencyPanelProps) {
  const [expanded, setExpanded] = useState(careMode ? false : model.defaultExpanded);
  const showDetailBlocks = !careMode || expanded;
  const speechText = buildParentSpeechScript({
    title,
    sections: [
      { label: "摘要", text: model.summarySentence },
      { label: "依据", text: model.reliabilityText },
      { label: "跟进", text: model.closureStatus },
      { label: "提醒", text: model.warnings[0] },
    ],
    outro: "仅在当前浏览器朗读，方便家人快速听懂重点。",
  });

  return (
    <SectionCard
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={model.warnings.length > 0 ? "warning" : "info"} className="px-3 py-1">
            {model.warnings.length > 0 ? "需要留意" : careMode ? "简洁查看" : "说明面板"}
          </Badge>
          <ParentSpeakButton
            text={speechText}
            label={"\u8bfb\u7ed9\u6211\u542c"}
            careMode={careMode}
            className={careMode ? "min-w-[220px]" : ""}
          />
        </div>
      }
    >
      <div data-testid="parent-transparency-panel" className="space-y-4">
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium tracking-[0.14em] text-slate-400">摘要</p>
          <p className={careMode ? "mt-3 text-base leading-8 text-slate-800" : "mt-2 text-sm leading-7 text-slate-700"}>
            {model.summarySentence}
          </p>
        </div>

        {showDetailBlocks ? (
          <>
            <div className="flex flex-wrap gap-2">
              {model.sourceBadges.map((badge) => (
                <Badge key={badge.id} variant={badge.variant}>
                  {badge.label}
                </Badge>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <InfoBlock
                title="依据完整度"
                body={model.reliabilityText}
                detail={model.coverageText}
                icon={<ShieldCheck className="h-4 w-4" />}
                careMode={careMode}
              />
              <InfoBlock
                title="后续跟进"
                body={model.closureStatus}
                detail={institutionStatusNote}
                icon={<Workflow className="h-4 w-4" />}
                careMode={careMode}
              />
            </div>
          </>
        ) : null}

        {model.warnings.length > 0 ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">需要留意</p>
                <ul className={careMode ? "mt-3 space-y-3 text-base leading-7 text-amber-900/90" : "mt-2 space-y-2 text-sm leading-6 text-amber-900/90"}>
                  {model.warnings.map((warning) => (
                    <li key={warning}>- {warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-100 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {careMode ? "要不要多看一点？" : "展开更多说明"}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {careMode
                  ? "关怀模式默认先只看一层摘要，需要时再展开。"
                  : "展开后可以看到依据摘要和需要留意的边界说明。"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "收起说明" : "展开说明"}
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>

          {expanded ? (
            <div className="mt-4 space-y-4">
              {careMode ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <InfoBlock
                    title="依据完整度"
                    body={model.reliabilityText}
                    detail={model.coverageText}
                    icon={<ShieldCheck className="h-4 w-4" />}
                    careMode={careMode}
                  />
                  <InfoBlock
                    title="后续跟进"
                    body={model.closureStatus}
                    detail={institutionStatusNote}
                    icon={<Workflow className="h-4 w-4" />}
                    careMode={careMode}
                  />
                </div>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">这次主要参考了什么</p>
                  <ul className={careMode ? "mt-3 space-y-3 text-base leading-7 text-slate-600" : "mt-3 space-y-2 text-sm leading-6 text-slate-600"}>
                    {model.evidenceBullets.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">需要一起记住的边界</p>
                  <ul className={careMode ? "mt-3 space-y-3 text-base leading-7 text-slate-600" : "mt-3 space-y-2 text-sm leading-6 text-slate-600"}>
                    {model.boundaryNotes.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function InfoBlock({
  title,
  body,
  detail,
  icon,
  careMode = false,
}: {
  title: string;
  body: string;
  detail?: string;
  icon: ReactNode;
  careMode?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="text-slate-500">{icon}</span>
        {title}
      </div>
      <p className={careMode ? "mt-3 text-base leading-8 text-slate-700" : "mt-3 text-sm leading-7 text-slate-700"}>
        {body}
      </p>
      {detail ? <p className={careMode ? "mt-2 text-sm leading-7 text-slate-500" : "mt-2 text-sm leading-6 text-slate-500"}>{detail}</p> : null}
    </div>
  );
}

export default function ParentTransparencyPanel({
  model,
  title = "这条建议怎么来的",
  description = "把当前建议的依据、完整度和后续跟进说明清楚。",
  institutionStatusNote,
  careMode = false,
}: ParentTransparencyPanelProps) {
  const resetKey = [
    model.summarySentence,
    model.defaultExpanded ? "open" : "closed",
    model.warnings.join("|"),
    careMode ? "care" : "normal",
  ].join("::");

  return (
    <ParentTransparencyPanelContent
      key={resetKey}
      model={model}
      title={title}
      description={description}
      institutionStatusNote={institutionStatusNote}
      careMode={careMode}
    />
  );
}
