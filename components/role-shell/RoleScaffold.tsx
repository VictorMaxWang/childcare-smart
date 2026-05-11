"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { AssistantWorkspaceFrame } from "@/components/ai";
import { ReplicaMetricCard, ReplicaPanel, type ReplicaTone } from "@/components/cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

export function RolePageShell({
  badge,
  title,
  description,
  actions,
  children,
  headerVariant = "default",
  className,
  contentClassName,
  testId,
}: {
  badge: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  headerVariant?: "default" | "compact" | "hidden";
  className?: string;
  contentClassName?: string;
  testId?: string;
}) {
  if (headerVariant === "hidden") {
    return (
      <div className={cn("app-page page-enter", className)} data-testid={testId}>
        <div className={cn("pixel-content-frame", contentClassName)}>{children}</div>
      </div>
    );
  }

  return (
    <div className={cn("app-page page-enter", className)} data-testid={testId}>
      <div
        className={cn(
          "pixel-page-hero overflow-hidden rounded-[1.55rem] border border-[#dfe7f5] bg-[linear-gradient(135deg,#ffffff_0%,#eef4ff_48%,#ecfeff_100%)] shadow-[0_18px_52px_rgb(79_70_229_/_0.09)] backdrop-blur-sm",
          headerVariant === "compact" ? "p-4 sm:p-5" : "p-5 sm:p-6"
        )}
      >
        <PageHeader
          eyebrow={
            <Badge variant="info" className="rounded-full border border-sky-100 bg-white/80 px-3 py-1 text-xs font-bold text-sky-700 shadow-sm">
              {badge}
            </Badge>
          }
          title={title}
          description={description}
          actions={actions}
        />
      </div>
      <div className={cn("pixel-content-frame mt-6", contentClassName)}>{children}</div>
    </div>
  );
}

export function RoleSplitLayout({
  main,
  aside,
  stacked = false,
}: {
  main: ReactNode;
  aside: ReactNode;
  stacked?: boolean;
}) {
  const hasAside = Boolean(aside);

  return (
    <div
      className={cn(
        "grid gap-5 lg:gap-6",
        stacked || !hasAside
          ? "grid-cols-1"
          : "lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]"
      )}
    >
      {main}
      {aside}
    </div>
  );
}

export function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: "indigo" | "emerald" | "amber" | "sky" }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <ReplicaMetricCard
          key={item.label}
          className={cn("border-l-4", metricBorderClassMap[item.tone ?? "indigo"])}
          label={item.label}
          tone={metricToneMap[item.tone ?? "indigo"]}
          value={item.value}
        />
      ))}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ReplicaPanel title={title} description={description} actions={actions} className={className}>
      {children}
    </ReplicaPanel>
  );
}

export function AssistantEntryCard({
  title,
  description,
  href,
  buttonLabel,
  children,
}: {
  title: string;
  description: string;
  href: string;
  buttonLabel: string;
  children?: ReactNode;
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      className="border-indigo-100 bg-linear-to-br from-indigo-50 via-white to-sky-50"
      actions={
        <Button asChild variant="premium" className="min-h-11 rounded-xl px-4">
          <Link href={href}>{buttonLabel}</Link>
        </Button>
      }
    >
      {children}
    </SectionCard>
  );
}

export function InlineLinkButton({
  href,
  label,
  variant = "outline",
}: {
  href: string;
  label: string;
  variant?: "outline" | "premium" | "secondary";
}) {
  return (
    <Button asChild variant={variant} className="min-h-11 rounded-xl">
      <Link href={href} className="gap-2">
        {label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}

export function AgentWorkspaceCard({
  title,
  description,
  badgeLabel = "Agent 入口",
  promptButtons,
  children,
}: {
  title: string;
  description: string;
  badgeLabel?: string;
  promptButtons?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AssistantWorkspaceFrame
      title={title}
      description={description}
      actions={
        <Badge variant="secondary" className="gap-1 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5" />
          {badgeLabel}
        </Badge>
      }
      prompts={promptButtons}
    >
      {children}
    </AssistantWorkspaceFrame>
  );
}

const metricToneMap: Record<"indigo" | "emerald" | "amber" | "sky", ReplicaTone> = {
  indigo: "primary",
  emerald: "success",
  amber: "warning",
  sky: "info",
};

const metricBorderClassMap = {
  indigo: "border-l-indigo-300",
  emerald: "border-l-emerald-300",
  amber: "border-l-amber-300",
  sky: "border-l-sky-300",
};
