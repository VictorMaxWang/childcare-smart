"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

export function RolePageShell({
  badge,
  title,
  description,
  actions,
  children,
}: {
  badge: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-page page-enter">
      <div className="rounded-xl border border-(--border) bg-linear-to-r from-white via-indigo-50/60 to-sky-50 p-5 shadow-[var(--shadow-card)] backdrop-blur-sm sm:p-6">
        <PageHeader
          eyebrow={
            <Badge variant="info" className="px-3 py-1 text-xs">
              {badge}
            </Badge>
          }
          title={title}
          description={description}
          actions={actions}
        />
      </div>
      <div className="mt-6">{children}</div>
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
        "grid gap-6",
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
        <Card
          key={item.label}
          className={cn(
            "min-h-31 overflow-hidden rounded-lg border-(--border) border-l-4 bg-white shadow-[var(--shadow-card)]",
            toneClassMap[item.tone ?? "indigo"]
          )}
        >
          <CardContent className="py-4">
            <p className="text-sm font-medium text-(--text-tertiary)">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold leading-tight text-(--text-primary)">{item.value}</p>
          </CardContent>
        </Card>
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
    <Card className={cn("rounded-lg border-(--border) shadow-[var(--shadow-card)]", className)}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg text-(--text-primary)">{title}</CardTitle>
          {description ? <CardDescription className="mt-2">{description}</CardDescription> : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
    <SectionCard
      title={title}
      description={description}
      actions={
        <Badge variant="secondary" className="gap-1 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5" />
          {badgeLabel}
        </Badge>
      }
    >
      {promptButtons ? <div className="mb-4 flex flex-wrap gap-2">{promptButtons}</div> : null}
      {children}
    </SectionCard>
  );
}

const toneClassMap = {
  indigo: "border-l-indigo-300",
  emerald: "border-l-emerald-300",
  amber: "border-l-amber-300",
  sky: "border-l-sky-300",
};
