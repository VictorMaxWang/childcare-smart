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
        label: careSection?.title ?? report?.primaryAction?.title ?? "Care focus",
        text: careSection?.summary ?? report?.primaryAction?.detail ?? "",
      },
    ],
    outro: "This audio is available only in the current browser for preview purposes.",
  });

  return (
    <SectionCard
      title={title}
      description={description}
      tone="brand"
      surface={careMode ? "luminous" : "glass"}
      glow={careMode ? "brand" : "soft"}
      className={cn("border-white/14", className)}
      actions={
        report ? (
          <ParentSpeakButton
            text={speechText}
            label="Play audio"
            careMode={careMode}
            className={careMode ? "min-w-[220px]" : ""}
          />
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{roleMeta.label}</Badge>
          <Badge variant="outline">{periodLabel}</Badge>
          {!careMode && sourceMeta ? <Badge variant={sourceMeta.variant}>{sourceMeta.label}</Badge> : null}
          {!careMode && showRuntimeMeta && report?.memoryMeta?.degraded ? (
            <Badge variant="warning">Fallback memory</Badge>
          ) : null}
          {loading && report ? <Badge variant="secondary">Refreshing</Badge> : null}
        </div>

        {report?.continuityNotes?.[0] ? (
          <div className="content-reading-panel rounded-3xl px-4 py-3 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-3 text-sm text-white/68">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-violet-200/72" />
              <p>
                <span className="font-medium text-white/84">Continuity note:</span>{" "}
                {report.continuityNotes[0]}
              </p>
            </div>
          </div>
        ) : null}

        {report ? (
          <>
            {error ? (
              <div className="content-focus-block flex items-start gap-3 rounded-3xl border-amber-200/80 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <div className="content-focus-block rounded-[1.75rem] border border-white/14 p-5 shadow-[var(--shadow-card)]">
              <p
                className={
                  careMode
                    ? "text-lg font-semibold leading-9 text-white"
                    : "text-base font-semibold leading-8 text-white sm:text-[1.05rem]"
                }
              >
                {report.summary}
              </p>
            </div>

            {careMode ? (
              careSection ? (
                <div className="content-reading-panel rounded-3xl p-4 shadow-[var(--shadow-card)]">
                  <p className="text-base font-semibold text-white">{careSection.title}</p>
                  <p className="mt-3 text-base leading-8 text-white/74">{careSection.summary}</p>
                  {careSection.items.length > 0 ? (
                    <ul className="mt-4 space-y-3 text-base leading-7 text-white/68">
                      {careSection.items.slice(0, 2).map((item) => (
                        <li key={`${careSection.id}-${item.label}`}>
                          <span className="font-medium text-white/84">{item.label}:</span>{" "}
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
                      "content-reading-panel rounded-3xl p-4 shadow-[var(--shadow-card)]",
                      report.sections.length === 3 && section.id === "topHomeAction" ? "md:col-span-2" : ""
                    )}
                  >
                    <p className="text-sm font-semibold text-white">{section.title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/68">{section.summary}</p>
                    {section.items.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-white/66">
                        {section.items.slice(0, 2).map((item) => (
                          <li key={`${section.id}-${item.label}`}>
                            <span className="font-medium text-white/84">{item.label}:</span>{" "}
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
          <div className="content-form-panel rounded-3xl border border-dashed border-white/16 p-5">
            {loading ? (
              <div className="flex items-center gap-3 text-sm text-white/68">
                <RefreshCw className="h-4 w-4 animate-spin text-violet-200" />
                Building this week&apos;s report preview...
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : (
              <p className="text-sm text-white/56">This week&apos;s report preview is not available yet.</p>
            )}
          </div>
        )}

        <div className="content-form-panel rounded-[1.75rem] border border-white/14 p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary">
                {report?.primaryAction ? report.primaryAction.title : "Continue tonight\u2019s home action"}
              </Badge>
              <p className={careMode ? "text-base leading-8 text-white/72" : "text-sm leading-6 text-white/72"}>
                {report?.primaryAction?.detail ??
                  "Complete the current home action first, then add feedback so the system can keep following through."}
              </p>
              {!careMode && report?.primaryAction ? (
                <p className="text-xs text-white/52">
                  Owner: {getWeeklyReportRoleMeta(report.primaryAction.ownerRole).label}{" "}
                  <span className="mx-1">·</span>
                  Window: {report.primaryAction.dueWindow}
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
          <div className="content-reading-panel rounded-2xl px-4 py-3 text-xs leading-6 text-white/50">
            {report.disclaimer}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
