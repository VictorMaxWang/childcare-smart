"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MessageSquareText, RefreshCw, Save, X } from "lucide-react";
import { AttachmentPreviewList } from "@/components/communication/AttachmentMediaPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFeedbackDetail, updateFeedbackStatus } from "@/lib/api/communication";
import type { ApiFeedbackDetail, FeedbackStatus } from "@/lib/api/types";
import { formatHomeSchoolTime } from "@/lib/communication/home-school";

const STATUS_OPTIONS: Array<{ value: FeedbackStatus; label: string }> = [
  { value: "open", label: "未处理" },
  { value: "in-progress", label: "处理中" },
  { value: "resolved", label: "已解决" },
  { value: "archived", label: "已归档" },
];

function normalizeDetail(detail: ApiFeedbackDetail): ApiFeedbackDetail {
  return {
    ...detail,
    messages: detail.messages ?? [],
    replies: detail.replies ?? [],
    attachments: detail.attachments ?? [],
    statusHistory: detail.statusHistory ?? [],
  };
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function formatDateTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedbackDetailDialog({
  feedbackId,
  open,
  canUpdateStatus = false,
  onOpenChange,
  onUpdated,
}: {
  feedbackId: string | null;
  open: boolean;
  canUpdateStatus?: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (detail: ApiFeedbackDetail) => void;
}) {
  const [detail, setDetail] = useState<ApiFeedbackDetail | null>(null);
  const [statusDraft, setStatusDraft] = useState<FeedbackStatus>("open");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !feedbackId) return;
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    getFeedbackDetail(feedbackId)
      .then((nextDetail) => {
        if (cancelled) return;
        const normalized = normalizeDetail(nextDetail);
        setDetail(normalized);
        setStatusDraft(normalized.feedback?.status ?? "open");
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "反馈详情读取失败。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [feedbackId, open]);

  const feedback = detail?.feedback ?? null;
  const child = detail?.child ?? null;
  const parent = detail?.parent ?? null;
  const teacher = detail?.teacher ?? null;
  const attachments = detail?.attachments ?? [];
  const statusHistory = detail?.statusHistory ?? [];
  const canRenderDetail = Boolean(feedback && child);

  const sortedMessages = useMemo(
    () => [...(detail?.messages ?? [])].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [detail?.messages]
  );

  async function saveStatus() {
    if (!feedbackId || !detail) return;
    setSaving(true);
    setMessage(null);
    try {
      const nextDetail = normalizeDetail(await updateFeedbackStatus(feedbackId, statusDraft));
      setDetail(nextDetail);
      setStatusDraft(nextDetail.feedback?.status ?? "open");
      setMessage("状态已保存。");
      onUpdated?.(nextDetail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态保存失败。");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="关闭反馈详情"
        className="fixed inset-0 bg-slate-950/52 backdrop-blur-md"
        onClick={() => onOpenChange(false)}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-detail-title"
        data-testid="feedback-detail-dialog"
        className="fixed inset-x-0 bottom-0 z-[71] grid max-h-[calc(100dvh-0.75rem)] w-full gap-5 overflow-y-auto overscroll-contain rounded-t-[28px] border border-indigo-100 bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-24px_72px_rgb(15_23_42_/_0.18)] sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:p-6 sm:shadow-[0_28px_80px_rgb(15_23_42_/_0.20)]"
      >
        <header className="flex flex-col space-y-2 pr-10 text-left">
          <h2 id="feedback-detail-title" className="text-xl font-semibold leading-tight text-slate-950">反馈详情</h2>
          <p className="text-sm leading-6 text-slate-500">
            {canRenderDetail && child ? `${child.name} · ${child.className}` : loading ? "正在读取反馈详情..." : "查看反馈、消息、附件和状态历史。"}
          </p>
        </header>
        <button
          type="button"
          aria-label="关闭反馈详情"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white/88 text-slate-500 opacity-90 shadow-sm ring-offset-background transition-colors hover:bg-indigo-50 hover:text-indigo-600 hover:opacity-100 focus:outline-none focus:ring-4 focus:ring-indigo-100 sm:right-5 sm:top-5 sm:h-9 sm:w-9"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
            <RefreshCw className="h-4 w-4 animate-spin" />
            加载中
          </div>
        ) : detail && canRenderDetail && feedback && child ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["儿童", child.name],
                ["家长", parent?.name ?? "未绑定"],
                ["教师", teacher?.name ?? "未分配"],
                ["状态", statusLabel(feedback.status)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </div>

            <section className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">结构化反馈</h3>
                  <p className="mt-1 text-sm text-slate-500">{formatDateTime(feedback.submittedAt ?? feedback.date)}</p>
                </div>
                <Badge variant="secondary">{statusLabel(feedback.status)}</Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {feedback.content || feedback.notes || "暂无反馈正文。"}
              </p>
              {feedback.barriers?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {feedback.barriers.map((barrier) => (
                    <span key={barrier} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      {barrier}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            {attachments.length > 0 ? (
              <section className="space-y-3">
                <h3 className="text-base font-semibold text-slate-950">附件</h3>
                <AttachmentPreviewList items={attachments} />
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                <MessageSquareText className="h-4 w-4" />
                关联消息与回复
              </div>
              <div className="space-y-2">
                {sortedMessages.length > 0 ? (
                  sortedMessages.map((item) => (
                    <div key={item.messageId} className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{item.senderName}</span>
                        <span>{formatHomeSchoolTime(item.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">暂无关联消息。</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Clock3 className="h-4 w-4" />
                状态历史
              </div>
              <div className="space-y-2">
                {statusHistory.map((item, index) => (
                  <div key={`${item.action}-${item.createdAt}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-800">{statusLabel(item.status)}</span>
                    <span className="text-slate-500">{formatDateTime(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            </section>

            {canUpdateStatus ? (
              <section className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-semibold text-slate-700">
                  更新状态
                  <select
                    data-testid="feedback-status-select"
                    className="mt-2 block h-10 rounded-xl border border-indigo-100 bg-white px-3 text-sm text-slate-900"
                    value={statusDraft}
                    onChange={(event) => setStatusDraft(event.target.value as FeedbackStatus)}
                  >
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button data-testid="feedback-status-save" type="button" onClick={() => void saveStatus()} loading={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  保存状态
                </Button>
              </section>
            ) : null}
          </div>
        ) : detail ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-5 text-sm leading-6 text-amber-800" role="alert">
            反馈详情数据不完整，请重试或返回列表后再打开。
          </div>
        ) : null}

        {message ? (
          <p className="text-sm text-slate-600" role="status">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
