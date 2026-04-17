import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import AmbientBackground from "@/components/visuals/AmbientBackground";
import GlassSurface from "@/components/visuals/GlassSurface";
import RevealSection from "@/components/visuals/RevealSection";
import type { AmbientTone, PageIntensity } from "@/components/visuals/types";

export default function ContentPageShell({
  title,
  description,
  icon,
  actions,
  children,
  tone = "warm",
  intensity = "medium",
  className,
  heroClassName,
  contentClassName,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: AmbientTone;
  intensity?: PageIntensity;
  className?: string;
  heroClassName?: string;
  contentClassName?: string;
}) {
  return (
    <AmbientBackground
      intensity={intensity}
      tone={tone}
      className="px-4 pb-8 pt-5 sm:px-6 sm:pt-6"
      contentClassName="min-h-[calc(100vh-64px)]"
    >
      <div
        className={cn("content-atmosphere-shell mx-auto max-w-7xl page-enter", className)}
        data-content-tone={tone}
      >
        <RevealSection>
          <GlassSurface
            tone={tone}
            surface="glass"
            className={cn(
              "content-atmosphere-shell__hero relative overflow-hidden rounded-[2rem] p-5 shadow-[var(--shadow-card-strong)] sm:p-7",
              heroClassName
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.1),transparent_32%)]" />
            <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                {icon ? (
                  <div className="content-page-header-glow flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--foreground)]">
                    {icon}
                  </div>
                ) : null}
                <h1 className={cn("mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl", icon ? "" : "mt-0")}>
                  {title}
                </h1>
                {description ? (
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                    {description}
                  </p>
                ) : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
            </div>
          </GlassSurface>
        </RevealSection>

        <RevealSection delay={120} className={cn("mt-6", contentClassName)}>
          {children}
        </RevealSection>
      </div>
    </AmbientBackground>
  );
}
