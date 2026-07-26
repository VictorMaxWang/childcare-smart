"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Baby,
  Bell,
  ChevronRight,
  FileSearch,
  HeartPulse,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import { listMessages, markMessageRead, sendMessage, type ApiMessage } from "@/lib/api/communication";
import type { AccountRole } from "@/lib/auth/accounts";
import type { PrimaryNavItem } from "@/lib/navigation/primary-nav";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type UtilityPanel = "search" | "notifications" | "messages" | null;

interface SearchEntry {
  id: string;
  kind: string;
  title: string;
  description: string;
  href: string;
  keywords: string;
  icon: ReactNode;
}

interface NotificationEntry {
  id: string;
  title: string;
  description: string;
  href: string;
  level: "danger" | "warning" | "info";
  messageId?: string;
  conversationId?: string;
}

export function GlobalUtilityCenter({ navItems }: { navItems: PrimaryNavItem[] }) {
  const router = useRouter();
  const {
    currentUser,
    visibleChildren,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    healthMaterials,
    consultations,
    reminders,
    messages: storedMessages,
  } = useApp();
  const [panel, setPanel] = useState<UtilityPanel>(null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ApiMessage[]>(storedMessages);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [composeChildId, setComposeChildId] = useState(visibleChildren[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const visibleChildIds = useMemo(
    () => new Set(visibleChildren.map((child) => child.id)),
    [visibleChildren]
  );
  const childById = useMemo(
    () => new Map(visibleChildren.map((child) => [child.id, child] as const)),
    [visibleChildren]
  );
  const scopedMessages = useMemo(
    () =>
      messages
        .filter((message) => visibleChildIds.has(message.childId))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [messages, visibleChildIds]
  );

  const refreshMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const next = await listMessages();
      setMessages(next);
      setSelectedConversationId((current) => current ?? latestConversationId(next));
    } catch (error) {
      toast.error("消息刷新失败", { description: readErrorMessage(error) });
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    setMessages(storedMessages);
  }, [storedMessages]);

  useEffect(() => {
    if (!composeChildId && visibleChildren[0]?.id) {
      setComposeChildId(visibleChildren[0].id);
    }
  }, [composeChildId, visibleChildren]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const searchEntries = useMemo(
    () =>
      buildSearchEntries({
        role: currentUser.role,
        navItems,
        visibleChildren,
        messages: scopedMessages,
        healthCheckRecords,
        mealRecords,
        growthRecords,
        healthMaterials,
        consultations,
        reminders,
      }),
    [
      consultations,
      currentUser.role,
      growthRecords,
      healthCheckRecords,
      healthMaterials,
      mealRecords,
      navItems,
      reminders,
      scopedMessages,
      visibleChildren,
    ]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return searchEntries.slice(0, 12);
    return searchEntries
      .filter((entry) => entry.keywords.includes(normalizedQuery))
      .slice(0, 30);
  }, [normalizedQuery, searchEntries]);

  const notifications = useMemo(
    () =>
      buildNotifications({
        role: currentUser.role,
        currentUserId: currentUser.id,
        messages: scopedMessages,
        healthMaterials,
        consultations,
        reminders,
        visibleChildIds,
        childById,
      }),
    [
      childById,
      consultations,
      currentUser.id,
      currentUser.role,
      healthMaterials,
      reminders,
      scopedMessages,
      visibleChildIds,
    ]
  );
  const unreadCount = notifications.length;

  const threads = useMemo(() => groupThreads(scopedMessages), [scopedMessages]);
  const selectedThread = selectedConversationId
    ? threads.find(
        (thread) =>
          thread.conversationId === selectedConversationId ||
          thread.messages.some(
            (message) => message.conversationId === selectedConversationId
          )
      ) ?? null
    : null;

  async function openPanel(nextPanel: Exclude<UtilityPanel, null>) {
    setPanel(nextPanel);
    if (nextPanel === "messages" || nextPanel === "notifications") {
      await refreshMessages();
    }
  }

  function navigateTo(href: string) {
    setPanel(null);
    setQuery("");
    router.push(href);
  }

  async function openThread(conversationId: string) {
    setSelectedConversationId(conversationId);
    const thread = threads.find((item) => item.conversationId === conversationId);
    const unread = (thread?.messages ?? []).filter(
      (message) =>
        message.senderId !== currentUser.id &&
        !message.readBy.includes(currentUser.id)
    );
    if (unread.length === 0) return;

    setMessages((current) =>
      current.map((message) =>
        unread.some((item) => item.messageId === message.messageId)
          ? { ...message, readBy: [...new Set([...message.readBy, currentUser.id])] }
          : message
      )
    );
    const results = await Promise.allSettled(unread.map((message) => markMessageRead(message.messageId)));
    if (results.some((result) => result.status === "rejected")) {
      toast.warning("部分消息未能标记为已读");
    }
  }

  async function handleNotification(entry: NotificationEntry) {
    if (entry.conversationId) {
      setPanel("messages");
      await openThread(entry.conversationId);
      return;
    }
    if (entry.messageId) {
      await markMessageRead(entry.messageId)
        .then((message) => {
          setMessages((current) =>
            current.map((item) => (item.messageId === message.messageId ? message : item))
          );
        })
        .catch((error) => {
          toast.error("消息状态更新失败", { description: readErrorMessage(error) });
        });
    }
    navigateTo(entry.href);
  }

  async function handleSend() {
    const content = draft.trim();
    const childId = selectedThread?.childId ?? composeChildId;
    if (!content || !childId) return;

    setSending(true);
    try {
      const message = await sendMessage({
        childId,
        conversationId: selectedThread?.conversationId,
        content,
      });
      setMessages((current) => [...current.filter((item) => item.messageId !== message.messageId), message]);
      setSelectedConversationId(message.conversationId);
      setDraft("");
      toast.success("消息已发送");
    } catch (error) {
      toast.error("消息发送失败", { description: readErrorMessage(error) });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2" data-testid="global-utility-center">
        <UtilityButton label="搜索" testId="global-search-trigger" onClick={() => void openPanel("search")}>
          <Search className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
        </UtilityButton>
        <UtilityButton
          label="通知"
          testId="notification-center-trigger"
          badge={unreadCount}
          onClick={() => void openPanel("notifications")}
        >
          <Bell className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
        </UtilityButton>
        <UtilityButton
          label="消息"
          testId="message-center-trigger"
          badge={scopedMessages.filter((message) => !message.readBy.includes(currentUser.id)).length}
          onClick={() => void openPanel("messages")}
        >
          <MessageCircle className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
        </UtilityButton>
      </div>

      <Dialog open={panel === "search"} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent className="sm:max-w-2xl" data-testid="global-search-dialog">
          <DialogHeader>
            <DialogTitle>全局搜索</DialogTitle>
            <DialogDescription>搜索当前账号有权查看的页面、幼儿与业务记录。</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索幼儿、记录、会诊或消息"
              className="pl-11"
              data-testid="global-search-input"
            />
          </div>
          <div className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto" data-testid="global-search-results">
            {searchResults.length > 0 ? (
              searchResults.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => navigateTo(entry.href)}
                  className="flex min-h-16 w-full items-center gap-3 px-1 py-3 text-left transition hover:bg-indigo-50/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    {entry.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-950">{entry.title}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {entry.kind} · {entry.description}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              ))
            ) : (
              <UtilityEmpty title="没有找到匹配结果" description="换一个幼儿姓名或业务关键词试试。" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === "notifications"} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent className="sm:max-w-xl" data-testid="notification-center-dialog">
          <DialogHeader>
            <DialogTitle>通知中心</DialogTitle>
            <DialogDescription>{unreadCount > 0 ? `${unreadCount} 项需要关注` : "当前没有待处理通知"}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[58vh] divide-y divide-slate-100 overflow-y-auto">
            {loadingMessages ? (
              <UtilityLoading label="正在刷新通知" />
            ) : notifications.length > 0 ? (
              notifications.slice(0, 40).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => void handleNotification(entry)}
                  data-testid="notification-entry"
                  data-message-notification={
                    entry.conversationId ? "true" : undefined
                  }
                  className="flex min-h-16 w-full items-start gap-3 px-1 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      entry.level === "danger"
                        ? "bg-rose-50 text-rose-600"
                        : entry.level === "warning"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-indigo-50 text-indigo-600"
                    )}
                  >
                    {entry.level === "danger" ? (
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Bell className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-950">{entry.title}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">
                      {entry.description}
                    </span>
                  </span>
                  <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              ))
            ) : (
              <UtilityEmpty title="全部处理完了" description="新的风险、提醒和未读消息会出现在这里。" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={panel === "messages"} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent className="sm:max-w-4xl" data-testid="message-center-dialog">
          <DialogHeader>
            <DialogTitle>家园消息</DialogTitle>
            <DialogDescription>消息会保存到当前机构，并按幼儿与班级权限隔离。</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-[26rem] gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="min-h-0 border-b border-slate-200 pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">会话</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConversationId(null);
                    setComposeChildId(visibleChildren[0]?.id ?? "");
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  data-testid="message-center-new"
                >
                  新消息
                </button>
              </div>
              <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto md:max-h-[25rem]" data-testid="message-thread-list">
                {loadingMessages ? (
                  <UtilityLoading label="正在刷新消息" />
                ) : threads.length > 0 ? (
                  threads.map((thread) => {
                    const unread = thread.messages.filter(
                      (message) =>
                        message.senderId !== currentUser.id &&
                        !message.readBy.includes(currentUser.id)
                    ).length;
                    return (
                      <button
                        key={thread.conversationId}
                        type="button"
                        onClick={() => void openThread(thread.conversationId)}
                        data-testid="message-thread"
                        data-child-id={thread.childId}
                        className={cn(
                          "flex min-h-16 w-full items-center gap-3 px-1 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100",
                          selectedThread?.conversationId === thread.conversationId
                            ? "bg-indigo-50"
                            : "hover:bg-slate-50"
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                          <Baby className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-950">
                            {childById.get(thread.childId)?.name ?? "幼儿会话"}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {thread.latest.content}
                          </span>
                        </span>
                        {unread > 0 ? <CountBadge count={unread} /> : null}
                      </button>
                    );
                  })
                ) : (
                  <UtilityEmpty title="暂无会话" description="选择幼儿后发送第一条消息。" compact />
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              {selectedThread ? (
                <>
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {childById.get(selectedThread.childId)?.name ?? "幼儿会话"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {childById.get(selectedThread.childId)?.className ?? selectedThread.latest.classId}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigateTo(messageRoute(currentUser.role, selectedThread.childId))}>
                      打开业务页
                      <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="min-h-40 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="message-thread-detail">
                    {selectedThread.messages.map((message) => {
                      const own = message.senderId === currentUser.id;
                      return (
                        <div key={message.messageId} className={cn("flex", own ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[86%] rounded-lg px-3 py-2.5 text-sm leading-6",
                              own ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
                            )}
                          >
                            <p className={cn("mb-1 text-xs font-semibold", own ? "text-indigo-100" : "text-slate-500")}>
                              {message.senderName}
                            </p>
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <p className={cn("mt-1 text-[11px]", own ? "text-indigo-100" : "text-slate-400")}>
                              {formatDateTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="mb-3">
                  <label htmlFor="message-child" className="mb-2 block text-sm font-semibold text-slate-700">
                    发送给
                  </label>
                  <select
                    id="message-child"
                    value={composeChildId}
                    onChange={(event) => setComposeChildId(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                    data-testid="message-center-child-select"
                  >
                    {visibleChildren.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name} · {child.className}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="输入消息"
                  className="min-h-24"
                  data-testid="message-center-input"
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    onClick={() => void handleSend()}
                    disabled={!draft.trim() || !(selectedThread?.childId ?? composeChildId)}
                    loading={sending}
                    data-testid="message-center-send"
                  >
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                    发送
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UtilityButton({
  badge = 0,
  children,
  label,
  onClick,
  testId,
}: {
  badge?: number;
  children: ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={badge > 0 ? `${label}，${badge} 项未处理` : label}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 sm:h-10 sm:w-10 sm:rounded-2xl"
    >
      {children}
      {badge > 0 ? <CountBadge count={badge} floating /> : null}
    </button>
  );
}

function CountBadge({ count, floating = false }: { count: number; floating?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white",
        floating && "absolute -right-1 -top-1"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function UtilityEmpty({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 text-center", compact ? "min-h-28" : "min-h-44")}>
      <Sparkles className="mb-3 h-6 w-6 text-slate-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function UtilityLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

function buildSearchEntries(input: {
  role: AccountRole;
  navItems: PrimaryNavItem[];
  visibleChildren: ReturnType<typeof useApp>["visibleChildren"];
  messages: ApiMessage[];
  healthCheckRecords: ReturnType<typeof useApp>["healthCheckRecords"];
  mealRecords: ReturnType<typeof useApp>["mealRecords"];
  growthRecords: ReturnType<typeof useApp>["growthRecords"];
  healthMaterials: ReturnType<typeof useApp>["healthMaterials"];
  consultations: ReturnType<typeof useApp>["consultations"];
  reminders: ReturnType<typeof useApp>["reminders"];
}) {
  const entries: SearchEntry[] = [];
  const childById = new Map(input.visibleChildren.map((child) => [child.id, child] as const));
  const add = (entry: Omit<SearchEntry, "keywords"> & { keywords?: string }) => {
    const keywords = [
      entry.kind,
      entry.title,
      entry.description,
      entry.keywords ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    entries.push({ ...entry, keywords });
  };

  input.navItems.forEach((item) =>
    add({
      id: `nav-${item.href}`,
      kind: "页面",
      title: item.label,
      description: "打开业务页面",
      href: item.href,
      icon: <Search className="h-4 w-4" aria-hidden="true" />,
    })
  );
  input.visibleChildren.forEach((child) =>
    add({
      id: `child-${child.id}`,
      kind: "幼儿",
      title: child.name,
      description: `${child.className ?? "待分班"} · ${child.nickname ?? child.id}`,
      href: childRoute(input.role, child.id),
      keywords: `${child.id} ${child.specialNotes ?? ""}`,
      icon: <Baby className="h-4 w-4" aria-hidden="true" />,
    })
  );
  input.healthCheckRecords.slice(-120).forEach((record) => {
    const child = childById.get(record.childId);
    if (!child) return;
    add({
      id: `health-${record.id}`,
      kind: "健康记录",
      title: `${child.name} · ${record.temperature ?? "--"}℃`,
      description: record.remark || record.mood || record.date,
      href: healthRoute(input.role, record.childId),
      keywords: JSON.stringify(record),
      icon: <HeartPulse className="h-4 w-4" aria-hidden="true" />,
    });
  });
  input.mealRecords.slice(-120).forEach((record) => {
    const child = childById.get(record.childId);
    if (!child) return;
    add({
      id: `meal-${record.id}`,
      kind: "饮食记录",
      title: `${child.name} · ${record.meal}`,
      description: `${record.date} · 饮水 ${record.waterMl ?? 0} ml`,
      href: dietRoute(input.role, record.childId),
      keywords: JSON.stringify(record),
      icon: <FileSearch className="h-4 w-4" aria-hidden="true" />,
    });
  });
  input.growthRecords.slice(-120).forEach((record) => {
    const child = childById.get(record.childId);
    if (!child) return;
    add({
      id: `growth-${record.id}`,
      kind: "成长记录",
      title: `${child.name} · ${record.category}`,
      description: record.description,
      href: growthRoute(input.role, record.childId),
      keywords: JSON.stringify(record),
      icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
    });
  });
  input.healthMaterials.forEach((material) => {
    const child = childById.get(material.childId);
    if (!child) return;
    add({
      id: `material-${material.materialId}`,
      kind: "健康材料",
      title: material.filename,
      description: `${child.name} · ${material.parseStatus}`,
      href: materialRoute(input.role, material.childId),
      keywords: `${material.description ?? ""} ${JSON.stringify(material.parseResult ?? {})}`,
      icon: <FileSearch className="h-4 w-4" aria-hidden="true" />,
    });
  });
  input.consultations.forEach((consultation) => {
    const child = childById.get(consultation.childId);
    if (!child) return;
    add({
      id: `consultation-${consultation.consultationId}`,
      kind: "会诊",
      title: `${child.name} · ${consultation.riskLevel === "high" ? "高风险" : "跟进"}`,
      description: consultation.summary,
      href: consultationRoute(input.role, consultation.childId, consultation.consultationId),
      keywords: JSON.stringify(consultation),
      icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    });
  });
  input.reminders.forEach((reminder) => {
    const childId = reminder.childId ?? reminder.targetId;
    if (!childById.has(childId)) return;
    add({
      id: `reminder-${reminder.reminderId}`,
      kind: "提醒",
      title: reminder.title,
      description: reminder.description,
      href: reminderRoute(input.role, childId),
      keywords: `${reminder.status} ${reminder.scheduledAt}`,
      icon: <Bell className="h-4 w-4" aria-hidden="true" />,
    });
  });
  input.messages.slice(-100).forEach((message) => {
    const child = childById.get(message.childId);
    if (!child) return;
    add({
      id: `message-${message.messageId}`,
      kind: "消息",
      title: `${message.senderName} · ${child.name}`,
      description: message.content,
      href: messageRoute(input.role, message.childId),
      keywords: `${message.senderRole} ${message.createdAt}`,
      icon: <MessageCircle className="h-4 w-4" aria-hidden="true" />,
    });
  });

  return dedupeSearchEntries(entries);
}

function buildNotifications(input: {
  role: AccountRole;
  currentUserId: string;
  messages: ApiMessage[];
  healthMaterials: ReturnType<typeof useApp>["healthMaterials"];
  consultations: ReturnType<typeof useApp>["consultations"];
  reminders: ReturnType<typeof useApp>["reminders"];
  visibleChildIds: Set<string>;
  childById: Map<string, ReturnType<typeof useApp>["visibleChildren"][number]>;
}) {
  const entries: NotificationEntry[] = [];
  input.messages
    .filter(
      (message) =>
        message.senderId !== input.currentUserId &&
        !message.readBy.includes(input.currentUserId)
    )
    .slice(-20)
    .reverse()
    .forEach((message) => {
      entries.push({
        id: `unread-${message.messageId}`,
        title: `${message.senderName} 发来消息`,
        description: message.content,
        href: messageRoute(input.role, message.childId),
        level: "info",
        messageId: message.messageId,
        conversationId: message.conversationId,
      });
    });

  input.consultations
    .filter((consultation) => {
      const workflowStatus = readStringField(consultation, "workflowStatus");
      const decisionStatus = consultation.directorDecisionCard?.status;
      return (
        input.visibleChildIds.has(consultation.childId) &&
        consultation.riskLevel === "high" &&
        workflowStatus !== "resolved" &&
        workflowStatus !== "archived" &&
        decisionStatus !== "completed"
      );
    })
    .slice(0, 12)
    .forEach((consultation) => {
      entries.push({
        id: `risk-${consultation.consultationId}`,
        title: `${input.childById.get(consultation.childId)?.name ?? "幼儿"}高风险会诊待处理`,
        description: consultation.summary,
        href: consultationRoute(input.role, consultation.childId, consultation.consultationId),
        level: "danger",
      });
    });

  input.healthMaterials
    .filter(
      (material) =>
        input.visibleChildIds.has(material.childId) &&
        (material.parseStatus === "failed" || material.parseStatus === "pending")
    )
    .slice(0, 10)
    .forEach((material) => {
      entries.push({
        id: `material-${material.materialId}`,
        title: material.parseStatus === "failed" ? "健康材料解析失败" : "健康材料等待解析",
        description: `${input.childById.get(material.childId)?.name ?? "幼儿"} · ${material.filename}`,
        href: materialRoute(input.role, material.childId),
        level: material.parseStatus === "failed" ? "danger" : "warning",
      });
    });

  const roleToken = input.role === "家长" ? "parent" : input.role === "教师" ? "teacher" : "admin";
  const now = Date.now();
  input.reminders
    .filter((reminder) => {
      const childId = reminder.childId ?? reminder.targetId;
      const scheduledAt = Date.parse(reminder.scheduledAt);
      return (
        input.visibleChildIds.has(childId) &&
        (reminder.targetRole === roleToken || reminder.assigneeRole === roleToken) &&
        reminder.status !== "acknowledged" &&
        reminder.status !== "done" &&
        (!Number.isFinite(scheduledAt) || scheduledAt <= now)
      );
    })
    .slice(0, 12)
    .forEach((reminder) => {
      const childId = reminder.childId ?? reminder.targetId;
      entries.push({
        id: `reminder-${reminder.reminderId}`,
        title: reminder.title,
        description: reminder.description,
        href: reminderRoute(input.role, childId),
        level: "warning",
      });
    });

  return entries;
}

function groupThreads(messages: ApiMessage[]) {
  const groups = new Map<string, ApiMessage[]>();
  messages.forEach((message) => {
    // 旧数据可能为同一幼儿生成过多个 conversationId；顶部中心按幼儿合并，
    // 回复时继续使用该幼儿最新一条消息的 conversationId，避免列表出现重复会话。
    groups.set(message.childId, [...(groups.get(message.childId) ?? []), message]);
  });
  return [...groups.entries()]
    .map(([childId, threadMessages]) => {
      const sorted = [...threadMessages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const latest = sorted.at(-1) as ApiMessage;
      return {
        conversationId: latest.conversationId,
        childId,
        messages: sorted,
        latest,
      };
    })
    .filter((thread) => Boolean(thread.latest))
    .sort((left, right) => right.latest.createdAt.localeCompare(left.latest.createdAt));
}

function latestConversationId(messages: ApiMessage[]) {
  return [...messages].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.conversationId ?? null;
}

function dedupeSearchEntries(entries: SearchEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function childRoute(role: AccountRole, childId: string) {
  if (role === "家长") return `/parent?child=${encodeURIComponent(childId)}`;
  return `/children?child=${encodeURIComponent(childId)}`;
}

function healthRoute(role: AccountRole, childId: string) {
  return `/health?child=${encodeURIComponent(childId)}`;
}

function dietRoute(role: AccountRole, childId: string) {
  return `/diet?child=${encodeURIComponent(childId)}`;
}

function growthRoute(role: AccountRole, childId: string) {
  return `/growth?child=${encodeURIComponent(childId)}`;
}

function materialRoute(role: AccountRole, childId: string) {
  if (role === "教师") return `/teacher/health-file-bridge?childId=${encodeURIComponent(childId)}`;
  return healthRoute(role, childId);
}

function consultationRoute(role: AccountRole, childId: string, consultationId?: string) {
  const query = new URLSearchParams({ childId });
  if (consultationId) query.set("consultationId", consultationId);
  if (role === "教师") return `/teacher/high-risk-consultation?${query.toString()}`;
  if (role === "家长") {
    return `/parent/agent?child=${encodeURIComponent(childId)}#feedback`;
  }
  // 园长需直接落到完整会诊承接区，同时保留可审计、可复现的具体会诊上下文。
  return `/admin?${query.toString()}#admin-risk-priority-detail`;
}

function reminderRoute(role: AccountRole, childId: string) {
  if (role === "家长") return `/parent/reminders?child=${encodeURIComponent(childId)}`;
  if (role === "教师") {
    return `/teacher/agent?intent=record_observation&childId=${encodeURIComponent(childId)}`;
  }
  return "/admin/agent";
}

function messageRoute(role: AccountRole, childId: string) {
  if (role === "家长") return `/parent/agent?child=${encodeURIComponent(childId)}#feedback`;
  if (role === "教师") return `/teacher/agent?action=communication&childId=${encodeURIComponent(childId)}`;
  return "/admin";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readStringField(value: unknown, key: string) {
  if (!value || typeof value !== "object") return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : "";
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请稍后重试。";
}
