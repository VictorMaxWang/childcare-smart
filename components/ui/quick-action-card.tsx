import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppCard } from "@/components/ui/app-card";
import { cn } from "@/lib/utils";

export interface QuickActionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  action?: React.ReactNode;
}

function QuickActionCard({
  title,
  description,
  icon,
  href,
  action,
  className,
  ...props
}: QuickActionCardProps) {
  const content = (
    <div className="flex items-center gap-3">
      {icon ? <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--primary-soft) text-(--primary)">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-(--text-primary)">{title}</p>
        {description ? <p className="mt-1 text-sm leading-5 text-(--text-tertiary)">{description}</p> : null}
      </div>
      {action ?? (href ? <ArrowRight className="h-4 w-4 shrink-0 text-(--text-helper)" /> : null)}
    </div>
  );

  return (
    <AppCard className={cn("transition hover:border-(--primary) hover:shadow-[var(--shadow-card-hover)]", className)} {...props}>
      {href ? (
        <Link href={href} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2">
          {content}
        </Link>
      ) : (
        content
      )}
    </AppCard>
  );
}

export { QuickActionCard };
