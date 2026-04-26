"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import TeacherCopilotPanel from "@/components/teacher/TeacherCopilotPanel";
import DraftRecordList from "@/components/teacher/DraftRecordList";
import { Badge } from "@/components/ui/badge";
import {
  mapTeacherDraftRecordsToUiItems,
  type TeacherDraftPersistAdapter,
  type TeacherDraftRecord,
  type TeacherDraftUnderstandingSeed,
} from "@/lib/mobile/teacher-draft-records";
import {
  hasTeacherDraftAttentionSignal,
  normalizeTeacherCopilotFromDraftPayload,
  normalizeTeacherCopilotFromDraftSeed,
} from "@/lib/teacher-copilot/normalize";
import type { TeacherCopilotSectionId } from "@/lib/teacher-copilot/types";

interface MockPreset {
  id: string;
  label: string;
  transcript: string;
  hint?: string;
}

export default function TeacherDraftConfirmationPanel({
  childName,
  sourceDraftId,
  sourceDraftLabel,
  sourceModeLabel,
  sourceSyncStatusLabel,
  sourceTranscript,
  copilotSource,
  seed,
  persistAdapter,
  initialExpandedRecordId,
  mockPresets = [],
  onCreateMockDraft,
}: {
  childName?: string;
  sourceDraftId?: string | null;
  sourceDraftLabel?: string;
  sourceModeLabel?: string;
  sourceSyncStatusLabel?: string;
  sourceTranscript?: string;
  copilotSource?: Record<string, unknown> | null;
  seed: TeacherDraftUnderstandingSeed | null;
  persistAdapter: TeacherDraftPersistAdapter;
  initialExpandedRecordId?: string;
  mockPresets?: MockPreset[];
  onCreateMockDraft?: (transcript: string) => void | Promise<void>;
}) {
  const [records, setRecords] = useState<TeacherDraftRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notifyMutationResult = useCallback(
    (
      action: "confirm" | "edit" | "discard",
      record: TeacherDraftRecord | null
    ) => {
      if (!record) {
        return;
      }

      const message =
        record.persistMessage ??
        (action === "discard"
          ? "草稿已软删除隐藏。"
          : action === "edit"
            ? "编辑已保存。"
            : "草稿已确认。");

      if (record.persistStatus === "failed") {
        toast.error(message);
        return;
      }

      if (record.persistStatus === "local_only") {
        toast(message);
        return;
      }

      if (action === "discard") {
        toast(message);
        return;
      }

      toast.success(message);
    },
    []
  );

  const loadRecords = useCallback(async () => {
    if (!sourceDraftId || !seed) {
      setRecords([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    try {
      const nextRecords = await persistAdapter.listDrafts({
        sourceDraftId,
        includeDiscarded: true,
      });
      setRecords(nextRecords);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "草稿加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [persistAdapter, seed, sourceDraftId]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const discardedCount = useMemo(
    () => records.filter((record) => record.status === "discarded").length,
    [records]
  );
  const visibleItems = useMemo(
    () =>
      mapTeacherDraftRecordsToUiItems(
        records.filter((record) => record.status !== "discarded")
      ),
    [records]
  );
  const copilotPayload = useMemo(
    () =>
      normalizeTeacherCopilotFromDraftPayload(copilotSource) ??
      normalizeTeacherCopilotFromDraftSeed(seed),
    [copilotSource, seed]
  );
  const defaultOpenSection = useMemo<TeacherCopilotSectionId | null>(() => {
    if (
      copilotPayload?.recordCompletionHints?.length &&
      (hasTeacherDraftAttentionSignal(seed) || visibleItems.length > 0)
    ) {
      return "recordCompletionHints";
    }

    return null;
  }, [copilotPayload?.recordCompletionHints, seed, visibleItems.length]);

  const handleConfirm = useCallback(
    async (recordId: string) => {
      if (!sourceDraftId) return;
      const result = await persistAdapter.confirmDraft({ sourceDraftId, recordId });
      setRecords(result.records);
      setError(null);
      notifyMutationResult("confirm", result.record);
    },
    [notifyMutationResult, persistAdapter, sourceDraftId]
  );

  const handleDiscard = useCallback(
    async (recordId: string) => {
      if (!sourceDraftId) return;
      const result = await persistAdapter.discardDraft({ sourceDraftId, recordId });
      setRecords(result.records);
      setError(null);
      notifyMutationResult("discard", result.record);
    },
    [notifyMutationResult, persistAdapter, sourceDraftId]
  );

  const handleSaveEdit = useCallback(
    async (
      recordId: string,
      params: { summary: string; structuredFields: Record<string, unknown> }
    ) => {
      if (!sourceDraftId) return;
      const result = await persistAdapter.updateDraft({
        sourceDraftId,
        recordId,
        summary: params.summary,
        structuredFields: params.structuredFields,
      });
      setRecords(result.records);
      setError(null);
      notifyMutationResult("edit", result.record);
    },
    [notifyMutationResult, persistAdapter, sourceDraftId]
  );

  if (!sourceDraftId || !seed) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">演示理解结果</Badge>
            {childName ? <Badge variant="secondary">{childName}</Badge> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            当前还没有可确认的教师草稿。可以先用下面的演示话术生成一条本地草稿，用来演示确认、编辑与丢弃流程。
          </p>
        </div>

        {mockPresets.length > 0 ? (
          <div className="grid gap-3">
            {mockPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => void onCreateMockDraft?.(preset.transcript)}
                className="rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <WandSparkles className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-slate-900">
                    {preset.label}
                  </span>
                  {preset.hint ? <Badge variant="info">{preset.hint}</Badge> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {preset.transcript}
                </p>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {sourceModeLabel ? <Badge variant="info">{sourceModeLabel}</Badge> : null}
          {sourceDraftLabel ? <Badge variant="secondary">{sourceDraftLabel}</Badge> : null}
          {sourceSyncStatusLabel ? (
            <Badge variant="outline">{sourceSyncStatusLabel}</Badge>
          ) : null}
          <Badge variant="warning">草稿项 {seed.draft_items.length}</Badge>
          {seed.router_result?.primary_category ? (
            <Badge variant="secondary">
              {seed.router_result.primary_category}
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                <FileText className="h-4 w-4" />
                原始内容
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {sourceTranscript ?? seed.transcript}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">保存方式</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                当前会先写回同一条教师草稿，再尝试同步保存；无论成功、仅本地保留还是保存失败，页面都会明确提示。
              </p>
            </div>
        </div>

        {seed.warnings.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {seed.warnings.map((warning) => (
              <span
                key={warning}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {warning}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <TeacherCopilotPanel
        payload={copilotPayload}
        defaultOpenSection={defaultOpenSection}
        sectionOrder={["recordCompletionHints", "microTrainingSOP"]}
      />

      {error ? (
        <div className="rounded-3xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-3xl border border-slate-100 bg-white px-4 py-4 text-sm text-slate-500">
          草稿确认流正在加载记录...
        </div>
      ) : (
        <DraftRecordList
          items={visibleItems}
          discardedCount={discardedCount}
          initialExpandedRecordId={initialExpandedRecordId}
          onConfirm={handleConfirm}
          onDiscard={handleDiscard}
          onSaveEdit={handleSaveEdit}
        />
      )}
    </div>
  );
}
