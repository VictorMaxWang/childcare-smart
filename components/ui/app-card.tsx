import * as React from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AppCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  padded?: boolean;
}

function AppCard({
  title,
  description,
  actions,
  footer,
  padded = true,
  className,
  children,
  ...props
}: AppCardProps) {
  const hasHeader = title || description || actions;

  return (
    <Card className={cn("overflow-hidden", className)} {...props}>
      {hasHeader ? (
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? <CardDescription className="mt-1.5 leading-6">{description}</CardDescription> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(!hasHeader && padded ? "pt-5 sm:pt-6" : undefined, !padded && "p-0")}>
        {children}
      </CardContent>
      {footer ? <CardFooter className="border-t border-(--border-subtle) bg-(--panel-subtle)">{footer}</CardFooter> : null}
    </Card>
  );
}

export { AppCard };
