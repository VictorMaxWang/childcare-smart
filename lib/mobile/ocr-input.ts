import type { MobileDraft } from "@/lib/ai/types";
import { createMobileDraft } from "@/lib/mobile/local-draft-cache";

export function buildMockOcrDraft(params: {
  childId: string;
  targetRole: MobileDraft["targetRole"];
  childName: string;
  attachmentName?: string;
}): MobileDraft {
  const content = `${params.childName} OCR 草稿：纸质记录显示近两天需继续观察饮水、睡前情绪和次日晨检状态。`;

  return createMobileDraft({
    childId: params.childId,
    draftType: "ocr",
    targetRole: params.targetRole,
    content,
    attachmentName: params.attachmentName ?? "mock-note.jpg",
    structuredPayload: {
      source: "mock-ocr",
      extractedText: content,
      fields: {
        hydration: "continue-watch",
        emotion: "sleep-transition",
        nextReview: "next-morning",
      },
    },
  });
}

