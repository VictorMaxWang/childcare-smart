import type { ApiAttachment, AttachmentKind, AttachmentRelatedType } from "@/lib/api/types";
import {
  createAttachment,
  uploadAttachmentFile,
  type ApiCreateAttachmentInput,
} from "@/lib/api/communication";

export interface PersistableAttachmentDraft {
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  localPreviewUrl: string;
  file?: File;
  durationMs?: number;
}

interface AttachmentPersistenceDependencies {
  createMetadata: (
    input: ApiCreateAttachmentInput
  ) => Promise<ApiAttachment>;
  uploadFile: typeof uploadAttachmentFile;
}

const defaultDependencies: AttachmentPersistenceDependencies = {
  createMetadata: (input) => createAttachment(input),
  uploadFile: (input) => uploadAttachmentFile(input),
};

/**
 * 普通账号必须保存真实二进制文件；只有显式演示账号可以使用 data URL 预览，
 * 避免把临时浏览器预览误报成已持久化附件。
 */
export async function persistAttachmentDrafts(
  input: {
    drafts: PersistableAttachmentDraft[];
    accountKind: "demo" | "normal";
    childId: string;
    relatedType: AttachmentRelatedType;
    relatedId: string;
    existingAttachments?: ApiAttachment[];
  },
  dependencies: AttachmentPersistenceDependencies = defaultDependencies
) {
  const saved: ApiAttachment[] = [];
  const existingCounts = new Map<string, number>();
  for (const attachment of input.existingAttachments ?? []) {
    const signature = [
      attachment.fileName,
      attachment.mimeType,
      attachment.byteSize ?? 0,
    ].join("\u0000");
    existingCounts.set(signature, (existingCounts.get(signature) ?? 0) + 1);
  }
  for (const draft of input.drafts) {
    const signature = [
      draft.fileName,
      draft.mimeType,
      draft.byteSize,
    ].join("\u0000");
    const existingCount = existingCounts.get(signature) ?? 0;
    if (existingCount > 0) {
      existingCounts.set(signature, existingCount - 1);
      continue;
    }
    if (input.accountKind === "normal") {
      if (!draft.file) {
        throw new Error(`${draft.fileName} 缺少原始文件，请重新选择后上传。`);
      }
      saved.push(
        await dependencies.uploadFile({
          file: draft.file,
          childId: input.childId,
          relatedType: input.relatedType,
          relatedId: input.relatedId,
        })
      );
      continue;
    }
    saved.push(
      await dependencies.createMetadata({
        childId: input.childId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        kind: draft.kind,
        fileName: draft.fileName,
        mimeType: draft.mimeType,
        byteSize: draft.byteSize,
        localPreviewUrl: draft.localPreviewUrl,
        durationMs: draft.durationMs,
      })
    );
  }
  return saved;
}
