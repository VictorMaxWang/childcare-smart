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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeStorybookScene(value: unknown, index: number, childName: string): ParentStoryBookScene {
  const record = isRecord(value) ? value : {};
  const title = readString(record.sceneTitle) || readString(record.title) || `Saved story page ${index + 1}`;
  const text =
    readString(record.sceneText) ||
    readString(record.text) ||
    `${childName} has a saved storybook page.`;

  return {
    ...(record as Partial<ParentStoryBookScene>),
    sceneIndex: readNumber(record.sceneIndex) ?? index + 1,
    sceneTitle: title,
    sceneText: text,
    imagePrompt: readString(record.imagePrompt) || `${childName} saved storybook page ${index + 1}`,
    imageUrl: readString(record.imageUrl) || null,
    assetRef: readString(record.assetRef) || null,
    imageSourceKind: (readString(record.imageSourceKind) || "svg-fallback") as ParentStoryBookScene["imageSourceKind"],
    imageStatus: (readString(record.imageStatus) || "fallback") as ParentStoryBookScene["imageStatus"],
    audioUrl: readString(record.audioUrl) || null,
    audioRef: readString(record.audioRef) || null,
    audioScript: readString(record.audioScript) || text,
    audioStatus: (readString(record.audioStatus) || "fallback") as ParentStoryBookScene["audioStatus"],
    voiceStyle: readString(record.voiceStyle) || "gentle parent narration",
    highlightSource: readString(record.highlightSource) || "saved-storybook",
  };
}

function normalizeEmbeddedStorybookResponse(
  response: ParentStoryBookResponse,
  storybook: DemoStorybook,
  childName: string
): ParentStoryBookResponse {
  const scenes = response.scenes.length
    ? response.scenes.map((scene, index) => normalizeStorybookScene(scene, index, childName))
    : [normalizeStorybookScene(null, 0, childName)];
  const providerMeta: Record<string, unknown> = isRecord(response.providerMeta) ? response.providerMeta : {};
  const sceneCount = scenes.length;
  const highlightCount = Math.max(storybook.sourceRecordIds.length, sceneCount);

  return {
    ...response,
    mode: response.mode === "card" ? "card" : "storybook",
    summary: readString(response.summary) || "Stored local storybook.",
    moral: readString(response.moral) || "Record real growth and review it gently.",
    parentNote:
      readString(response.parentNote) ||
      "This MVP storybook uses local export and local share text only.",
    source: (readString(response.source) || "rule") as ParentStoryBookResponse["source"],
    fallback: response.fallback ?? true,
    fallbackReason: response.fallbackReason ?? "stored-storybook",
    generatedAt: readString(response.generatedAt) || storybook.generatedAt,
    stylePreset: (readString(response.stylePreset) || "sunrise-watercolor") as ParentStoryBookResponse["stylePreset"],
    providerMeta: {
      provider: readString(providerMeta.provider) || "d01-demo-store",
      mode: readString(providerMeta.mode) || "saved-storybook",
      transport: (readString(providerMeta.transport) || "next-json-fallback") as ParentStoryBookResponse["providerMeta"]["transport"],
      imageProvider: readString(providerMeta.imageProvider) || "d01-demo-store",
      audioProvider: readString(providerMeta.audioProvider) || "browser-preview",
      imageDelivery: (readString(providerMeta.imageDelivery) || "svg-fallback") as ParentStoryBookResponse["providerMeta"]["imageDelivery"],
      audioDelivery: (readString(providerMeta.audioDelivery) || "preview-only") as ParentStoryBookResponse["providerMeta"]["audioDelivery"],
      stylePreset: (readString(providerMeta.stylePreset) || readString(response.stylePreset) || "sunrise-watercolor") as ParentStoryBookResponse["providerMeta"]["stylePreset"],
      requestSource: readString(providerMeta.requestSource) || "stored-storybook",
      fallbackReason: readString(providerMeta.fallbackReason) || "stored-storybook",
      realProvider: providerMeta.realProvider === true,
      highlightCount: readNumber(providerMeta.highlightCount) ?? highlightCount,
      sceneCount: readNumber(providerMeta.sceneCount) ?? sceneCount,
    },
    scenes,
  };
}

export function restoreParentStorybookResponse(
  storybook: DemoStorybook,
  childName = "孩子"
): ParentStoryBookResponse {
  const embeddedResponse = storybook.pages
    .map((page) => (isRecord(page) ? page.response : null))
    .find(isParentStoryBookResponse);

  if (embeddedResponse) {
    return normalizeEmbeddedStorybookResponse(embeddedResponse, storybook, childName);
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
