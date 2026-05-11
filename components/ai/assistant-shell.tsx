import type { ReactNode } from "react";
import { Bot, Sparkles } from "lucide-react";
import { ReplicaPanel, ReplicaStatusPill } from "@/components/cards";
import { cn } from "@/lib/utils";

export function AssistantWorkspaceFrame({
  actions,
  children,
  className,
  description,
  prompts,
  rightRail,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  prompts?: ReactNode;
  rightRail?: ReactNode;
  title: ReactNode;
}) {
  return (
    <ReplicaPanel
      data-testid="r02-assistant-frame"
      title={title}
      description={description}
      className={cn("bg-[var(--replica-gradient-ai)]", className)}
      actions={
        actions ?? (
          <ReplicaStatusPill tone="pending">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            AI
          </ReplicaStatusPill>
        )
      }
    >
      {prompts ? <div className="mb-4 flex flex-wrap gap-2">{prompts}</div> : null}
      <div className={cn("grid gap-4", rightRail ? "lg:grid-cols-[minmax(0,1fr)_18rem]" : "grid-cols-1")}>
        <div className="min-w-0">{children}</div>
        {rightRail ? <aside className="min-w-0">{rightRail}</aside> : null}
      </div>
    </ReplicaPanel>
  );
}

export function AssistantPromptList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

export function AssistantConversationPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[1.2rem] border border-indigo-100 bg-white/86 p-4 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function AssistantResultCard({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  return (
    <article className={cn("rounded-[1.15rem] border border-indigo-100 bg-white p-4 shadow-sm", className)}>
      {title ? (
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-indigo-700">
          <Bot className="h-4 w-4" aria-hidden="true" />
          {title}
        </div>
      ) : null}
      {children}
    </article>
  );
}

export function AssistantRightRail({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-3 rounded-[1.2rem] border border-slate-100 bg-white/72 p-4", className)}>{children}</div>;
}
