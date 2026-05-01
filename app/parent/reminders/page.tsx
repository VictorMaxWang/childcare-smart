"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useParentD01Data } from "@/components/parent/useParentD01Data";
import { InlineLinkButton, RolePageShell, SectionCard } from "@/components/role-shell/RoleScaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ParentRemindersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const childFromQuery = searchParams.get("child");
  const {
    selectedChild,
    selectedChildId,
    invalidChildId,
    parentHomeData,
    markParentReminderRead,
  } = useParentD01Data(childFromQuery);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedChildId || invalidChildId || childFromQuery === selectedChildId) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("child", selectedChildId);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [childFromQuery, invalidChildId, pathname, router, searchParams, selectedChildId]);

  const reminders = useMemo(
    () => [...(parentHomeData?.reminders ?? [])].sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)),
    [parentHomeData?.reminders]
  );
  const pendingCount = reminders.filter((item) => item.status === "pending").length;

  function handleMarkRead(reminderId: string) {
    setStatusMessage("正在保存已读状态...");
    const result = markParentReminderRead(reminderId);
    if (result.status === "failed") {
      setStatusMessage(`已读状态保存失败：${result.error ?? result.message}`);
      return;
    }

    setStatusMessage(
      result.status === "local_only"
        ? "已读状态已写入 D01 本地演示持久化，刷新后仍会保留。"
        : "已读状态已保存。"
    );
  }

  if (invalidChildId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="无权查看这个孩子的提醒"
          description="当前家长账号只能查看自己绑定孩子的提醒，系统不会自动回退到其他 child。"
        />
      </div>
    );
  }

  if (!selectedChild || !parentHomeData) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title="当前家长账号暂无可查看提醒"
          description="没有授权孩子或提醒数据为空时，会显示真实空状态。"
        />
      </div>
    );
  }

  return (
    <RolePageShell
      badge={`日常提醒 · ${selectedChild.name}`}
      title="日常提醒"
      description="提醒来自 D01 store，按 childId 隔离；标记已读会写入持久化层。"
      className="max-w-[76rem]"
      actions={
        <>
          <InlineLinkButton href={`/parent?child=${selectedChild.id}`} label="返回家长首页" />
          <InlineLinkButton href={`/parent/agent?child=${selectedChild.id}#feedback`} label="家园沟通" variant="premium" />
        </>
      }
    >
      <SectionCard
        title={`${selectedChild.name} 的提醒`}
        description="刷新页面后，已读状态仍应保留。"
        actions={
          <Badge variant={pendingCount > 0 ? "warning" : "success"}>
            {pendingCount > 0 ? `${pendingCount} 条待读` : "全部已读"}
          </Badge>
        }
      >
        {statusMessage ? (
          <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
            {statusMessage}
          </div>
        ) : null}

        {reminders.length > 0 ? (
          <div className="space-y-3">
            {reminders.map((reminder) => {
              const isRead = reminder.status !== "pending";
              return (
                <article
                  key={reminder.reminderId}
                  className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isRead ? "success" : "warning"}>
                          {isRead ? "已读" : "待读"}
                        </Badge>
                        <Badge variant="secondary">{reminder.reminderType}</Badge>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatDateTime(reminder.scheduledAt)}
                        </span>
                      </div>
                      <h2 className="mt-3 text-base font-semibold text-slate-950">{reminder.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{reminder.description}</p>
                    </div>
                    <Button
                      type="button"
                      variant={isRead ? "outline" : "premium"}
                      className="rounded-2xl"
                      disabled={isRead}
                      data-testid={`parent-reminder-mark-read-${reminder.reminderId}`}
                      onClick={() => handleMarkRead(reminder.reminderId)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {isRead ? "已读" : "标记已读"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title="暂无日常提醒"
            description="D01 store 中没有当前孩子的提醒，不会用固定 mock 补数据。"
          />
        )}
      </SectionCard>
    </RolePageShell>
  );
}
