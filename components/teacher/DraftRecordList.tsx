"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import DraftRecordCard from "@/components/teacher/DraftRecordCard";
import type { TeacherDraftUiItem } from "@/lib/mobile/teacher-draft-records";

export default function DraftRecordList({
  items,
  discardedCount = 0,
  initialExpandedRecordId,
  onConfirm,
  onDiscard,
  onSaveEdit,
}: {
  items: TeacherDraftUiItem[];
  discardedCount?: number;
  initialExpandedRecordId?: string;
  onConfirm: (recordId: string) => void | Promise<void>;
  onDiscard: (recordId: string) => void | Promise<void>;
  onSaveEdit: (
    recordId: string,
    params: { summary: string; structuredFields: Record<string, unknown> }
  ) => void | Promise<void>;
}) {
  const [manualExpandedRecordId, setManualExpandedRecordId] = useState<string | null>(
    initialExpandedRecordId ?? items[0]?.id ?? null
  );
  const expandedRecordId = useMemo(() => {
    const availableIds = new Set(items.map((item) => item.id));

    if (manualExpandedRecordId && availableIds.has(manualExpandedRecordId)) {
      return manualExpandedRecordId;
    }

    if (initialExpandedRecordId && availableIds.has(initialExpandedRecordId)) {
      return initialExpandedRecordId;
    }

    return items[0]?.id ?? null;
  }, [initialExpandedRecordId, items, manualExpandedRecordId]);

  const counts = useMemo(() => {
    const pending = items.filter((item) => item.status === "pending").length;
    const confirmed = items.filter((item) => item.status === "confirmed").length;

    return {
      total: items.length,
      pending,
      confirmed,
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <Card
        surface="glass"
        glow="soft"
        interactive={false}
        className="border-dashed border-[rgba(164,168,255,0.16)] bg-[linear-gradient(180deg,rgba(13,17,39,0.82),rgba(9,12,27,0.72))]"
      >
        <CardContent className="p-5 text-sm text-slate-500">
          当前没有可处理的草稿。
          {discardedCount > 0
            ? ` 已软隐藏 ${discardedCount} 条已丢弃记录，source draft 仍然保留。`
            : ""}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        surface="glass"
        glow="soft"
        interactive={false}
        className="border-[rgba(164,168,255,0.16)] bg-[linear-gradient(180deg,rgba(16,19,44,0.88),rgba(9,11,28,0.8))]"
      >
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Badge variant="secondary">共 {counts.total} 条</Badge>
              <Badge variant="info">待确认 {counts.pending}</Badge>
              <Badge variant="secondary">已确认 {counts.confirmed}</Badge>
          {discardedCount > 0 ? (
            <Badge variant="outline">已软隐藏 {discardedCount} 条已丢弃</Badge>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {items.map((item) => (
          <DraftRecordCard
            key={`${item.id}:${item.updatedAt}`}
            item={item}
            isExpanded={expandedRecordId === item.id}
            onToggleExpand={() =>
              setManualExpandedRecordId((current) =>
                current === item.id ? null : item.id
              )
            }
            onConfirm={() => onConfirm(item.id)}
            onDiscard={() => onDiscard(item.id)}
            onSaveEdit={(params) => onSaveEdit(item.id, params)}
          />
        ))}
      </div>
    </div>
  );
}
