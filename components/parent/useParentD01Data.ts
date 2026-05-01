"use client";

import { useMemo } from "react";
import type { ParentStoryBookResponse, ParentStoryBookScene } from "@/lib/ai/types";
import { getCurrentDemoContext } from "@/lib/demo-data/persistence";
import { getParentHomeData } from "@/lib/demo-data/selectors";
import { getScopedSnapshot } from "@/lib/demo-data/store";
import type { ParentHomeData } from "@/lib/demo-data/types";
import type { DemoStorybook } from "@/lib/persistence/snapshot";
import { useApp } from "@/lib/store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isParentStoryBookResponse(value: unknown): value is ParentStoryBookResponse {
  return (
    isRecord(value) &&
    typeof value.storyId === "string" &&
    typeof value.childId === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.scenes)
  );
}

export function restoreParentStorybookResponse(
  storybook: DemoStorybook,
  childName = "孩子"
): ParentStoryBookResponse {
  const embeddedResponse = storybook.pages
    .map((page) => (isRecord(page) ? page.response : null))
    .find(isParentStoryBookResponse);

  if (embeddedResponse) {
    return embeddedResponse;
  }

  const scenes: ParentStoryBookScene[] = storybook.pages.map((page, index) => {
    const record = isRecord(page) ? page : {};
    const title = typeof record.title === "string" ? record.title : `成长瞬间 ${index + 1}`;
    const text =
      typeof record.sceneText === "string"
        ? record.sceneText
        : `${childName} 的这一页来自已保存的成长记录，刷新后会继续保留在本地演示档案中。`;

    return {
      sceneIndex: index,
      sceneTitle: title,
      sceneText: text,
      imagePrompt: `${childName} saved growth story page ${index + 1}`,
      imageUrl: null,
      imageSourceKind: "svg-fallback",
      imageStatus: "fallback",
      audioUrl: null,
      audioScript: text,
      audioStatus: "fallback",
      voiceStyle: "gentle parent narration",
      highlightSource:
        typeof record.sourceRecordId === "string" ? record.sourceRecordId : "D01 saved growth record",
    };
  });

  const safeScenes: ParentStoryBookScene[] =
    scenes.length > 0
      ? scenes
      : [
          {
            sceneIndex: 0,
            sceneTitle: "本地演示成长绘本",
            sceneText: `${childName} 还没有可生成绘本的成长记录，当前显示的是本地演示空状态。`,
            imagePrompt: `${childName} local demo storybook empty state`,
            imageUrl: null,
            imageSourceKind: "svg-fallback",
            imageStatus: "fallback",
            audioUrl: null,
            audioScript: `${childName} 还没有可生成绘本的成长记录。`,
            audioStatus: "fallback",
            voiceStyle: "gentle parent narration",
            highlightSource: "D01 empty storybook",
          },
        ];

  return {
    storyId: storybook.storybookId,
    childId: storybook.childId,
    mode: "storybook",
    title: `${childName} 的成长绘本`,
    summary: "来自 D01 本地演示持久化的已保存绘本。",
    moral: "记录真实成长，再温柔地回看。",
    parentNote: "这是已保存的本地演示绘本，刷新后会继续存在。",
    source: "rule",
    fallback: true,
    fallbackReason: "d01-saved-storybook",
    generatedAt: storybook.generatedAt,
    stylePreset: "sunrise-watercolor",
    providerMeta: {
      provider: "d01-demo-store",
      mode: "saved-storybook",
      transport: "next-json-fallback",
      imageProvider: "d01-demo-store",
      audioProvider: "browser-preview",
      imageDelivery: "svg-fallback",
      audioDelivery: "preview-only",
      requestSource: "d01-storybook-store",
      fallbackReason: "d01-saved-storybook",
      realProvider: false,
      highlightCount: Math.max(storybook.sourceRecordIds.length, safeScenes.length),
      sceneCount: safeScenes.length,
    },
    scenes: safeScenes,
  };
}

export function useParentD01Data(requestedChildId?: string | null) {
  const app = useApp();
  const { currentUser, visibleChildren } = app;

  const context = useMemo(() => getCurrentDemoContext(currentUser), [currentUser]);
  const scopedSnapshot = getScopedSnapshot(context);

  const authorizedChildren = useMemo(() => {
    const scopedIds = new Set(scopedSnapshot.children.map((child) => child.id));
    return visibleChildren.filter((child) => scopedIds.has(child.id));
  }, [scopedSnapshot.children, visibleChildren]);

  const authorizedChildIds = useMemo(
    () => new Set(authorizedChildren.map((child) => child.id)),
    [authorizedChildren]
  );

  const invalidChildId = Boolean(requestedChildId && !authorizedChildIds.has(requestedChildId));
  const selectedChildId =
    requestedChildId && authorizedChildIds.has(requestedChildId)
      ? requestedChildId
      : invalidChildId
        ? ""
        : authorizedChildren[0]?.id ?? "";

  const selectedChild = authorizedChildren.find((child) => child.id === selectedChildId) ?? null;
  const parentHomeData: ParentHomeData | null =
    selectedChildId && !invalidChildId ? getParentHomeData(selectedChildId, context) : null;

  return {
    ...app,
    context,
    scopedSnapshot,
    authorizedChildren,
    authorizedChildIds,
    selectedChildId,
    selectedChild,
    invalidChildId,
    parentHomeData,
  };
}
