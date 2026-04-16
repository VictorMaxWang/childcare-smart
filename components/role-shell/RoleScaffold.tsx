"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 page-enter">
      <div className="rounded-[28px] border border-white/60 bg-white/75 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="info" className="px-3 py-1 text-xs">
              {badge}
            </Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base">{description}</p>
          </div>
          {actions ? <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">{actions}</div> : null}
        </div>
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
  return (
    <div
      className={cn(
        "grid gap-6",
        stacked ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]"
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className={cn("overflow-hidden border-l-4 bg-white", toneClassMap[item.tone ?? "indigo"])}>
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
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
    <Card className={cn("border-slate-100 shadow-sm", className)}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg text-slate-900">{title}</CardTitle>
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
