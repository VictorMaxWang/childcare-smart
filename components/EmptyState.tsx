import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import PremiumCard from "@/components/visuals/PremiumCard";

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <PremiumCard
      surface="glass"
      className="rounded-[2rem] border-dashed border-slate-200/90 px-6 py-12 text-center"
      interactive={false}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {actionLabel && onAction ? (
        <div className="mt-6">
          <Button variant="outline" onClick={onAction}>{actionLabel}</Button>
        </div>
      ) : null}
    </PremiumCard>
  );
}
