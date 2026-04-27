import type { ReactNode } from "react";
import { EmptyState as SharedEmptyState } from "@/components/ui/state-block";

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
    <SharedEmptyState
      icon={icon}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
