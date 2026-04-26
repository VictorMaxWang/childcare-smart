"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  PencilLine,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TeacherDraftUiItem } from "@/lib/mobile/teacher-draft-records";

type EditableFieldKind = "text" | "number" | "boolean";

interface EditableFieldConfig {
  key: string;
  label: string;
  kind: EditableFieldKind;
}

const BOOLEAN_UNSET_VALUE = "__unset__";

const CATEGORY_LABELS: Record<TeacherDraftUiItem["category"], string> = {
  DIET: "饮食 / DIET",
  EMOTION: "情绪 / EMOTION",
  HEALTH: "健康 / HEALTH",
  SLEEP: "睡眠 / SLEEP",
  LEAVE: "请假 / LEAVE",
};

const EDITABLE_FIELDS: Record<
  TeacherDraftUiItem["category"],
  EditableFieldConfig[]
> = {
  DIET: [
    { key: "meal_period", label: "餐段", kind: "text" },
    { key: "appetite", label: "食欲", kind: "text" },
    { key: "hydration", label: "饮水", kind: "text" },
  ],
  EMOTION: [
    { key: "mood", label: "情绪状态", kind: "text" },
    { key: "trigger", label: "触发场景", kind: "text" },
    { key: "soothing_status", label: "安抚结果", kind: "text" },
  ],
  HEALTH: [
    { key: "temperature_c", label: "体温", kind: "number" },
    { key: "severity_hint", label: "严重程度", kind: "text" },
    { key: "follow_up_needed", label: "需要复查", kind: "boolean" },
  ],
  SLEEP: [
    { key: "sleep_phase", label: "睡眠阶段", kind: "text" },
    { key: "sleep_duration_min", label: "时长(分钟)", kind: "number" },
    { key: "sleep_quality", label: "睡眠质量", kind: "text" },
  ],
  LEAVE: [
    { key: "leave_type", label: "类型", kind: "text" },
    { key: "time_range", label: "时间范围", kind: "text" },
    { key: "reason", label: "原因", kind: "text" },
  ],
};

const FIELD_LABELS: Record<string, string> = {
  meal_period: "餐段",
  appetite: "食欲",
  hydration: "饮水",
  mood: "情绪状态",
  trigger: "触发场景",
  soothing_status: "安抚结果",
  temperature_c: "体温",
  severity_hint: "严重程度",
  follow_up_needed: "需要复查",
  sleep_phase: "睡眠阶段",
  sleep_duration_min: "时长(分钟)",
  sleep_quality: "睡眠质量",
  leave_type: "请假类型",
  time_range: "时间范围",
  reason: "原因",
};

const STATUS_LABELS: Record<TeacherDraftUiItem["status"], string> = {
  pending: "待确认",
  confirmed: "已确认",
  discarded: "已丢弃",
};

const STATUS_VARIANTS: Record<
  TeacherDraftUiItem["status"],
  "warning" | "success" | "secondary"
> = {
  pending: "warning",
  confirmed: "success",
  discarded: "secondary",
};

function getPrimaryStatusBadge(item: TeacherDraftUiItem) {
  if (item.status === "confirmed" && item.persistStatus === "saved") {
    return { label: "已确认并保存", variant: "success" as const };
  }

  if (item.status === "confirmed" && item.persistStatus === "local_only") {
    return { label: "已确认（暂存本地）", variant: "warning" as const };
  }

  return {
    label: STATUS_LABELS[item.status],
    variant: STATUS_VARIANTS[item.status],
  };
}

function getMetaBadges(item: TeacherDraftUiItem) {
  const badges: Array<{
    label: string;
    variant: "warning" | "secondary" | "info" | "success";
  }> = [];

  if (item.status === "discarded") {
    badges.push({ label: "软删除 / 已隐藏", variant: "secondary" });
    return badges;
  }

  if (item.persistStatus === "failed") {
    badges.push({ label: "保存失败（已保留本地）", variant: "warning" });
  }

  if (item.lastAction === "edit" && item.persistStatus === "saved") {
    badges.push({ label: "编辑已保存", variant: "info" });
  }

  if (item.lastAction === "edit" && item.persistStatus === "local_only") {
    badges.push({ label: "编辑仅本地保存", variant: "warning" });
  }

  return badges;
}

function formatFieldLabel(key: string) {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "未填写";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) =>
        typeof item === "string" || typeof item === "number" ? String(item) : ""
      )
      .filter(Boolean);
    return items.length > 0 ? items.join("、") : "未填写";
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${formatFieldLabel(key)}: ${formatFieldValue(item)}`)
      .filter(Boolean);
    return entries.length > 0 ? entries.join("；") : "未填写";
  }

  return String(value);
}

function toEditableFormValue(value: unknown, kind: EditableFieldKind) {
  if (value === null || value === undefined || value === "") {
    return kind === "boolean" ? BOOLEAN_UNSET_VALUE : "";
  }

  if (kind === "boolean") {
    return value === true ? "true" : value === false ? "false" : BOOLEAN_UNSET_VALUE;
  }

  return String(value);
}

function parseEditableFormValue(value: string, kind: EditableFieldKind) {
  if (!value.trim() || value === BOOLEAN_UNSET_VALUE) {
    return null;
  }

  if (kind === "number") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  if (kind === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  }

  return value.trim();
}

export default function DraftRecordCard({
  item,
  isExpanded,
  onToggleExpand,
  onConfirm,
  onDiscard,
  onSaveEdit,
}: {
  item: TeacherDraftUiItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
  onSaveEdit: (params: {
    summary: string;
    structuredFields: Record<string, unknown>;
  }) => void;
}) {
  const editableFields = useMemo(() => EDITABLE_FIELDS[item.category], [item.category]);
  const initialFieldValues = useMemo(
    () =>
      Object.fromEntries(
        editableFields.map((field) => [
          field.key,
          toEditableFormValue(item.structuredFields[field.key], field.kind),
        ])
      ),
    [editableFields, item.structuredFields]
  );
  const [draftSummary, setDraftSummary] = useState(() => item.summary);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    () => initialFieldValues
  );

  const displayStructuredEntries = useMemo(
    () =>
      Object.entries(item.structuredFields).filter(([, value]) => {
        if (value === null || value === undefined || value === "") {
          return false;
        }

        if (Array.isArray(value)) {
          return value.length > 0;
        }

        if (typeof value === "object") {
          return Object.keys(value as Record<string, unknown>).length > 0;
        }

        return true;
      }),
    [item.structuredFields]
  );

  const handleSave = () => {
    const nextStructuredFields = { ...item.structuredFields };

    editableFields.forEach((field) => {
      nextStructuredFields[field.key] = parseEditableFormValue(
        fieldValues[field.key] ?? "",
        field.kind
      );
    });

    onSaveEdit({
      summary: draftSummary.trim() || item.summary,
      structuredFields: nextStructuredFields,
    });
  };

  const primaryStatusBadge = getPrimaryStatusBadge(item);
  const metaBadges = getMetaBadges(item);

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">
              {item.childName ?? "未识别幼儿"}
            </p>
            <Badge variant="info">{CATEGORY_LABELS[item.category]}</Badge>
            <Badge variant={primaryStatusBadge.variant}>{primaryStatusBadge.label}</Badge>
            {metaBadges.map((badge) => (
              <Badge key={badge.label} variant={badge.variant}>
                {badge.label}
              </Badge>
            ))}
            <Badge variant="secondary">
              置信度 {Math.round(item.confidence * 100)}%
            </Badge>
            {item.isEdited ? <Badge variant="warning">已编辑</Badge> : null}
          </div>
          <p className="text-sm leading-6 text-slate-700">{item.summary}</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="min-h-10 rounded-full px-3"
          onClick={onToggleExpand}
        >
          <ChevronDown
            className={`mr-2 h-4 w-4 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
          {isExpanded ? "收起编辑" : "展开编辑"}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {displayStructuredEntries.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {displayStructuredEntries.map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {formatFieldLabel(key)}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {formatFieldValue(value)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">
            当前没有可展示的结构化字段。
          </div>
        )}

        {item.warnings.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {item.warnings.map((warning) => (
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

      {isExpanded ? (
        <div className="mt-4 space-y-4 rounded-3xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">编辑摘要</p>
            <Textarea
              value={draftSummary}
              onChange={(event) => setDraftSummary(event.target.value)}
              className="mt-2 min-h-24 rounded-2xl bg-white"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">轻量编辑字段</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {editableFields.map((field) => (
                <div key={field.key}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {field.label}
                  </p>
                  {field.kind === "boolean" ? (
                    <Select
                      value={fieldValues[field.key] ?? BOOLEAN_UNSET_VALUE}
                      onValueChange={(value) =>
                        setFieldValues((current) => ({ ...current, [field.key]: value }))
                      }
                    >
                      <SelectTrigger className="rounded-2xl bg-white">
                        <SelectValue placeholder="未设置" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">是</SelectItem>
                        <SelectItem value="false">否</SelectItem>
                        <SelectItem value={BOOLEAN_UNSET_VALUE}>未设置</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.kind === "number" ? "number" : "text"}
                      value={fieldValues[field.key] ?? ""}
                      onChange={(event) =>
                        setFieldValues((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="rounded-2xl bg-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {item.suggestedActions.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">建议动作</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                {item.suggestedActions.map((action) => (
                  <li key={action}>- {action}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
              Raw Excerpt
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.rawExcerpt}</p>
          </div>

          {item.persistMessage ? (
            <div className="rounded-2xl border border-white/80 bg-white/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                Persist Result
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.persistMessage}
                {item.persistError ? ` (${item.persistError})` : ""}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="rounded-full"
              onClick={handleSave}
            >
              <PencilLine className="mr-2 h-4 w-4" />
              保存编辑
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="premium"
          className="rounded-full"
          onClick={onConfirm}
          disabled={item.status === "confirmed" || item.status === "discarded"}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          确认
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={onToggleExpand}
          disabled={item.status === "discarded"}
        >
          <PencilLine className="mr-2 h-4 w-4" />
          编辑
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={onDiscard}
          disabled={item.status === "discarded" || item.status === "confirmed"}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          丢弃
        </Button>
      </div>
    </div>
  );
}
