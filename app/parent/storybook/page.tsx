"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import StoryBookViewer from "@/components/parent/StoryBookViewer";
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
  resolveDefaultParentStoryBookDemoSeedId,
  resolveParentStoryBookDemoSeedId,
} from "@/lib/agent/parent-storybook-demo-seeds";
import type {
  ParentStoryBookGenerationMode,
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
import { useApp } from "@/lib/store";

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

const PAGE_COUNT_OPTIONS = [4, 6, 8] as const satisfies readonly ParentStoryBookPageCount[];
const MEDIA_POLL_INTERVAL_MS = 2_000;
const MEDIA_POLL_MAX_ATTEMPTS = 24;

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
  const searchParams = useSearchParams();
  const childFromQuery = searchParams.get("child") ?? undefined;
  const presetFromQuery = searchParams.get("preset");
  const explicitDemoSeedId = resolveParentStoryBookDemoSeedId(
    searchParams.get("demoSeed")
  );
  const {
    currentUser,
    getParentFeed,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    taskCheckInRecords,
    getChildInterventionCard,
    getLatestConsultationForChild,
  } = useApp();

  const [status, setStatus] = useState<StoryBookPageStatus>("loading");
  const [story, setStory] = useState<ParentStoryBookResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cacheState, setCacheState] = useState<ParentStoryBookClientCacheState>({
    kind: "none",
  });
  const [reloadToken, setReloadToken] = useState(0);
  const networkOnlyRef = useRef(false);
  const storyRef = useRef<ParentStoryBookResponse | null>(null);
  const pollAttemptRef = useRef(0);
  const pollingStoryIdRef = useRef<string | null>(null);

  const feeds = getParentFeed();
  const selectedFeed = useMemo(() => {
    if (childFromQuery) {
      return feeds.find((item) => item.child.id === childFromQuery) ?? feeds[0];
    }
    return feeds[0];
  }, [childFromQuery, feeds]);
  const hasChildContext = Boolean(selectedFeed);

  const resolvedDemoSeedId = useMemo(
    () =>
      resolveDefaultParentStoryBookDemoSeedId({
        childId: selectedFeed?.child.id ?? childFromQuery,
        currentUserId: currentUser.id,
        accountKind: currentUser.accountKind,
        explicitDemoSeedId,
      }),
    [childFromQuery, currentUser.accountKind, currentUser.id, explicitDemoSeedId, selectedFeed]
  );
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
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
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
  }, [draftControls.preset, resolvedDemoSeedId]);

  useEffect(() => {
    storyRef.current = story;
  }, [story]);

  useEffect(() => {
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
      networkOnlyRef.current = true;
      setReloadToken((previousToken) => previousToken + 1);
    }, MEDIA_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [story]);

  const requiresTheme =
    draftControls.generationMode === "manual-theme" ||
    draftControls.generationMode === "hybrid";
  const manualTheme = draftControls.manualTheme.trim();
  const themeHint = !hasChildContext && draftControls.generationMode !== "manual-theme"
    ? "当前没有可用孩子数据，仅支持主题模式。"
    : requiresTheme && !manualTheme
      ? "请输入主题，或先点一个快捷主题。"
      : null;
  const canGenerate =
    (draftControls.generationMode === "child-personalized" && hasChildContext) ||
    (draftControls.generationMode === "manual-theme" && Boolean(manualTheme)) ||
    (draftControls.generationMode === "hybrid" && hasChildContext && Boolean(manualTheme));

  const request = useMemo<ParentStoryBookRequest | null>(() => {
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
    return applyParentStoryBookDemoSeed(baseRequest, resolvedDemoSeedId);
  }, [
    appliedControls,
    getChildInterventionCard,
    getLatestConsultationForChild,
    guardianFeedbacks,
    growthRecords,
    healthCheckRecords,
    mealRecords,
    resolvedDemoSeedId,
    selectedFeed,
    taskCheckInRecords,
  ]);

  const cacheKey = useMemo(() => {
    if (!request) return null;
    return buildParentStoryBookCacheKey(request, appliedControls.preset);
  }, [appliedControls.preset, request]);

  useEffect(() => {
    if (!request || !cacheKey) {
      if (!storyRef.current) {
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
    const controller = new AbortController();
    const bypassCache = networkOnlyRef.current;
    const resolvedCacheKey = cacheKey;
    networkOnlyRef.current = false;

    if (!bypassCache) {
      const cached = readParentStoryBookCache(resolvedCacheKey);
      if (cached && !shouldBypassParentStoryBookCacheOnFirstLoad(cached.story)) {
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
        networkOnlyRef.current = true;
      }
    }

    setErrorMessage(null);
    setRefreshMessage(null);
    setCacheState({ kind: "none" });
    setIsRefreshing(Boolean(storyRef.current));
    if (!storyRef.current) {
      setStatus("loading");
    }

    async function loadStory() {
      try {
        const requestHeaders = new Headers({
          "Content-Type": "application/json",
        });
        if (networkOnlyRef.current || bypassCache) {
          requestHeaders.set("x-smartchildcare-cache-bypass", "1");
        }

        const response = await fetch("/api/ai/parent-storybook", {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`成长绘本请求失败（${response.status}）`);
        }

        const data = (await response.json()) as ParentStoryBookResponse;
        if (cancelled) return;

        const persisted = writeParentStoryBookCache(
          resolvedCacheKey,
          appliedControls.preset,
          data
        );
        startTransition(() => {
          setStory(data);
          setStatus(data.mode);
          setErrorMessage(null);
          setRefreshMessage(null);
          setIsRefreshing(false);
          setCacheState(
            persisted
              ? {
                  kind: "saved",
                  savedAt: persisted.savedAt,
                }
              : { kind: "none" }
          );
        });
      } catch (error) {
        if (cancelled) return;

        startTransition(() => {
          const nextMessage =
            error instanceof Error ? error.message : "成长绘本生成失败。";

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
      }
    }

    void loadStory();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [appliedControls.preset, cacheKey, request, reloadToken]);

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

  return (
    <StoryBookViewer
      status={status}
      story={story}
      errorMessage={errorMessage}
      refreshMessage={refreshMessage}
      isRefreshing={isRefreshing}
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
        networkOnlyRef.current = true;
        setAppliedControls(draftControls);
        setReloadToken((previousToken) => previousToken + 1);
      }}
      onRetry={() => {
        if (!request) return;
        networkOnlyRef.current = true;
        setReloadToken((previousToken) => previousToken + 1);
      }}
    />
  );
}
