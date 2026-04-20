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
      className="rounded-[2rem] border-dashed border-white/18 px-6 py-12 text-center"
      interactive={false}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white/70 shadow-[var(--shadow-card)]">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/62">{description}</p>
      {actionLabel && onAction ? (
        <div className="mt-6">
          <Button variant="outline" onClick={onAction}>{actionLabel}</Button>
        </div>
      ) : null}
    </PremiumCard>
  );
}
