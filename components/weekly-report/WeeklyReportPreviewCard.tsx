import Link from "next/link";
import { AlertCircle, Clock3, RefreshCw } from "lucide-react";
import ParentSpeakButton from "@/components/parent/ParentSpeakButton";
import { SectionCard } from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getWeeklyReportRoleMeta,
  getWeeklyReportSourceMeta,
} from "@/lib/agent/weekly-report-client";
import type { WeeklyReportResponse, WeeklyReportRole } from "@/lib/ai/types";
import { buildParentSpeechScript } from "@/lib/voice/browser-tts";
import { cn } from "@/lib/utils";

type WeeklyReportPreviewCardProps = {
  title: string;
  description: string;
  role: WeeklyReportRole;
  periodLabel: string;
  report: WeeklyReportResponse | null;
  loading?: boolean;
  error?: string | null;
  ctaHref: string;
  ctaLabel: string;
  ctaVariant?: "outline" | "premium" | "secondary";
  className?: string;
  careMode?: boolean;
  showRuntimeMeta?: boolean;
};

function pickCareSection(report: WeeklyReportResponse | null) {
  if (!report) return null;

  return (
    report.sections.find((section) => section.id === "topHomeAction") ??
    report.sections.find((section) => section.id === "feedbackNeeded") ??
    report.sections[0] ??
    null
  );
}

export default function WeeklyReportPreviewCard({
  title,
  description,
  role,
  periodLabel,
  report,
  loading = false,
  error,
  ctaHref,
  ctaLabel,
  ctaVariant = "outline",
  className,
  careMode = false,
  showRuntimeMeta = true,
}: WeeklyReportPreviewCardProps) {
  const roleMeta = getWeeklyReportRoleMeta(role);
  const sourceMeta = report && showRuntimeMeta ? getWeeklyReportSourceMeta(report.source) : null;
  const careSection = pickCareSection(report);
  const speechText = buildParentSpeechScript({
    title,
    sections: [
      { label: periodLabel, text: report?.summary ?? "" },
      {
        label: careSection?.title ?? report?.primaryAction?.title ?? "今晚重点",
        text: careSection?.summary ?? report?.primaryAction?.detail ?? "",
      },
    ],
    outro: "仅当前浏览器朗读，用于本机预览。",
  });

  return (
    <SectionCard
      title={title}
      description={description}
      className={className}
      actions={
        report ? (
          <ParentSpeakButton
            text={speechText}
            label="播报摘要"
            careMode={careMode}
            className={careMode ? "min-w-[220px]" : ""}
          />
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{roleMeta.label}</Badge>
          <Badge variant="outline">{periodLabel}</Badge>
          {!careMode && sourceMeta ? <Badge variant={sourceMeta.variant}>{sourceMeta.label}</Badge> : null}
          {!careMode && showRuntimeMeta && report?.memoryMeta?.degraded ? (
            <Badge variant="warning">本地兜底</Badge>
          ) : null}
          {loading && report ? <Badge variant="secondary">刷新中</Badge> : null}
        </div>

        {report?.continuityNotes?.[0] ? (
          <div className="flex items-start gap-3 rounded-3xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>延续提醒：{report.continuityNotes[0]}</p>
          </div>
        ) : null}

        {report ? (
          <>
            {error ? (
              <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
              <p
                className={
                  careMode
                    ? "text-lg font-semibold leading-9 text-slate-900"
                    : "text-base font-semibold leading-8 text-slate-900"
                }
              >
                {report.summary}
              </p>
            </div>

            {careMode ? (
              careSection ? (
                <div className="rounded-3xl border border-slate-100 bg-white p-4">
                  <p className="text-base font-semibold text-slate-900">{careSection.title}</p>
                  <p className="mt-3 text-base leading-8 text-slate-700">{careSection.summary}</p>
                  {careSection.items.length > 0 ? (
                    <ul className="mt-4 space-y-3 text-base leading-7 text-slate-600">
                      {careSection.items.slice(0, 2).map((item) => (
                        <li key={`${careSection.id}-${item.label}`}>
                          <span className="font-medium text-slate-800">{item.label}:</span>{" "}
                          {item.detail}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {report.sections.map((section) => (
                  <div
                    key={section.id}
                    className={cn(
                      "rounded-3xl border border-slate-100 bg-white p-4",
                      report.sections.length === 3 && section.id === "topHomeAction"
                        ? "md:col-span-2"
                        : ""
                    )}
                  >
                    <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{section.summary}</p>
                    {section.items.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                        {section.items.slice(0, 2).map((item) => (
                          <li key={`${section.id}-${item.label}`}>
                            <span className="font-medium text-slate-800">{item.label}:</span>{" "}
                            {item.detail}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-5">
            {loading ? (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
                正在生成本周周报预览
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">本周周报预览暂时不可用。</p>
            )}
          </div>
        )}

        <div className="rounded-3xl border border-slate-100 bg-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary">
                {report?.primaryAction ? report.primaryAction.title : "继续今晚家庭建议"}
              </Badge>
              <p
                className={
                  careMode ? "text-base leading-8 text-slate-700" : "text-sm leading-6 text-slate-700"
                }
              >
                {report?.primaryAction?.detail ??
                  "请先完成当前家庭建议，再补充执行反馈，方便系统继续跟进。"}
              </p>
              {!careMode && report?.primaryAction ? (
                <p className="text-xs text-slate-500">
                  建议负责人：{getWeeklyReportRoleMeta(report.primaryAction.ownerRole).label} · 建议时限：
                  {report.primaryAction.dueWindow}
                </p>
              ) : null}
            </div>
            <Button
              asChild
              variant={ctaVariant}
              className={careMode ? "min-h-12 rounded-2xl text-base" : "min-h-11 rounded-xl"}
            >
              <Link href={ctaHref}>{ctaLabel}</Link>
            </Button>
          </div>
        </div>

        {!careMode && showRuntimeMeta && report?.disclaimer ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-xs leading-6 text-slate-500">
            {report.disclaimer}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
