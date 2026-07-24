"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import StoryBookViewer from "@/components/parent/StoryBookViewer";
import { restoreParentStorybookResponse, useParentD01Data } from "@/components/parent/useParentD01Data";
import {
  exportStorybook,
  shareStorybook,
  upsertStorybook as upsertApiStorybook,
} from "@/lib/api/storybooks";
import type { StorybookExportFormat } from "@/lib/api/types";
import {
  buildParentStoryBookRequestFromFeed,
  DEFAULT_PARENT_STORYBOOK_GENERATION_MODE,
  DEFAULT_PARENT_STORYBOOK_PAGE_COUNT,
  DEFAULT_PARENT_STORYBOOK_STYLE_PRESET,
  DEFAULT_PARENT_STORYBOOK_STYLE_MODE,
  PARENT_STORYBOOK_THEME_CHIPS,
  resolveParentStoryBookStylePreset,
} from "@/lib/agent/parent-storybook";
import {
  applyParentStoryBookDemoSeed,
  getParentStoryBookDemoSeedPreset,
  resolveParentStoryBookDemoSeedId,
} from "@/lib/agent/parent-storybook-demo-seeds";
import type {
  ParentStoryBookGenerationMode,
  ParentStoryBookMediaStatusRequest,
  ParentStoryBookPageCount,
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookStylePreset,
  ParentStoryBookStyleMode,
} from "@/lib/ai/types";
import {
  buildParentStoryBookCacheKey,
  readParentStoryBookCache,
  shouldPollParentStoryBookMedia,
  shouldBypassParentStoryBookCacheOnFirstLoad,
  type ParentStoryBookClientCacheState,
  writeParentStoryBookCache,
} from "@/lib/parent/storybook-cache";
import { collectStorybookSourceRecordIds } from "@/lib/parent/storybook-provenance";
import {
  LIN_XIAOYU_CHILD_ALIAS,
  LIN_XIAOYU_CHILD_ID,
  LIN_XIAOYU_FEEDBACK_PROMPT,
  LIN_XIAOYU_FIXED_STORYBOOK_EVIDENCE,
  LIN_XIAOYU_FIXED_STORYBOOK_SUBTITLE,
  LIN_XIAOYU_TONIGHT_ACTION,
  buildLinXiaoyuFixedStorybookResponse,
  resolveLinXiaoyuChildId,
} from "@/lib/storybooks/lin-xiaoyu-bravery";

type StoryBookPageStatus = "loading" | "storybook" | "card" | "empty" | "error";

type StoryBookControls = {
  generationMode: ParentStoryBookGenerationMode;
  manualTheme: string;
  pageCount: ParentStoryBookPageCount;
  goalKeywords: string[];
  preset: ParentStoryBookStylePreset;
  styleMode: ParentStoryBookStyleMode;
  customStylePrompt: string;
  customStyleNegativePrompt: string;
};

const PAGE_COUNT_OPTIONS = [4, 5, 6, 8] as const satisfies readonly ParentStoryBookPageCount[];
const MEDIA_POLL_INTERVAL_MS = 2_000;
const MEDIA_POLL_MAX_DELAY_MS = 70_000;
const MEDIA_POLL_MAX_ATTEMPTS = 40;
const STORYBOOK_USER_REQUEST_TIMEOUT_MS = 75_000;
const STORYBOOK_MEDIA_POLL_TIMEOUT_MS = 50_000;
// 线上冷启动需要读取并原子写回机构快照，5 秒会把最终成功的保存误报为失败。
const STORYBOOK_API_SAVE_TIMEOUT_MS = 15_000;

function buildMediaStatusPrioritySceneIndices(
  story: ParentStoryBookResponse,
  activeSceneIndex: number
) {
  const sceneCount = story.scenes.length;
  const candidates = [activeSceneIndex + 1, 1, activeSceneIndex + 2];
  return candidates.filter((sceneIndex, index, list) =>
    sceneIndex >= 1 &&
    sceneIndex <= sceneCount &&
    list.indexOf(sceneIndex) === index
  );
}

function resolveMediaPollDelayMs(story: ParentStoryBookResponse) {
  const imageNextRetryAtMs = story.providerMeta.diagnostics?.image?.nextRetryAtMs;
  const retryAt = Number(imageNextRetryAtMs);
  if (Number.isFinite(retryAt) && retryAt > Date.now()) {
    return Math.min(
      MEDIA_POLL_MAX_DELAY_MS,
      Math.max(MEDIA_POLL_INTERVAL_MS, retryAt - Date.now() + 500)
    );
  }
  return MEDIA_POLL_INTERVAL_MS;
}

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

function buildInitialControls(input: {
  hasChildContext: boolean;
  preset: ParentStoryBookStylePreset;
}): StoryBookControls {
  return {
    generationMode: input.hasChildContext
      ? DEFAULT_PARENT_STORYBOOK_GENERATION_MODE
      : "manual-theme",
    manualTheme: "",
    pageCount: DEFAULT_PARENT_STORYBOOK_PAGE_COUNT,
    goalKeywords: [],
    preset: input.preset,
    styleMode: DEFAULT_PARENT_STORYBOOK_STYLE_MODE,
    customStylePrompt: "",
    customStyleNegativePrompt: "",
  };
}

export default function ParentStoryBookPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawChildFromQuery = searchParams.get("child") ?? undefined;
  const childFromQuery = resolveLinXiaoyuChildId(rawChildFromQuery);
  const presetFromQuery = searchParams.get("preset");
  const explicitDemoSeedId = resolveParentStoryBookDemoSeedId(
    searchParams.get("demoSeed")
  );
  const parentD01 = useParentD01Data(childFromQuery);
  const {
    getParentFeed,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    taskCheckInRecords,
    getChildInterventionCard,
    getLatestConsultationForChild,
    storybooks,
    saveParentStorybook,
  } = parentD01;

  const [status, setStatus] = useState<StoryBookPageStatus>("loading");
  const [story, setStory] = useState<ParentStoryBookResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cacheState, setCacheState] = useState<ParentStoryBookClientCacheState>({
    kind: "none",
  });
  const [storybookActionStatus, setStorybookActionStatus] = useState<string | null>(null);
  const [isStorybookActionPending, setIsStorybookActionPending] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [fixedStorybookReloadToken, setFixedStorybookReloadToken] = useState(0);
  const [hasManualStorybookOverride, setHasManualStorybookOverride] = useState(false);
  const hasManualStorybookOverrideRef = useRef(false);
  const networkOnlyRef = useRef(false);
  const refreshCurrentOnlyRef = useRef(false);
  const backgroundMediaPollRef = useRef(false);
  const activeSceneIndexRef = useRef(0);
  const storyRef = useRef<ParentStoryBookResponse | null>(null);
  const requestRef = useRef<ParentStoryBookRequest | null>(null);
  const lastStoryLoadKeyRef = useRef<string | null>(null);
  const pollAttemptRef = useRef(0);
  const pollingStoryIdRef = useRef<string | null>(null);
  const previousSelectedChildIdRef = useRef<string | undefined>(undefined);
  const manualStorybookGenerationInFlightRef = useRef(false);

  const feeds = getParentFeed();
  const selectedFeed = useMemo(() => {
    if (parentD01.invalidChildId) {
      return undefined;
    }
    if (childFromQuery) {
      return feeds.find((item) => item.child.id === childFromQuery);
    }
    if (parentD01.selectedChildId) {
      return feeds.find((item) => item.child.id === parentD01.selectedChildId) ?? feeds[0];
    }
    return feeds[0];
  }, [childFromQuery, feeds, parentD01.invalidChildId, parentD01.selectedChildId]);
  const hasChildContext = Boolean(selectedFeed);
  const savedStorybooks = useMemo(() => {
    if (!selectedFeed) return [];
    return [
      ...(parentD01.parentHomeData?.storybooks ?? storybooks.filter((item) => item.childId === selectedFeed.child.id)),
    ].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  }, [parentD01.parentHomeData?.storybooks, selectedFeed, storybooks]);
  const latestSavedStorybook = savedStorybooks[0] ?? null;
  const storybookSourceRecordIds = useMemo(() => {
    if (!selectedFeed) return [];
    const childId = selectedFeed.child.id;
    const latestIntervention = getChildInterventionCard(childId);
    const latestConsultation = getLatestConsultationForChild(childId);
    return collectStorybookSourceRecordIds({
      childId,
      healthCheckRecords,
      mealRecords,
      growthRecords,
      guardianFeedbacks,
      taskCheckInRecords,
      interventionId: latestIntervention?.id,
      consultationId: latestConsultation?.consultationId,
    });
  }, [
    getChildInterventionCard,
    getLatestConsultationForChild,
    growthRecords,
    guardianFeedbacks,
    healthCheckRecords,
    mealRecords,
    selectedFeed,
    taskCheckInRecords,
  ]);
  const isLockedLinXiaoyuStorybook =
    !parentD01.invalidChildId && selectedFeed?.child.id === LIN_XIAOYU_CHILD_ID;
  const hasManualStorybookOverrideActive =
    hasManualStorybookOverride || hasManualStorybookOverrideRef.current;
  const isLinXiaoyuFixedStorybookVisible =
    isLockedLinXiaoyuStorybook &&
    (!story || story.storyId === "lin-xiaoyu-one-small-brave-step");

  useEffect(() => {
    const currentChildId = selectedFeed?.child.id;
    if (typeof previousSelectedChildIdRef.current === "undefined") {
      previousSelectedChildIdRef.current = currentChildId;
      return;
    }
    if (previousSelectedChildIdRef.current !== currentChildId) {
      previousSelectedChildIdRef.current = currentChildId;
      hasManualStorybookOverrideRef.current = false;
      setHasManualStorybookOverride(false);
    }
  }, [selectedFeed?.child.id]);

  const resolvedDemoSeedId = explicitDemoSeedId;
  const seededPreset = useMemo(
    () => getParentStoryBookDemoSeedPreset(resolvedDemoSeedId),
    [resolvedDemoSeedId]
  );
  const resolvedPreset = useMemo(
    () =>
      presetFromQuery
        ? resolveParentStoryBookStylePreset(presetFromQuery)
        : resolveParentStoryBookStylePreset(seededPreset),
    [presetFromQuery, seededPreset]
  );

  const [draftControls, setDraftControls] = useState<StoryBookControls>(() =>
    buildInitialControls({
      hasChildContext,
      preset: resolvedPreset,
    })
  );
  const [appliedControls, setAppliedControls] = useState<StoryBookControls>(() =>
    buildInitialControls({
      hasChildContext,
      preset: resolvedPreset,
    })
  );

  useEffect(() => {
    setDraftControls((current) => {
      const nextMode =
        !hasChildContext && current.generationMode !== "manual-theme"
          ? "manual-theme"
          : current.generationMode;
      if (current.preset === resolvedPreset && nextMode === current.generationMode) {
        return current;
      }
      return {
        ...current,
        preset: resolvedPreset,
        generationMode: nextMode,
      };
    });
  }, [hasChildContext, resolvedPreset]);

  useEffect(() => {
    if (parentD01.invalidChildId || rawChildFromQuery || !selectedFeed?.child.id) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("child", selectedFeed.child.id);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [parentD01.invalidChildId, pathname, rawChildFromQuery, router, searchParams, selectedFeed?.child.id]);

  useEffect(() => {
    if (parentD01.invalidChildId) return;
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (selectedFeed?.child.id) {
      url.searchParams.set(
        "child",
        rawChildFromQuery === LIN_XIAOYU_CHILD_ALIAS
          ? LIN_XIAOYU_CHILD_ALIAS
          : selectedFeed.child.id
      );
    } else {
      url.searchParams.delete("child");
    }
    if (draftControls.preset === DEFAULT_PARENT_STORYBOOK_STYLE_PRESET) {
      url.searchParams.delete("preset");
    } else {
      url.searchParams.set("preset", draftControls.preset);
    }
    if (resolvedDemoSeedId) {
      url.searchParams.set("demoSeed", resolvedDemoSeedId);
    } else {
      url.searchParams.delete("demoSeed");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [draftControls.preset, parentD01.invalidChildId, rawChildFromQuery, resolvedDemoSeedId, selectedFeed?.child.id]);

  useEffect(() => {
    if (storyRef.current?.storyId !== story?.storyId) {
      activeSceneIndexRef.current = 0;
    }
    storyRef.current = story;
  }, [story]);

  useEffect(() => {
    if (!isLockedLinXiaoyuStorybook || hasManualStorybookOverrideActive) return;
    if (storyRef.current && storyRef.current.storyId !== "lin-xiaoyu-one-small-brave-step") return;
    const fixedStory = buildLinXiaoyuFixedStorybookResponse({
      generatedAt: latestSavedStorybook?.generatedAt,
    });
    startTransition(() => {
      setStory(fixedStory);
      setStatus("storybook");
      setErrorMessage(null);
      setRefreshMessage(null);
      setIsRefreshing(false);
      setCacheState({
        kind: latestSavedStorybook ? "saved" : "hit",
        savedAt: latestSavedStorybook
          ? new Date(latestSavedStorybook.generatedAt).getTime()
          : Date.now(),
      });
    });
  }, [
    fixedStorybookReloadToken,
    hasManualStorybookOverrideActive,
    isLockedLinXiaoyuStorybook,
    latestSavedStorybook,
  ]);

  useEffect(() => {
    if (isRefreshing) {
      return;
    }
    if (!story || !shouldPollParentStoryBookMedia(story)) {
      pollAttemptRef.current = 0;
      pollingStoryIdRef.current = story?.storyId ?? null;
      return;
    }

    if (pollingStoryIdRef.current !== story.storyId) {
      pollingStoryIdRef.current = story.storyId;
      pollAttemptRef.current = 0;
    }

    if (pollAttemptRef.current >= MEDIA_POLL_MAX_ATTEMPTS) {
      return;
    }

    const timer = window.setTimeout(() => {
      pollAttemptRef.current += 1;
      backgroundMediaPollRef.current = true;
      setReloadToken((previousToken) => previousToken + 1);
    }, resolveMediaPollDelayMs(story));

    return () => window.clearTimeout(timer);
  }, [isRefreshing, story]);

  const requiresTheme =
    draftControls.generationMode === "manual-theme" ||
    draftControls.generationMode === "hybrid";
  const manualTheme = draftControls.manualTheme.trim();
  const themeHint = parentD01.invalidChildId
    ? "当前家长账号没有该 childId 的授权，系统不会自动回退到其他孩子。"
    : resolvedDemoSeedId
      ? "当前为本地演示生成，生成结果会保存到 D01 本地演示持久化。"
      : !hasChildContext && draftControls.generationMode !== "manual-theme"
        ? "当前没有可用孩子数据，仅支持主题模式。"
        : requiresTheme && !manualTheme
          ? "请输入主题，或先点一个快捷主题。"
          : null;
  const canGenerate =
    !parentD01.invalidChildId &&
    ((draftControls.generationMode === "child-personalized" && hasChildContext) ||
      (draftControls.generationMode === "manual-theme" && Boolean(manualTheme)) ||
      (draftControls.generationMode === "hybrid" && hasChildContext && Boolean(manualTheme)));

  const request = useMemo<ParentStoryBookRequest | null>(() => {
    if (parentD01.invalidChildId) {
      return null;
    }
    const appliedTheme = appliedControls.manualTheme.trim();
    const appliedRequiresTheme =
      appliedControls.generationMode === "manual-theme" ||
      appliedControls.generationMode === "hybrid";
    if (appliedControls.generationMode === "child-personalized" && !selectedFeed) {
      return null;
    }
    if (appliedControls.generationMode === "hybrid" && !selectedFeed) {
      return null;
    }
    if (appliedRequiresTheme && !appliedTheme) {
      return null;
    }

    const baseRequest = buildParentStoryBookRequestFromFeed({
      feed: selectedFeed,
      healthCheckRecords,
      mealRecords,
      growthRecords,
      guardianFeedbacks,
      taskCheckInRecords,
      latestInterventionCard: selectedFeed
        ? getChildInterventionCard(selectedFeed.child.id) ?? null
        : null,
      latestConsultation: selectedFeed
        ? getLatestConsultationForChild(selectedFeed.child.id) ?? null
        : null,
      requestSource: "parent-storybook-page",
      generationMode: appliedControls.generationMode,
      manualTheme: appliedTheme,
      pageCount: appliedControls.pageCount,
      goalKeywords: appliedControls.goalKeywords,
      stylePreset: appliedControls.preset,
      styleMode: appliedControls.styleMode,
      customStylePrompt: appliedControls.customStylePrompt,
      customStyleNegativePrompt: appliedControls.customStyleNegativePrompt,
    });
    return resolvedDemoSeedId
      ? applyParentStoryBookDemoSeed(baseRequest, resolvedDemoSeedId)
      : baseRequest;
  }, [
    appliedControls,
    getChildInterventionCard,
    getLatestConsultationForChild,
    guardianFeedbacks,
    growthRecords,
    healthCheckRecords,
    mealRecords,
    parentD01.invalidChildId,
    resolvedDemoSeedId,
    selectedFeed,
    taskCheckInRecords,
  ]);

  const cacheKey = useMemo(() => {
    if (!request) return null;
    return buildParentStoryBookCacheKey(request, appliedControls.preset);
  }, [appliedControls.preset, request]);

  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  useEffect(() => {
    if (isLockedLinXiaoyuStorybook && !hasManualStorybookOverrideActive) {
      return;
    }
    const activeRequest = requestRef.current;
    if (!activeRequest || !cacheKey) {
      if (parentD01.invalidChildId || !storyRef.current) {
        setStatus("empty");
        setStory(null);
        setErrorMessage(null);
        setRefreshMessage(null);
        setIsRefreshing(false);
        setCacheState({ kind: "none" });
      }
      return;
    }

    let cancelled = false;
    let backgroundRetryTimer: number | undefined;
    const controller = new AbortController();
    const bypassCache = networkOnlyRef.current;
    const refreshCurrentOnly = refreshCurrentOnlyRef.current;
    const backgroundMediaPoll = backgroundMediaPollRef.current;
    const forceNetworkForManualOverride =
      isLockedLinXiaoyuStorybook && hasManualStorybookOverrideActive && !refreshCurrentOnly;
    const keepUserGenerationRequestAlive =
      !backgroundMediaPoll && (bypassCache || forceNetworkForManualOverride);
    const shouldTrackManualGeneration =
      forceNetworkForManualOverride && !backgroundMediaPoll;
    backgroundMediaPollRef.current = false;
    const resolvedCacheKey = cacheKey;
    const activeRequestChildId = activeRequest.childId ?? activeRequest.snapshot.child.id;
    networkOnlyRef.current = false;
    refreshCurrentOnlyRef.current = false;
    const storyLoadKey = `${resolvedCacheKey}:${reloadToken}`;
    if (lastStoryLoadKeyRef.current === storyLoadKey) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }
    lastStoryLoadKeyRef.current = storyLoadKey;
    if (shouldTrackManualGeneration) {
      if (manualStorybookGenerationInFlightRef.current) return;
      manualStorybookGenerationInFlightRef.current = true;
    }

    function scheduleBackgroundMediaRetry() {
      const currentStory = storyRef.current;
      if (
        cancelled ||
        !backgroundMediaPoll ||
        !currentStory ||
        !shouldPollParentStoryBookMedia(currentStory) ||
        pollAttemptRef.current >= MEDIA_POLL_MAX_ATTEMPTS
      ) {
        return;
      }

      backgroundRetryTimer = window.setTimeout(() => {
        if (
          cancelled ||
          !storyRef.current ||
          !shouldPollParentStoryBookMedia(storyRef.current) ||
          pollAttemptRef.current >= MEDIA_POLL_MAX_ATTEMPTS
        ) {
          return;
        }
        backgroundMediaPollRef.current = true;
        setReloadToken((previousToken) => previousToken + 1);
      }, resolveMediaPollDelayMs(currentStory));
    }

    if (!backgroundMediaPoll && !bypassCache && !forceNetworkForManualOverride) {
      if (
        refreshCurrentOnly &&
        storyRef.current &&
        storyRef.current.childId === (activeRequest.childId ?? activeRequest.snapshot.child.id)
      ) {
        const currentStory = storyRef.current;
        startTransition(() => {
          setStory(currentStory);
          setStatus(currentStory.mode);
          setErrorMessage(null);
          setRefreshMessage("已刷新当前版本；未重新调用 AI 生成。");
          setIsRefreshing(false);
          setCacheState({ kind: "none" });
        });
        return () => {
          cancelled = true;
          controller.abort();
        };
      }

      if (!hasManualStorybookOverrideActive && latestSavedStorybook && selectedFeed) {
        const restoredStory = restoreParentStorybookResponse(latestSavedStorybook, selectedFeed.child.name);
        if (
          storyRef.current?.storyId === restoredStory.storyId &&
          storyRef.current.generatedAt === restoredStory.generatedAt
        ) {
          return () => {
            cancelled = true;
            controller.abort();
          };
        }
        void upsertApiStorybook({
          childId: selectedFeed.child.id,
          storybookId: restoredStory.storyId,
          response: restoredStory as unknown as Record<string, unknown>,
          sourceRecordIds: latestSavedStorybook.sourceRecordIds,
          generatedAt: restoredStory.generatedAt,
        }).catch(() => undefined);
        startTransition(() => {
          setStory(restoredStory);
          setStatus(restoredStory.mode);
          setErrorMessage(null);
          setRefreshMessage("已从 D01 本地演示持久化恢复，刷新后仍会保留。");
          setIsRefreshing(false);
          setCacheState({
            kind: "saved",
            savedAt: new Date(latestSavedStorybook.generatedAt).getTime(),
          });
        });
        return () => {
          cancelled = true;
          controller.abort();
        };
      }

      const cached = readParentStoryBookCache(resolvedCacheKey);
      if (cached && !shouldBypassParentStoryBookCacheOnFirstLoad(cached.story)) {
        if (
          storyRef.current?.storyId === cached.story.storyId &&
          storyRef.current.generatedAt === cached.story.generatedAt
        ) {
          startTransition(() => {
            setIsRefreshing(false);
          });
          return () => {
            cancelled = true;
            controller.abort();
          };
        }
        startTransition(() => {
          setStory(cached.story);
          setStatus(cached.story.mode);
          setErrorMessage(null);
          setRefreshMessage(null);
          setIsRefreshing(false);
          setCacheState({
            kind: "hit",
            savedAt: cached.savedAt,
          });
        });
        return () => {
          cancelled = true;
          controller.abort();
        };
      }
      if (cached) {
        networkOnlyRef.current = !backgroundMediaPoll;
      }
    }

    if (!backgroundMediaPoll) {
      setErrorMessage(null);
      setRefreshMessage(null);
      setCacheState({ kind: "none" });
      setIsRefreshing(Boolean(storyRef.current));
      if (!storyRef.current) {
        setStatus("loading");
      }
    }

    async function loadStory() {
      let timedOut = false;
      const requestTimeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, backgroundMediaPoll ? STORYBOOK_MEDIA_POLL_TIMEOUT_MS : STORYBOOK_USER_REQUEST_TIMEOUT_MS);
      try {
        const requestHeaders = new Headers({
          "Content-Type": "application/json",
        });
        if (!backgroundMediaPoll && (networkOnlyRef.current || bypassCache || forceNetworkForManualOverride)) {
          requestHeaders.set("x-smartchildcare-cache-bypass", "1");
        }

        const mediaStatusStory = backgroundMediaPoll ? storyRef.current : null;
        if (backgroundMediaPoll) {
          if (
            !mediaStatusStory ||
            mediaStatusStory.childId !== activeRequestChildId ||
            !shouldPollParentStoryBookMedia(mediaStatusStory)
          ) {
            return;
          }
        }
        const mediaStatusPayload: ParentStoryBookMediaStatusRequest | null =
          mediaStatusStory
            ? {
                childId: mediaStatusStory.childId,
                storyId: mediaStatusStory.storyId,
                prioritySceneIndices: buildMediaStatusPrioritySceneIndices(
                  mediaStatusStory,
                  activeSceneIndexRef.current
                ),
                retryFailed: true,
                story: mediaStatusStory,
              }
            : null;
        const response = await fetch(
          backgroundMediaPoll
            ? "/api/ai/parent-storybook/media-status"
            : "/api/ai/parent-storybook",
          {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify(mediaStatusPayload ?? activeRequest),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          let detail = "";
          try {
            const errorPayload = (await response.clone().json()) as {
              error?: string;
              detail?: string;
              fallbackReason?: string;
            };
            detail =
              errorPayload.error ??
              errorPayload.detail ??
              errorPayload.fallbackReason ??
              "";
          } catch {
            detail = "";
          }
          throw new Error(
            detail
              ? `成长绘本请求失败（${response.status}）：${detail}`
              : `成长绘本请求失败（${response.status}）`
          );
        }

        const data = (await response.json()) as ParentStoryBookResponse;
        if (cancelled) return;
        if (backgroundMediaPoll) {
          const currentStory = storyRef.current;
          if (
            !currentStory ||
            data.storyId !== currentStory.storyId ||
            data.childId !== currentStory.childId
          ) {
            return;
          }
        }
        if (
          requestRef.current?.childId &&
          activeRequestChildId &&
          requestRef.current.childId !== activeRequestChildId
        ) {
          return;
        }

        const persisted = writeParentStoryBookCache(
          resolvedCacheKey,
          appliedControls.preset,
          data
        );
        const sourceRecordIds = storybookSourceRecordIds;
        const shouldPersistGeneratedStorybook =
          !forceNetworkForManualOverride && !backgroundMediaPoll;
        const storybookSaveResult =
          selectedFeed && data.childId === selectedFeed.child.id && shouldPersistGeneratedStorybook
            ? saveParentStorybook({
                childId: selectedFeed.child.id,
                response: data,
                sourceRecordIds,
              })
            : null;
        let apiStorybookSaveError = "";
        let apiStorybookSaved = false;
        if (
          selectedFeed &&
          data.childId === selectedFeed.child.id &&
          shouldPersistGeneratedStorybook
        ) {
          const apiStorybookInput = {
            childId: selectedFeed.child.id,
            storybookId: data.storyId,
            response: data as unknown as Record<string, unknown>,
            sourceRecordIds,
            generatedAt: data.generatedAt,
          };
          try {
            await withClientTimeout(
              upsertApiStorybook(apiStorybookInput),
              STORYBOOK_API_SAVE_TIMEOUT_MS,
              "E01 storybook save timed out"
            );
            apiStorybookSaved = true;
          } catch (saveError) {
            apiStorybookSaveError = saveError instanceof Error ? saveError.message : "E01 绘本服务保存失败。";
          }
        }
        startTransition(() => {
          setStory(data);
          setStatus(data.mode);
          if (!backgroundMediaPoll) {
            setErrorMessage(null);
            setRefreshMessage(
              storybookSaveResult?.status === "failed"
                ? `生成完成，但保存到 D01 失败：${storybookSaveResult.error ?? storybookSaveResult.message}`
                : apiStorybookSaveError
                  ? `本地演示已保存，但 E01 绘本服务保存失败：${apiStorybookSaveError}`
                  : apiStorybookSaved
                    ? "绘本已保存到 E01 服务，语音可分享/导出；刷新后仍存在。"
                    : storybookSaveResult?.status === "local_only"
                      ? "本地演示已保存到 D01，刷新后仍存在。"
                      : null
            );
          }
          setIsRefreshing(false);
          if (!backgroundMediaPoll || persisted) {
            setCacheState(
              persisted || (storybookSaveResult && storybookSaveResult.status !== "failed")
                ? {
                    kind: "saved",
                    savedAt: storybookSaveResult
                      ? new Date(storybookSaveResult.persistedAt).getTime()
                      : persisted!.savedAt,
                  }
                : { kind: "none" }
            );
          }
        });
      } catch (error) {
        if (cancelled) return;

        if (backgroundMediaPoll && storyRef.current) {
          startTransition(() => {
            setIsRefreshing(false);
          });
          scheduleBackgroundMediaRetry();
          return;
        }

        startTransition(() => {
          const nextMessage =
            timedOut
              ? "成长绘本资源刷新超时，已保留上一版内容。"
              : error instanceof Error ? error.message : "成长绘本生成失败。";

          if (storyRef.current) {
            setRefreshMessage(`刷新失败，已保留上一版绘本：${nextMessage}`);
            setIsRefreshing(false);
          } else {
            setStory(null);
            setStatus("error");
            setErrorMessage(nextMessage);
          }

          setCacheState({ kind: "none" });
        });
      } finally {
        window.clearTimeout(requestTimeout);
        if (shouldTrackManualGeneration) {
          manualStorybookGenerationInFlightRef.current = false;
        }
      }
    }

    void loadStory();

    return () => {
      if (backgroundRetryTimer !== undefined) {
        window.clearTimeout(backgroundRetryTimer);
      }
      if (!keepUserGenerationRequestAlive) {
        cancelled = true;
        controller.abort();
      }
    };
  }, [
    appliedControls.preset,
    cacheKey,
    hasManualStorybookOverrideActive,
    isLockedLinXiaoyuStorybook,
    latestSavedStorybook,
    parentD01.invalidChildId,
    reloadToken,
    saveParentStorybook,
    selectedFeed,
    storybookSourceRecordIds,
  ]);

  function syncThemeDraft(nextTheme: string) {
    const trimmed = nextTheme.trim();
    setDraftControls((current) => ({
      ...current,
      manualTheme: nextTheme,
      goalKeywords: PARENT_STORYBOOK_THEME_CHIPS.includes(
        trimmed as (typeof PARENT_STORYBOOK_THEME_CHIPS)[number]
      )
        ? [trimmed]
        : [],
    }));
  }

  async function handleExportStorybook(format: StorybookExportFormat) {
    if (!story?.storyId) {
      setStorybookActionStatus("请先生成或恢复一本成长绘本后再导出。");
      return;
    }

    setIsStorybookActionPending(true);
    setStorybookActionStatus(null);
    try {
      const exported = await exportStorybook(story.storyId, format);
      const blob = new Blob([exported.content], { type: exported.mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.filename;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
      setStorybookActionStatus(`已下载绘本摘要 ${exported.filename}，可直接用于家园沟通记录。`);
    } catch (error) {
      setStorybookActionStatus(error instanceof Error ? error.message : "成长绘本导出失败。");
    } finally {
      setIsStorybookActionPending(false);
    }
  }

  async function handleShareStorybook() {
    if (!story?.storyId) {
      setStorybookActionStatus("请先生成或恢复一本成长绘本后再分享。");
      return;
    }

    setIsStorybookActionPending(true);
    setStorybookActionStatus(null);
    try {
      const shareIncludesTonightAction =
        isLinXiaoyuFixedStorybookVisible && !hasManualStorybookOverrideActive;
      const shareSummary =
        shareIncludesTonightAction
          ? `${story.summary}\n今晚行动：${LIN_XIAOYU_TONIGHT_ACTION}`
          : story.summary;
      const shared = await shareStorybook(story.storyId, { summary: shareSummary });
      let copied = false;
      try {
        await navigator.clipboard?.writeText(shared.copyText);
        copied = true;
      } catch {
        copied = false;
      }
      setStorybookActionStatus(
        copied
          ? shareIncludesTonightAction
            ? "已复制带今晚行动的绘本分享文案。"
            : "已复制绘本分享文案。"
          : shareIncludesTonightAction
            ? "已生成带今晚行动的绘本分享文案；浏览器未允许自动复制。"
            : "已生成绘本分享文案；浏览器未允许自动复制。"
      );
    } catch (error) {
      setStorybookActionStatus(error instanceof Error ? error.message : "成长绘本分享失败。");
    } finally {
      setIsStorybookActionPending(false);
    }
  }

  return (
    <StoryBookViewer
      status={status}
      story={story}
      errorMessage={errorMessage}
      refreshMessage={refreshMessage}
      isRefreshing={isRefreshing}
      isStorybookActionPending={isStorybookActionPending}
      storybookActionStatus={storybookActionStatus}
      cacheState={cacheState}
      selectedChildName={selectedFeed?.child.name}
      hasChildContext={hasChildContext}
      generationMode={draftControls.generationMode}
      manualTheme={draftControls.manualTheme}
      pageCount={draftControls.pageCount}
      selectedPresetId={draftControls.preset}
      styleMode={draftControls.styleMode}
      customStylePrompt={draftControls.customStylePrompt}
      customStyleNegativePrompt={draftControls.customStyleNegativePrompt}
      themeChips={[...PARENT_STORYBOOK_THEME_CHIPS]}
      pageCountOptions={[...PAGE_COUNT_OPTIONS]}
      generationHint={themeHint}
      canGenerate={canGenerate}
      lockedStorybook={
        isLinXiaoyuFixedStorybookVisible && !hasManualStorybookOverrideActive
          ? {
              subtitle: LIN_XIAOYU_FIXED_STORYBOOK_SUBTITLE,
              paged: true,
              fixedDefault: true,
              evidenceItems: [...LIN_XIAOYU_FIXED_STORYBOOK_EVIDENCE],
              tonightAction: LIN_XIAOYU_TONIGHT_ACTION,
              feedbackPrompt: LIN_XIAOYU_FEEDBACK_PROMPT,
            }
          : undefined
      }
      parentHref={selectedFeed?.child.id ? `/parent?child=${selectedFeed.child.id}` : "/parent"}
      tonightActionHref={
        selectedFeed?.child.id ? `/parent/agent?child=${selectedFeed.child.id}` : "/parent/agent"
      }
      feedbackHref={
        selectedFeed?.child.id ? `/parent/agent?child=${selectedFeed.child.id}#feedback` : "/parent/agent#feedback"
      }
      onSelectPreset={(preset) =>
        setDraftControls((current) => ({ ...current, preset }))
      }
      onGenerationModeChange={(generationMode) =>
        setDraftControls((current) => ({
          ...current,
          generationMode,
          ...(generationMode === "child-personalized"
            ? { manualTheme: "", goalKeywords: [] }
            : {}),
        }))
      }
      onManualThemeChange={syncThemeDraft}
      onSelectThemeChip={(theme) =>
        setDraftControls((current) => {
          const nextTheme = current.manualTheme === theme ? "" : theme;
          return {
            ...current,
            manualTheme: nextTheme,
            goalKeywords: nextTheme ? [nextTheme] : [],
          };
        })
      }
      onPageCountChange={(pageCount) =>
        setDraftControls((current) => ({ ...current, pageCount }))
      }
      onStyleModeChange={(styleMode) =>
        setDraftControls((current) => ({ ...current, styleMode }))
      }
      onCustomStylePromptChange={(customStylePrompt) =>
        setDraftControls((current) => ({ ...current, customStylePrompt }))
      }
      onCustomStyleNegativePromptChange={(customStyleNegativePrompt) =>
        setDraftControls((current) => ({ ...current, customStyleNegativePrompt }))
      }
      onGenerate={() => {
        if (!canGenerate) return;
        hasManualStorybookOverrideRef.current = true;
        setHasManualStorybookOverride(true);
        networkOnlyRef.current = true;
        setAppliedControls(draftControls);
        setReloadToken((previousToken) => previousToken + 1);
      }}
      onRetry={() => {
        if (isLockedLinXiaoyuStorybook && !hasManualStorybookOverrideActive) {
          setFixedStorybookReloadToken((previousToken) => previousToken + 1);
          return;
        }
        if (!request) return;
        networkOnlyRef.current = false;
        refreshCurrentOnlyRef.current = true;
        setReloadToken((previousToken) => previousToken + 1);
      }}
      onActiveSceneChange={(index) => {
        if (activeSceneIndexRef.current === index) return;
        activeSceneIndexRef.current = index;
        const currentStory = storyRef.current;
        if (
          !isRefreshing &&
          currentStory &&
          shouldPollParentStoryBookMedia(currentStory)
        ) {
          backgroundMediaPollRef.current = true;
          setReloadToken((previousToken) => previousToken + 1);
        }
      }}
      onExportStorybook={(format) => {
        void handleExportStorybook(format);
      }}
      onShareStorybook={() => {
        void handleShareStorybook();
      }}
    />
  );
}
