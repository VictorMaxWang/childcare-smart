"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Download, FileText, ImageIcon, Mic, Paperclip, Square, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiAttachment, AttachmentKind } from "@/lib/api/types";
import { useVoiceRecorder } from "@/lib/mobile/use-voice-recorder";
import { cn } from "@/lib/utils";

export interface AttachmentDraft {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  localPreviewUrl: string;
  durationMs?: number;
}

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 3;

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferKind(file: Pick<File, "type" | "name">): AttachmentKind {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) return "pdf";
  return "other";
}

function formatBytes(size?: number) {
  if (!size) return "0 KB";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatDuration(durationMs?: number) {
  if (!durationMs) return "";
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `${seconds}s`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

async function fileToDraft(file: File, durationMs?: number): Promise<AttachmentDraft> {
  return {
    id: createId("draft-att"),
    kind: inferKind(file),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
    localPreviewUrl: await fileToDataUrl(file),
    durationMs,
  };
}

function isSavedAttachment(item: ApiAttachment | AttachmentDraft): item is ApiAttachment {
  return "attachmentId" in item;
}

function itemKey(item: ApiAttachment | AttachmentDraft) {
  return isSavedAttachment(item) ? item.attachmentId : item.id;
}

function itemUrl(item: ApiAttachment | AttachmentDraft) {
  return isSavedAttachment(item)
    ? item.downloadUrl ?? item.storageObject?.localPreviewUrl ?? item.localPreviewUrl
    : item.localPreviewUrl;
}

function savedAttachmentStorageLabel(item: ApiAttachment) {
  const mode = item.storageObject?.storageMode ?? item.storageMode;
  if (mode === "local_demo" || mode === "cached_media") return "本地演示预览";
  if (item.metadataOnly || mode === "metadata_only") return "仅保存元数据，待接入对象存储";
  return "待接入对象存储";
}

export function AttachmentPreviewList({
  items,
  compact = false,
}: {
  items: Array<ApiAttachment | AttachmentDraft>;
  compact?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
      {items.map((item) => {
        const url = itemUrl(item);
        return (
          <div key={itemKey(item)} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            {item.kind === "image" && url ? (
              <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-100">
                <Image src={url} alt={item.fileName} width={320} height={160} unoptimized className="h-28 w-full object-cover" />
              </a>
            ) : item.kind === "audio" && url ? (
              <audio controls src={url} className="w-full" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                <FileText className="h-6 w-6" />
              </div>
            )}
            <div className="mt-3 min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{item.fileName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {item.kind} · {formatBytes(item.byteSize)}
                {item.kind === "audio" && item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ""}
              </p>
              {isSavedAttachment(item) ? (
                <p className="mt-1 text-xs text-slate-400">{savedAttachmentStorageLabel(item)}</p>
              ) : null}
              {url ? (
                <div className="mt-2 flex gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
                  >
                    <Paperclip className="h-3 w-3" />
                    本地演示预览
                  </a>
                  <a
                    href={isSavedAttachment(item) ? `${url}?download=1` : url}
                    download={item.fileName}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600"
                  >
                    <Download className="h-3 w-3" />
                    保存本地副本
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AttachmentMediaPicker({
  value,
  onChange,
  accept,
  enableVoice = true,
  disabled = false,
  maxFiles = ATTACHMENT_MAX_FILES,
  maxBytes = ATTACHMENT_MAX_BYTES,
}: {
  value: AttachmentDraft[];
  onChange: (next: AttachmentDraft[]) => void;
  accept?: string;
  enableVoice?: boolean;
  disabled?: boolean;
  maxFiles?: number;
  maxBytes?: number;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const recorder = useVoiceRecorder();
  const [message, setMessage] = useState<string | null>(null);
  const remainingCount = Math.max(0, maxFiles - value.length);
  const canRecord = enableVoice && recorder.supportState === "supported";
  const canPickMore = !disabled && remainingCount > 0;
  const summary = useMemo(() => `${value.length}/${maxFiles} · 单文件 ${Math.round(maxBytes / 1024 / 1024)}MB`, [maxBytes, maxFiles, value.length]);

  async function appendFiles(files: FileList | File[] | null, durationMs?: number) {
    if (!files || disabled) return;
    const nextFiles = Array.from(files).slice(0, remainingCount);
    if (nextFiles.length === 0) {
      setMessage(`最多选择 ${maxFiles} 个附件。`);
      return;
    }
    const oversize = nextFiles.find((file) => file.size > maxBytes);
    if (oversize) {
      setMessage(`${oversize.name} 超过 ${Math.round(maxBytes / 1024 / 1024)}MB，未保存。`);
      return;
    }
    try {
      const drafts = await Promise.all(nextFiles.map((file) => fileToDraft(file, durationMs)));
      onChange([...value, ...drafts]);
      setMessage(null);
    } catch {
      setMessage("读取附件失败，请重新选择。");
    }
  }

  async function handleRecordClick() {
    if (!canRecord) {
      audioInputRef.current?.click();
      return;
    }
    if (!recorder.isRecording) {
      try {
        await recorder.startRecording("feedback-voice");
        setMessage(null);
      } catch {
        setMessage("当前浏览器无法开始录音，请改用音频文件。");
      }
      return;
    }
    const result = await recorder.stopRecording();
    if (!result) {
      setMessage("未生成有效录音。");
      return;
    }
    await appendFiles([result.file], result.durationMs);
  }

  return (
    <div data-testid="attachment-media-picker" className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : null;
          void appendFiles(files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        className="hidden"
        accept="audio/*"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : null;
          void appendFiles(files);
          event.currentTarget.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={!canPickMore}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          选择附件
        </Button>
        <Button
          type="button"
          variant={recorder.isRecording ? "destructive" : "outline"}
          className="rounded-full"
          disabled={disabled || remainingCount === 0}
          onClick={() => void handleRecordClick()}
        >
          {recorder.isRecording ? <Square className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
          {recorder.isRecording ? "停止录音" : canRecord ? "录音" : "上传音频"}
        </Button>
        <span className="text-xs font-medium text-slate-500">{summary}</span>
      </div>

      {recorder.isRecording ? (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          正在录音 {formatDuration(recorder.durationMs)}
        </p>
      ) : null}
      {message ? <p className="text-sm text-amber-600">{message}</p> : null}
      {recorder.supportState === "unsupported" && enableVoice ? (
        <p className="text-xs text-slate-500">当前浏览器不支持 MediaRecorder，已提供音频文件上传 fallback。</p>
      ) : null}

      {value.length > 0 ? (
        <div className="space-y-3">
          <AttachmentPreviewList items={value} />
          <div className="flex flex-wrap gap-2">
            {value.map((item) => (
              <button
                key={item.id}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
                onClick={() => onChange(value.filter((candidate) => candidate.id !== item.id))}
              >
                {item.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                移除 {item.fileName}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
