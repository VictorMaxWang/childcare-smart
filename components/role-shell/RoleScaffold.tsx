"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AmbientBackground from "@/components/visuals/AmbientBackground";
import GlassSurface from "@/components/visuals/GlassSurface";
import MagneticCTA from "@/components/visuals/MagneticCTA";
import MotionHero from "@/components/visuals/MotionHero";
import RevealSection from "@/components/visuals/RevealSection";
import type { AmbientTone, PageIntensity, SurfaceVariant } from "@/components/visuals/types";
import { cn } from "@/lib/utils";

export function RolePageShell({
  badge,
  title,
  description,
  actions,
  heroAside,
  intensity = "light",
  tone = "brand",
  surface = "glass",
  interactive = intensity === "strong" || intensity === "medium",
  children,
}: {
  badge: string;
  title: string;
  description: string;
  actions?: ReactNode;
  heroAside?: ReactNode;
  intensity?: PageIntensity;
  tone?: AmbientTone;
  surface?: SurfaceVariant;
  interactive?: boolean;
  children: ReactNode;
}) {
  const leadContent = (
    <div className="immersive-hero__lead">
      <div className="hero-sequence hero-sequence-0">
        <Badge variant="info" className="immersive-hero__badge">
          {badge}
        </Badge>
      </div>
      <div className="hero-sequence hero-sequence-1">
        <h1 className="immersive-hero__title">{title}</h1>
        <p className="immersive-hero__description">{description}</p>
      </div>
      {actions ? (
        <div className="hero-sequence hero-sequence-2">
          <div className="immersive-hero__actions">{actions}</div>
        </div>
      ) : null}
    </div>
  );

  return (
    <AmbientBackground intensity={intensity} tone={tone} interactive={interactive} className="pb-6 pt-4 sm:pb-8 sm:pt-6">
      <div className="role-page-shell page-enter" data-role-tone={tone}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <GlassSurface
            tone={tone}
            surface={surface}
            className={cn(
              "immersive-hero rounded-[2rem] border border-white/72 p-5 shadow-[var(--shadow-hero)] sm:p-7",
              tone === "warm" ? "role-page-shell__hero-warm" : null
            )}
          >
            <div className="immersive-hero__veil" />
            {heroAside ? (
              <MotionHero
                className="immersive-hero__grid"
                lead={leadContent}
                support={<div className="immersive-hero__aside">{heroAside}</div>}
              />
            ) : (
              <RevealSection>
                <div className="immersive-hero__grid immersive-hero__grid-single">{leadContent}</div>
              </RevealSection>
            )}
          </GlassSurface>
          <RevealSection delay={180} className="role-page-shell__body mt-6 sm:mt-7">
            {children}
          </RevealSection>
        </div>
      </div>
    </AmbientBackground>
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
        "grid items-start gap-6",
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
  className,
}: {
  items: Array<{ label: string; value: string; tone?: "indigo" | "emerald" | "amber" | "sky" }>;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {items.map((item) => (
        <Card
          key={item.label}
          surface="luminous"
          glow={item.tone === "indigo" ? "brand" : "soft"}
          className={cn(
            "kpi-accent overflow-hidden border border-white/72 border-l-4 bg-white/86",
            toneClassMap[item.tone ?? "indigo"]
          )}
        >
          <CardContent className="py-4 sm:py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500/90">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.9rem]">{item.value}</p>
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
  tone = "brand",
  surface = "solid",
  glow = "soft",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: AmbientTone;
  surface?: SurfaceVariant;
  glow?: "none" | "soft" | "brand" | "warm";
}) {
  return (
    <Card tone={tone} surface={surface} glow={glow} className={cn("border-white/72", className)}>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg text-slate-950 sm:text-[1.15rem]">{title}</CardTitle>
          {description ? <CardDescription className="mt-2 max-w-3xl leading-6">{description}</CardDescription> : null}
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
      surface="luminous"
      glow="brand"
      className="border-indigo-100/80"
      actions={
        <MagneticCTA>
          <Button asChild variant="premium" className="min-h-11 rounded-xl px-4">
            <Link href={href}>{buttonLabel}</Link>
          </Button>
        </MagneticCTA>
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
  const button = (
    <Button asChild variant={variant} className="min-h-11 rounded-xl">
      <Link href={href} className="gap-2">
        {label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );

  if (variant === "premium") {
    return <MagneticCTA>{button}</MagneticCTA>;
  }

  return button;
}

export function AgentWorkspaceCard({
  title,
  description,
  badgeLabel = "Agent Workspace",
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
      surface="glass"
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
