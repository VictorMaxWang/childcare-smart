import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}

function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  backHref,
  backLabel = "返回",
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)} {...props}>
      <div className="min-w-0">
        {breadcrumbs ? <div className="mb-3 text-sm text-(--text-tertiary)">{breadcrumbs}</div> : null}
        {backHref ? (
          <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 gap-1 text-(--text-tertiary)">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </Button>
        ) : null}
        {eyebrow ? <div className="mb-2 text-sm font-medium text-(--primary)">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold leading-tight text-(--text-primary) sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-(--text-tertiary) sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export { PageHeader };
