import { isIntentRouterResult } from "@/lib/ai/intent-router";
import type {
  IntentRouterRequest,
  IntentRouterResult,
} from "@/lib/ai/types";

export type IntentResultPreviewModel = {
  title: string;
  summary: string;
  ctaLabel: string;
  badges: string[];
  href: string;
  workflowLabel: string;
  pageLabel: string;
  deeplinkLabel: string;
  canNavigate: boolean;
};

async function readErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { error?: string; detail?: string } | null;
    return body?.error ?? body?.detail ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function normalizeLabel(value: string | undefined, fallbackLabel: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallbackLabel;
}

export async function fetchIntentRoute(
  payload: IntentRouterRequest,
  options?: { signal?: AbortSignal }
): Promise<IntentRouterResult> {
  const response = await fetch("/api/ai/intent-router", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        "\u7edf\u4e00\u610f\u56fe\u5165\u53e3\u6682\u65f6\u4e0d\u53ef\u7528\u3002"
      )
    );
  }

  const data = (await response.json()) as unknown;
  if (!isIntentRouterResult(data)) {
    throw new Error(
      "\u7edf\u4e00\u610f\u56fe\u5165\u53e3\u8fd4\u56de\u7ed3\u6784\u5f02\u5e38\u3002"
    );
  }

  return data;
}

export function toIntentResultPreviewModel(result: IntentRouterResult): IntentResultPreviewModel {
  const href = normalizeLabel(result.deeplink || result.targetPage, "/");
  const badges = result.previewCard.badges.filter((badge) => badge.trim().length > 0);
  const canNavigate = result.intent !== "unknown" && href !== "/";

  return {
    title: normalizeLabel(
      result.previewCard.title,
      "\u52a9\u624b\u63a8\u8350\u5165\u53e3"
    ),
    summary: normalizeLabel(
      result.previewCard.summary,
      "\u7cfb\u7edf\u5df2\u4e3a\u5f53\u524d\u95ee\u53e5\u5339\u914d\u4e00\u4e2a\u6700\u63a5\u8fd1\u7684 workflow\u3002"
    ),
    ctaLabel: normalizeLabel(
      result.previewCard.ctaLabel,
      "\u6253\u5f00\u5165\u53e3"
    ),
    badges,
    href,
    workflowLabel: normalizeLabel(
      result.targetWorkflow,
      "\u5f85\u4eba\u5de5\u786e\u8ba4"
    ),
    pageLabel: normalizeLabel(
      result.targetPage,
      "\u672a\u5339\u914d\u9875\u9762"
    ),
    deeplinkLabel: normalizeLabel(
      result.deeplink,
      "\u672a\u751f\u6210 deeplink"
    ),
    canNavigate,
  };
}
