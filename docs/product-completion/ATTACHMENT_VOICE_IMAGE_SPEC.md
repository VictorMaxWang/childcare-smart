# Attachment, Voice, And Image Spec

## 2026-05-02 E04 Implemented Rules

- Attachments for parent feedback, parent messages, and teacher replies use the E01 `/api/attachments` API and `AppDataService`; no second attachment store is introduced.
- Client and server both enforce a 5MB single-file limit. The picker allows at most 3 files per send; the service also rejects more than 3 attachments for the same related object.
- Image attachments use `kind: "image"` and show thumbnails. Audio attachments use `kind: "audio"` and render `<audio controls>`.
- `MediaRecorder` is used when available. Browsers without recorder support show the audio file upload fallback.
- Saved attachments expose `downloadUrl: /api/attachments/[attachmentId]/content`; that content route calls `getAttachment()` first so detail/content access is scoped.
- Storage remains `metadata_only`. In the demo implementation, `localPreviewUrl` may be a data URL so preview/playback survives refresh without claiming cloud upload.
- `relatedType: "storybook"` is accepted for media metadata and child scope validation as E04 base capability; full storybook export/share media packaging remains outside E04.

## MVP Boundary

附件/语音/图片 MVP 先实现真实选择、预览、元数据保存和读取；如果没有真实二进制存储，不上传大文件，也不显示“已上传到云端”。

## Attachment Metadata

```ts
interface AttachmentRecord {
  attachmentId: string;
  institutionId: string;
  childId?: string;
  ownerType: "feedback" | "message" | "healthMaterial" | "storybook";
  ownerId: string;
  kind: "image" | "audio" | "pdf" | "other";
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  localPreviewUrl?: string;
  storageStatus: "metadata_only" | "stored" | "failed";
  providerStatus?: "mock" | "fallback" | "real";
  createdBy: string;
  createdAt: string;
}
```

## Product Rules

- 家长反馈附件在未接入真实存储前可继续 disabled，但不能 fake-success。
- 教师健康材料可保存文件元数据和预览文本。
- 语音消息必须提供文本 fallback。
- 图片/语音写入正式记录前必须确认。
