import * as React from "react";
import { AppCard } from "@/components/ui/app-card";
import { StatusTag, type StatusTagVariant } from "@/components/ui/status-tag";
import { cn } from "@/lib/utils";

export interface InsightCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tag?: React.ReactNode;
  tagVariant?: StatusTagVariant;
  actions?: React.ReactNode;
}

function InsightCard({
  title,
  description,
  icon,
  tag,
  tagVariant = "info",
  actions,
  className,
  children,
  ...props
}: InsightCardProps) {
  return (
    <AppCard
      className={cn("border-(--info-border) bg-linear-to-br from-white to-sky-50/60", className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        {icon ? <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--info-soft) text-(--info-foreground)">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-(--text-primary)">{title}</h3>
            {tag ? <StatusTag variant={tagVariant}>{tag}</StatusTag> : null}
          </div>
          {description ? <p className="mt-1 text-sm leading-6 text-(--text-tertiary)">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </AppCard>
  );
}

export { InsightCard };
