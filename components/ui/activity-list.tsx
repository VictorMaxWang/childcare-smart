import * as React from "react";
import { StatusTag, type StatusTagVariant } from "@/components/ui/status-tag";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  time?: React.ReactNode;
  status?: React.ReactNode;
  statusVariant?: StatusTagVariant;
  icon?: React.ReactNode;
}

export interface ActivityListProps extends React.HTMLAttributes<HTMLDivElement> {
  items: ActivityItem[];
}

function ActivityList({ items, className, ...props }: ActivityListProps) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      {items.map((item) => (
        <div key={item.id} className="flex gap-3 rounded-lg border border-(--border-subtle) bg-white p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--primary-soft) text-(--primary)">
            {item.icon ?? <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-(--text-primary)">{item.title}</p>
              {item.time ? <span className="text-xs text-(--text-helper)">{item.time}</span> : null}
            </div>
            {item.description ? <p className="mt-1 text-sm leading-6 text-(--text-tertiary)">{item.description}</p> : null}
            {item.status ? (
              <StatusTag variant={item.statusVariant ?? "neutral"} className="mt-2">
                {item.status}
              </StatusTag>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export { ActivityList };
