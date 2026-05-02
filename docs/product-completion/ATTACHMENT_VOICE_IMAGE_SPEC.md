# Attachment, Voice, And Image Spec

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

