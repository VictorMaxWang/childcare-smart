import type {
  ChildSuggestionSnapshot,
  ConsultationResult,
  ParentStoryBookDiagnostics,
  ParentStoryBookGenerationMode,
  ParentStoryBookHighlightCandidate,
  ParentStoryBookHighlightKind,
  ParentStoryBookImageDelivery,
  ParentStoryBookMediaStatus,
  ParentStoryBookMode,
  ParentStoryBookPageCount,
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookScene,
  ParentStoryBookStylePreset,
  ParentStoryBookStyleMode,
  ParentStoryBookTransport,
} from "@/lib/ai/types";
import {
  buildParentAgentChildContext,
  buildParentChildSuggestionSnapshot,
} from "@/lib/agent/parent-agent";
import type { InterventionCard } from "@/lib/agent/intervention-card";
import type {
  GrowthRecord,
  GuardianFeedback,
  HealthCheckRecord,
  MealRecord,
  ParentFeed,
  TaskCheckInRecord,
  WeeklyDietTrend,
} from "@/lib/store";

export interface ParentStoryBookPayloadInput {
  feed?: ParentFeed | null;
  healthCheckRecords: HealthCheckRecord[];
  mealRecords: MealRecord[];
  growthRecords: GrowthRecord[];
  guardianFeedbacks: GuardianFeedback[];
  taskCheckInRecords: TaskCheckInRecord[];
  latestInterventionCard?: InterventionCard | null;
  latestConsultation?: ConsultationResult | null;
  requestSource?: string;
  storyMode?: ParentStoryBookMode;
  generationMode?: ParentStoryBookGenerationMode;
  manualTheme?: string;
  manualPrompt?: string;
  pageCount?: ParentStoryBookPageCount;
  goalKeywords?: string[];
  protagonistArchetype?: string;
  stylePreset?: ParentStoryBookStylePreset;
  styleMode?: ParentStoryBookStyleMode;
  customStylePrompt?: string;
  customStyleNegativePrompt?: string;
  stylePrompt?: string;
  traceId?: string;
  debugMemory?: boolean;
}

export interface ParentStoryBookStylePresetDefinition {
  id: ParentStoryBookStylePreset;
  label: string;
  shortLabel: string;
  description: string;
  stylePrompt: string;
}

type NormalizedConsultation = {
  summary: string;
  homeAction: string;
  followUp48h: string;
  parentMessageDraft: string;
  schoolAction: string;
};

type NormalizedInterventionCard = {
  title: string;
  tonightHomeAction: string;
  reviewIn48h: string;
  tomorrowObservationPoint: string;
};

type StoryStage =
  | "opening"
  | "setup"
  | "challenge"
  | "support"
  | "attempt"
  | "wobble"
  | "small-success"
  | "landing";

type StoryIngredients = {
  childName: string;
  className?: string;
  focusTheme: string;
  goalKeywords: string[];
  protagonist: ProtagonistDefinition;
  protagonistArchetype: string;
  protagonistName: string;
  generationMode: ParentStoryBookGenerationMode;
  pageCount: ParentStoryBookPageCount;
  highlightCandidates: ParentStoryBookHighlightCandidate[];
  summaryHighlight: string;
  challengeDetail: string;
  supportDetail: string;
  attemptDetail: string;
  successDetail: string;
  wobbleDetail: string;
  tonightAction: string;
  tomorrowObservation: string;
  promptHint: string;
  parentNote: string;
  styleRecipe: StyleRecipe;
  stylePrompt: string;
  storyMode: ParentStoryBookMode;
};

type ProtagonistDefinition = {
  archetype: string;
  label: string;
  visualCue: string;
};

type StyleRecipe = {
  mode: ParentStoryBookStyleMode;
  preset: ParentStoryBookStylePreset;
  prompt: string;
  negativePrompt: string;
  customPrompt?: string;
  customNegativePrompt?: string;
  palette: {
    backgroundStart: string;
    backgroundEnd: string;
    accent: string;
    text: string;
    chip: string;
  };
};

type SceneBlueprint = {
  pageIndex: number;
  stage: StoryStage;
  sceneTitle: string;
  sceneGoal: string;
  protagonist: ProtagonistDefinition;
  environment: string;
  visibleAction: string;
  emotion: string;
  mustInclude: string[];
  avoid: string[];
  narrativeAnchor: string;
  highlightSource: string;
  voiceStyle: string;
  visualAnchor: string;
  sceneObjectCue: string;
  supportCharacterCue: string;
  activityCue: string;
  emotionCue: string;
  taskCue: string;
};

type SceneCaptionTiming = NonNullable<ParentStoryBookScene["captionTiming"]>;

type DemoArtBlueprint = {
  environmentFamily: "meadow" | "path" | "doorway" | "reading-nook" | "sleepy-room";
  cameraLayout: "wide" | "focused" | "close";
  pose: "wave" | "observe" | "hesitate" | "lean-in" | "step-forward" | "breathe" | "celebrate" | "curl-up";
  expression: "curious" | "calm" | "shy" | "supported" | "brave" | "wobbly" | "bright" | "sleepy";
  prop: "spark" | "path" | "door" | "lantern" | "star" | "heart" | "moon";
  accentEffect: "glow" | "ripple" | "confetti" | "breeze";
};

type DemoStyleFamily = ParentStoryBookStylePreset;

type SyntheticSnapshotInput = {
  childId?: string | null;
  childName?: string;
  className?: string;
  theme?: string;
  goalKeywords?: string[];
  manualPrompt?: string;
};

const STORYBOOK_BASE_DATE = Date.UTC(2026, 3, 7, 12, 0, 0);
const STORYBOOK_FOCUS_FALLBACK = "慢慢长大的力量";

export const DEFAULT_PARENT_STORYBOOK_STYLE_PRESET: ParentStoryBookStylePreset =
  "sunrise-watercolor";
export const DEFAULT_PARENT_STORYBOOK_STYLE_MODE: ParentStoryBookStyleMode = "preset";
export const DEFAULT_PARENT_STORYBOOK_GENERATION_MODE: ParentStoryBookGenerationMode =
  "child-personalized";
export const DEFAULT_PARENT_STORYBOOK_PAGE_COUNT: ParentStoryBookPageCount = 6;
export const PARENT_STORYBOOK_PAGE_OPTIONS: ParentStoryBookPageCount[] = [4, 6, 8];
export const PARENT_STORYBOOK_THEME_CHIPS = [
  "勇气",
  "诚实",
  "分享",
  "表达情绪",
  "规则意识",
  "独立入睡",
] as const;

const PAGE_STRUCTURES: Record<ParentStoryBookPageCount, StoryStage[]> = {
  4: ["opening", "challenge", "attempt", "landing"],
  6: ["opening", "challenge", "support", "attempt", "small-success", "landing"],
  8: [
    "opening",
    "setup",
    "challenge",
    "support",
    "attempt",
    "wobble",
    "small-success",
    "landing",
  ],
};

const PROTAGONIST_DEFINITIONS: ProtagonistDefinition[] = [
  { archetype: "bunny", label: "小兔团团", visualCue: "圆圆耳朵、软软围巾" },
  { archetype: "bear", label: "小熊暖暖", visualCue: "毛绒外套、小小灯笼" },
  { archetype: "deer", label: "小鹿悠悠", visualCue: "细长步子、月光披风" },
  { archetype: "fox", label: "小狐狸点点", visualCue: "蓬松尾巴、暖橙小背包" },
  { archetype: "otter", label: "小水獭泡泡", visualCue: "亮晶晶眼睛、柔软披肩" },
];

export const PARENT_STORYBOOK_STYLE_PRESETS: ParentStoryBookStylePresetDefinition[] = [
  {
    id: "sunrise-watercolor",
    label: "晨光水彩",
    shortLabel: "晨光",
    description: "暖金色水彩与柔软纸感，适合把成长时刻讲得温柔、明亮。",
    stylePrompt:
      "儿童绘本插画，晨光水彩质感，暖金高光，柔软纸张肌理，治愈、童趣、适合移动端纵向绘本。",
  },
  {
    id: "moonlit-cutout",
    label: "月夜剪纸",
    shortLabel: "月夜",
    description: "静蓝夜色与层叠纸艺，适合睡前情绪、晚安故事与安抚主题。",
    stylePrompt:
      "儿童绘本插画，月夜剪纸风格，深蓝与奶白层叠，星光柔雾，安静、轻柔、适合晚安故事。",
  },
  {
    id: "forest-crayon",
    label: "森林蜡笔",
    shortLabel: "森林",
    description: "浅绿木质配色与手绘蜡笔纹理，更活泼，也更适合比赛演示。",
    stylePrompt:
      "儿童绘本插画，森林蜡笔风格，浅绿与木色，明显手绘纹理，轻冒险感，温暖而有生命力。",
  },
];

const DEFAULT_STYLE_NEGATIVE_PROMPT =
  "不要照片感、不要写实人脸、不要复杂背景、不要成人化";
const DEFAULT_NO_TEXT_IMAGE_GUARDRAIL =
  "不要任何中文、不要任何英文、不要任何数字、不要任何标题、不要任何对话气泡、不要任何对白框、不要任何书页文字、不要任何海报排版文字、不要任何logo、不要任何watermark、不要任何水印、不要任何signature、不要任何签名、不要任何标识、image-only composition、no readable text、no typography";

const STYLE_PALETTES: Record<
  ParentStoryBookStylePreset,
  StyleRecipe["palette"]
> = {
  "sunrise-watercolor": {
    backgroundStart: "#fff3cf",
    backgroundEnd: "#fde5ea",
    accent: "#f59e0b",
    text: "#7c3a0f",
    chip: "#fff8e6",
  },
  "moonlit-cutout": {
    backgroundStart: "#dbeafe",
    backgroundEnd: "#e0e7ff",
    accent: "#2563eb",
    text: "#1d4ed8",
    chip: "#eff6ff",
  },
  "forest-crayon": {
    backgroundStart: "#dcfce7",
    backgroundEnd: "#fef3c7",
    accent: "#059669",
    text: "#166534",
    chip: "#f0fdf4",
  },
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildStableTimestamp(seed: string) {
  const offset = Number.parseInt(stableHash(seed).slice(0, 8), 16) % (24 * 60 * 60 * 1000);
  return new Date(STORYBOOK_BASE_DATE + offset).toISOString();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function splitPromptClauses(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized
    .split(/[、，,；;。\n]+/u)
    .map((item) => item.trim().replace(/^[:：]\s*/u, ""))
    .filter(Boolean);
}

function mergePromptClauses(...values: Array<string | null | undefined>) {
  const merged: string[] = [];
  const seen = new Set<string>();
  values.flatMap((value) => splitPromptClauses(value)).forEach((clause) => {
    const key = clause.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(clause);
  });
  return merged.join("、");
}

function extractStylePromptBody(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  let body = normalized;
  const prefix = "儿童绘本风格方向：";
  if (body.startsWith(prefix)) {
    body = body.slice(prefix.length).trim();
  }
  if (body.includes("负面约束：")) {
    body = body.split("负面约束：", 1)[0] ?? "";
  }
  return body.replace(/[。；;，,\s]+$/u, "");
}

function extractStylePromptNegative(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized.includes("负面约束：")) return "";
  return normalized.split("负面约束：").slice(1).join("负面约束：").replace(/[。；;，,\s]+$/u, "");
}

function buildStoryImageNegativePrompt(...extraValues: Array<string | null | undefined>) {
  return mergePromptClauses(
    DEFAULT_STYLE_NEGATIVE_PROMPT,
    DEFAULT_NO_TEXT_IMAGE_GUARDRAIL,
    ...extraValues
  );
}

function normalizeKeywords(values?: string[] | null) {
  if (!values?.length) return [];
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean))
  ).slice(0, 4);
}

function resolveParentStoryBookPageCount(
  value?: number | null
): ParentStoryBookPageCount {
  if (value === 4 || value === 6 || value === 8) {
    return value;
  }
  return DEFAULT_PARENT_STORYBOOK_PAGE_COUNT;
}

export function resolveParentStoryBookStylePreset(
  value?: string | null
): ParentStoryBookStylePreset {
  const normalized = normalizeText(value);
  const matched = PARENT_STORYBOOK_STYLE_PRESETS.find((item) => item.id === normalized);
  return matched?.id ?? DEFAULT_PARENT_STORYBOOK_STYLE_PRESET;
}

export function getParentStoryBookStylePresetDefinition(value?: string | null) {
  const preset = resolveParentStoryBookStylePreset(value);
  return (
    PARENT_STORYBOOK_STYLE_PRESETS.find((item) => item.id === preset) ??
    PARENT_STORYBOOK_STYLE_PRESETS[0]
  );
}

export function resolveParentStoryBookStyleMode(
  value?: string | null
): ParentStoryBookStyleMode {
  return normalizeText(value) === "custom" ? "custom" : DEFAULT_PARENT_STORYBOOK_STYLE_MODE;
}

function resolveStylePalette(
  styleMode: ParentStoryBookStyleMode,
  stylePreset: ParentStoryBookStylePreset,
  customPrompt?: string
): StyleRecipe["palette"] {
  if (styleMode !== "custom") {
    return STYLE_PALETTES[stylePreset];
  }

  const prompt = normalizeText(customPrompt).toLowerCase();
  if (/(night|moon|蓝|夜|星)/.test(prompt)) {
    return {
      backgroundStart: "#dbeafe",
      backgroundEnd: "#e0e7ff",
      accent: "#2563eb",
      text: "#1e3a8a",
      chip: "#eff6ff",
    };
  }
  if (/(forest|green|森|草|自然)/.test(prompt)) {
    return {
      backgroundStart: "#dcfce7",
      backgroundEnd: "#fef3c7",
      accent: "#059669",
      text: "#166534",
      chip: "#f0fdf4",
    };
  }
  return {
    backgroundStart: "#fff7ed",
    backgroundEnd: "#fce7f3",
    accent: "#ea580c",
    text: "#7c2d12",
    chip: "#fff7ed",
  };
}

function buildCanonicalStylePrompt(input: {
  styleMode?: ParentStoryBookStyleMode;
  stylePreset?: ParentStoryBookStylePreset;
  customStylePrompt?: string;
  customStyleNegativePrompt?: string;
  stylePrompt?: string;
}) {
  const styleMode = resolveParentStoryBookStyleMode(input.styleMode);
  const stylePreset = resolveParentStoryBookStylePreset(input.stylePreset);
  const presetPrompt = getParentStoryBookStylePresetDefinition(stylePreset).stylePrompt;
  const customPrompt = extractStylePromptBody(input.customStylePrompt);
  const customNegativePrompt = mergePromptClauses(
    extractStylePromptNegative(input.customStyleNegativePrompt),
    input.customStyleNegativePrompt
  );
  const explicitStylePrompt = normalizeText(input.stylePrompt);
  const explicitPromptBody = extractStylePromptBody(explicitStylePrompt);
  const explicitNegativePrompt = extractStylePromptNegative(explicitStylePrompt);
  const resolvedNegativePrompt = buildStoryImageNegativePrompt(
    explicitNegativePrompt,
    customNegativePrompt
  );

  if (styleMode === "custom") {
    const prompt =
      customPrompt ||
      explicitPromptBody ||
      "梦幻儿童绘本，柔焦，浅景深，温柔光影，移动端纵向大画幅";
    return {
      mode: styleMode,
      preset: stylePreset,
      prompt: `儿童绘本风格方向：${prompt}。负面约束：${resolvedNegativePrompt}。`,
      negativePrompt: resolvedNegativePrompt,
      customPrompt: prompt,
      customNegativePrompt: resolvedNegativePrompt,
      palette: resolveStylePalette(styleMode, stylePreset, prompt),
    } satisfies StyleRecipe;
  }

  const resolvedPrompt = explicitPromptBody || presetPrompt;
  return {
    mode: styleMode,
    preset: stylePreset,
    prompt: `儿童绘本风格方向：${resolvedPrompt}。负面约束：${resolvedNegativePrompt}。`,
    negativePrompt: resolvedNegativePrompt,
    customPrompt: undefined,
    customNegativePrompt: undefined,
    palette: resolveStylePalette(styleMode, stylePreset),
  } satisfies StyleRecipe;
}

function resolveDemoStyleFamily(styleRecipe: StyleRecipe): DemoStyleFamily {
  if (styleRecipe.mode !== "custom") {
    return styleRecipe.preset;
  }

  const prompt = normalizeText(styleRecipe.customPrompt || styleRecipe.prompt).toLowerCase();
  if (/(night|moon|cutout|剪纸|月夜)/.test(prompt)) {
    return "moonlit-cutout";
  }
  if (/(forest|green|crayon|森林|蜡笔|自然)/.test(prompt)) {
    return "forest-crayon";
  }
  return "sunrise-watercolor";
}

function resolveGenerationMode(input: {
  generationMode?: ParentStoryBookGenerationMode;
  feed?: ParentFeed | null;
  manualTheme?: string;
}) {
  if (input.generationMode) {
    return input.generationMode;
  }

  const hasTheme = Boolean(normalizeText(input.manualTheme));
  const hasFeed = Boolean(input.feed);
  if (hasTheme && hasFeed) return "hybrid";
  if (hasTheme) return "manual-theme";
  return hasFeed ? "child-personalized" : "manual-theme";
}

function pickFirstString(values: Array<unknown>) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function shortenDetail(value: string, fallback: string) {
  const normalized = normalizeText(value) || fallback;
  if (normalized.length <= 38) return normalized;
  return `${normalized.slice(0, 38)}…`;
}

function buildSyntheticSnapshot(input: SyntheticSnapshotInput): ChildSuggestionSnapshot {
  const goalKeywords = normalizeKeywords(input.goalKeywords);
  const theme = normalizeText(input.theme);
  const manualPrompt = normalizeText(input.manualPrompt);
  const fallbackNote =
    theme || goalKeywords[0] || manualPrompt || STORYBOOK_FOCUS_FALLBACK;

  return {
    child: {
      id: input.childId ?? "storybook-guest",
      name: input.childName ?? "小朋友",
      className: input.className,
      specialNotes: fallbackNote,
    },
    summary: {
      health: {
        abnormalCount: 0,
        handMouthEyeAbnormalCount: 0,
        moodKeywords: theme ? [theme] : goalKeywords,
      },
      meals: {
        recordCount: 0,
        hydrationAvg: 0,
        balancedRate: 0,
        monotonyDays: 0,
        allergyRiskCount: 0,
      },
      growth: {
        recordCount: 0,
        attentionCount: 0,
        pendingReviewCount: 0,
        topCategories: theme ? [{ category: theme, count: 1 }] : [],
      },
      feedback: {
        count: 0,
        statusCounts: {},
        keywords: goalKeywords,
      },
    },
    ruleFallback: [
      {
        title: theme ? `主题：${theme}` : "成长主题",
        description:
          manualPrompt ||
          `把“${fallbackNote}”变成孩子能听、家长愿意读的温柔成长故事。`,
        level: "info",
        tags: goalKeywords,
      },
    ],
  };
}

function normalizeInterventionCard(
  card?: InterventionCard | Record<string, unknown> | null
): NormalizedInterventionCard | null {
  if (!card) return null;
  const record = card as Record<string, unknown>;
  return {
    title: pickFirstString([record.title, record.interventionTitle, record.summary]),
    tonightHomeAction: pickFirstString([
      record.tonightHomeAction,
      record.homeAction,
      record.action,
    ]),
    reviewIn48h: pickFirstString([
      record.reviewIn48h,
      record.followUp48h,
      record.reviewWindow,
    ]),
    tomorrowObservationPoint: pickFirstString([
      record.tomorrowObservationPoint,
      record.teacherFollowupDraft,
      record.observationPoint,
    ]),
  };
}

function normalizeConsultation(
  consultation?: ConsultationResult | null
): NormalizedConsultation | null {
  if (!consultation) return null;
  return {
    summary: normalizeText(consultation.summary),
    homeAction: normalizeText(consultation.homeAction),
    followUp48h: consultation.followUp48h?.[0] ?? "",
    parentMessageDraft: normalizeText(consultation.parentMessageDraft),
    schoolAction: normalizeText(consultation.schoolAction),
  };
}

function summarizeTrend(trend: WeeklyDietTrend) {
  const items = [
    trend.hydrationAvg ? `饮水约 ${trend.hydrationAvg}ml` : "",
    trend.balancedRate ? `均衡率 ${trend.balancedRate}%` : "",
    trend.monotonyDays ? `单一饮食 ${trend.monotonyDays} 天` : "",
  ].filter(Boolean);
  return items.join("，");
}

function readRecordText(record: Record<string, unknown>, keys: string[]) {
  return pickFirstString(keys.map((key) => record[key]));
}

function buildChildHighlightCandidates(params: {
  feed: ParentFeed;
  snapshot: ChildSuggestionSnapshot;
  latestInterventionCard?: InterventionCard | null;
  latestConsultation?: ConsultationResult | null;
}) {
  const todayGrowth = params.feed.todayGrowth[0];
  const warningSuggestion =
    params.feed.suggestions.find((item) => item.level === "warning") ??
    params.feed.suggestions[0];
  const consultation = normalizeConsultation(params.latestConsultation);
  const card = normalizeInterventionCard(params.latestInterventionCard);
  const latestFeedback = params.feed.latestFeedback ?? params.feed.recentFeedbacks[0];
  const trendSummary = summarizeTrend(params.feed.weeklyTrend);
  const topCategory = params.snapshot.summary.growth.topCategories[0]?.category;

  const candidates: ParentStoryBookHighlightCandidate[] = [];

  candidates.push({
    kind: "todayGrowth",
    title: todayGrowth?.category || topCategory || "今天的小进步",
    detail:
      (todayGrowth &&
        readRecordText(todayGrowth as unknown as Record<string, unknown>, [
          "description",
          "followUpAction",
          "category",
        ])) ||
      warningSuggestion?.description ||
      "今天出现了一点点值得被看见的成长变化。",
    priority: 1,
    source: "todayGrowth",
  });

  if (warningSuggestion) {
    candidates.push({
      kind: "warningSuggestion",
      title: warningSuggestion.title,
      detail: warningSuggestion.description,
      priority: 2,
      source: "suggestions",
    });
  }

  if (consultation?.summary) {
    candidates.push({
      kind: "consultationSummary",
      title: "近期建议",
      detail: consultation.summary,
      priority: 3,
      source: "latestConsultation",
    });
  }

  const consultationAction = pickFirstString([
    card?.tonightHomeAction,
    consultation?.homeAction,
    consultation?.followUp48h,
    latestFeedback?.content,
    latestFeedback?.childReaction,
  ]);
  if (consultationAction) {
    candidates.push({
      kind: "consultationAction",
      title: "今晚可以做的小事",
      detail: consultationAction,
      priority: 4,
      source: "interventionCard",
    });
  }

  const feedbackDetail = pickFirstString([
    latestFeedback?.content,
    latestFeedback?.childReaction,
    latestFeedback?.freeNote,
  ]);
  if (feedbackDetail) {
    candidates.push({
      kind: "guardianFeedback",
      title: "家长反馈",
      detail: feedbackDetail,
      priority: 5,
      source: "guardianFeedback",
    });
  }

  if (trendSummary) {
    candidates.push({
      kind: "weeklyTrend",
      title: "近一周趋势",
      detail: trendSummary,
      priority: 6,
      source: "weeklyTrend",
    });
  }

  const childTrait = pickFirstString([
    params.snapshot.summary.feedback.keywords[0],
    topCategory,
    params.snapshot.child.specialNotes,
  ]);
  if (childTrait) {
    candidates.push({
      kind: "childTrait",
      title: "孩子气质线索",
      detail: childTrait,
      priority: 7,
      source: "childTrait",
    });
  }

  return candidates
    .map((item) => ({
      ...item,
      detail: normalizeText(item.detail),
      title: normalizeText(item.title),
    }))
    .filter((item) => item.detail.length > 0)
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 6);
}

function buildThemeHighlightCandidates(input: {
  manualTheme?: string;
  manualPrompt?: string;
  goalKeywords?: string[];
}) {
  const manualTheme = normalizeText(input.manualTheme);
  const manualPrompt = normalizeText(input.manualPrompt);
  const goalKeywords = normalizeKeywords(input.goalKeywords);

  const candidates: ParentStoryBookHighlightCandidate[] = [];

  if (manualTheme) {
    candidates.push({
      kind: "manualTheme",
      title: `主题：${manualTheme}`,
      detail:
        manualPrompt ||
        `把“${manualTheme}”讲成孩子能听懂、家长愿意读、今晚就能用上的成长故事。`,
      priority: 1,
      source: "manualTheme",
    });
  }

  goalKeywords.forEach((keyword, index) => {
    candidates.push({
      kind: "goalKeyword",
      title: `关键词：${keyword}`,
      detail: `故事会把“${keyword}”落到一个能被孩子感受到的小动作里。`,
      priority: index + 2,
      source: "goalKeyword",
    });
  });

  if (!candidates.length && manualPrompt) {
    candidates.push({
      kind: "manualTheme",
      title: "主题设定",
      detail: manualPrompt,
      priority: 1,
      source: "manualTheme",
    });
  }

  return candidates;
}

function dedupeHighlights(candidates: ParentStoryBookHighlightCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [
      candidate.kind,
      normalizeText(candidate.title),
      normalizeText(candidate.detail),
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveStoryMode(input: {
  requestStoryMode?: ParentStoryBookMode | "auto";
  generationMode: ParentStoryBookGenerationMode;
  snapshot: ChildSuggestionSnapshot;
  highlightCandidates: ParentStoryBookHighlightCandidate[];
}) {
  if (input.requestStoryMode === "card") return "card";
  if (input.generationMode === "manual-theme" || input.generationMode === "hybrid") {
    return "storybook";
  }
  if (!input.highlightCandidates.length) return "card";
  if (
    input.snapshot.summary.growth.recordCount === 0 &&
    input.snapshot.summary.feedback.count === 0
  ) {
    return "card";
  }
  return "storybook";
}

function createSyntheticThemeRequest(input: {
  feed?: ParentFeed | null;
  generationMode: ParentStoryBookGenerationMode;
  manualTheme?: string;
  manualPrompt?: string;
  goalKeywords?: string[];
}) {
  const usesChildContext = input.generationMode !== "manual-theme" && Boolean(input.feed);
  return buildSyntheticSnapshot({
    childId: usesChildContext ? input.feed?.child.id : null,
    childName: usesChildContext ? input.feed?.child.name : "小朋友",
    className: usesChildContext ? input.feed?.child.className : undefined,
    theme: input.manualTheme,
    goalKeywords: input.goalKeywords,
    manualPrompt: input.manualPrompt,
  });
}

export function buildParentStoryBookRequestFromFeed(
  input: ParentStoryBookPayloadInput
): ParentStoryBookRequest {
  const generationMode = resolveGenerationMode({
    generationMode: input.generationMode,
    feed: input.feed,
    manualTheme: input.manualTheme,
  });
  const stylePreset = resolveParentStoryBookStylePreset(input.stylePreset);
  const styleMode = resolveParentStoryBookStyleMode(input.styleMode);
  const styleRecipe = buildCanonicalStylePrompt({
    styleMode,
    stylePreset,
    customStylePrompt: input.customStylePrompt,
    customStyleNegativePrompt: input.customStyleNegativePrompt,
    stylePrompt: input.stylePrompt,
  });
  const pageCount = resolveParentStoryBookPageCount(input.pageCount);
  const goalKeywords = normalizeKeywords(input.goalKeywords);
  const manualTheme = normalizeText(input.manualTheme);
  const manualPrompt = normalizeText(input.manualPrompt);

  const snapshot =
    input.feed && generationMode !== "manual-theme"
      ? buildParentChildSuggestionSnapshot(
          buildParentAgentChildContext({
            child: input.feed.child,
            smartInsights: input.feed.suggestions,
            healthCheckRecords: input.healthCheckRecords,
            mealRecords: input.mealRecords,
            growthRecords: input.growthRecords,
            guardianFeedbacks: input.guardianFeedbacks,
            taskCheckInRecords: input.taskCheckInRecords,
            weeklyTrend: input.feed.weeklyTrend,
            currentInterventionCard: input.latestInterventionCard ?? undefined,
          })
        )
      : createSyntheticThemeRequest({
          feed: input.feed,
          generationMode,
          manualTheme,
          manualPrompt,
          goalKeywords,
        });

  const childHighlights =
    input.feed && generationMode !== "manual-theme"
      ? buildChildHighlightCandidates({
          feed: input.feed,
          snapshot,
          latestInterventionCard: input.latestInterventionCard,
          latestConsultation: input.latestConsultation,
        })
      : [];
  const themeHighlights = buildThemeHighlightCandidates({
    manualTheme,
    manualPrompt,
    goalKeywords,
  });

  const highlightCandidates = dedupeHighlights(
    generationMode === "child-personalized"
      ? childHighlights
      : generationMode === "manual-theme"
        ? themeHighlights
        : [...themeHighlights, ...childHighlights]
  );

  return {
    childId:
      generationMode === "manual-theme"
        ? undefined
        : input.feed?.child.id ?? snapshot.child.id ?? undefined,
    storyMode: input.storyMode ?? "storybook",
    generationMode,
    manualTheme: manualTheme || undefined,
    manualPrompt: manualPrompt || undefined,
    pageCount,
    goalKeywords,
    protagonistArchetype: normalizeText(input.protagonistArchetype) || undefined,
    requestSource: input.requestSource ?? "parent-storybook-page",
    stylePreset,
    styleMode,
    customStylePrompt: styleRecipe.customPrompt,
    customStyleNegativePrompt: styleRecipe.customNegativePrompt,
    stylePrompt: styleRecipe.prompt,
    snapshot,
    highlightCandidates,
    latestInterventionCard: input.latestInterventionCard ? { ...input.latestInterventionCard } : null,
    latestConsultation: input.latestConsultation ? { ...input.latestConsultation } : null,
    traceId: input.traceId,
    debugMemory: input.debugMemory,
  };
}

function resolveFocusTheme(input: {
  generationMode: ParentStoryBookGenerationMode;
  manualTheme?: string;
  goalKeywords?: string[];
  snapshot: ChildSuggestionSnapshot;
  highlightCandidates: ParentStoryBookHighlightCandidate[];
}) {
  return pickFirstString([
    input.manualTheme,
    input.goalKeywords?.[0],
    input.snapshot.summary.growth.topCategories[0]?.category,
    input.snapshot.summary.feedback.keywords[0],
    input.highlightCandidates[0]?.title,
    STORYBOOK_FOCUS_FALLBACK,
  ]);
}

function resolveProtagonistArchetype(input: {
  requested?: string;
  focusTheme: string;
  childName: string;
  childHints: string[];
}) {
  const requested = normalizeText(input.requested);
  const explicit = PROTAGONIST_DEFINITIONS.find(
    (item) => item.archetype === requested
  );
  if (explicit) return explicit;

  const seed = [
    requested,
    input.focusTheme,
    input.childName,
    input.childHints.join("|"),
  ].join("::");
  const index =
    Number.parseInt(stableHash(seed).slice(0, 4), 16) %
    PROTAGONIST_DEFINITIONS.length;
  return PROTAGONIST_DEFINITIONS[index];
}

function buildParentNote(input: {
  childName: string;
  storyMode: ParentStoryBookMode;
  tonightAction: string;
  tomorrowObservation: string;
  generationMode: ParentStoryBookGenerationMode;
}) {
  if (input.storyMode === "card") {
    return `${input.childName} 今晚先用一张轻量成长卡收束情绪，再把最亮的一点小进步说给孩子听。`;
  }

  if (input.generationMode === "manual-theme") {
    return `今晚可以先试一件小事：${input.tonightAction}。明天继续观察：${input.tomorrowObservation}。`;
  }

  return `${input.childName} 今晚可以先试一件小事：${input.tonightAction}。明天继续观察：${input.tomorrowObservation}。`;
}

function buildMoral(input: {
  protagonistName: string;
  focusTheme: string;
  summaryHighlight: string;
}) {
  return `${input.protagonistName} 记住的，不是“要快一点”，而是“原来我可以慢慢学会 ${input.focusTheme}”。那些被看见的 ${input.summaryHighlight}，会一点点变成真正的力量。`;
}

function buildStoryIngredients(request: ParentStoryBookRequest) {
  const generationMode =
    request.generationMode ?? DEFAULT_PARENT_STORYBOOK_GENERATION_MODE;
  const pageCount = resolveParentStoryBookPageCount(request.pageCount);
  const focusTheme = resolveFocusTheme({
    generationMode,
    manualTheme: request.manualTheme,
    goalKeywords: request.goalKeywords,
    snapshot: request.snapshot,
    highlightCandidates: request.highlightCandidates,
  });
  const childName = normalizeText(request.snapshot.child.name) || "小朋友";
  const className = normalizeText(request.snapshot.child.className) || undefined;
  const consultation = normalizeConsultation(request.latestConsultation ?? null);
  const interventionCard = normalizeInterventionCard(request.latestInterventionCard ?? null);
  const highlightCandidates = request.highlightCandidates
    .map((item) => ({
      ...item,
      title: normalizeText(item.title),
      detail: normalizeText(item.detail),
      source: normalizeText(item.source) || item.kind,
    }))
    .filter((item) => item.detail.length > 0)
    .sort((left, right) => left.priority - right.priority);
  const summaryHighlight = shortenDetail(
    highlightCandidates[0]?.detail,
    "被轻轻看见的小进步"
  );
  const supportDetail = shortenDetail(
    pickFirstString([
      highlightCandidates.find((item) => item.kind === "consultationAction")?.detail,
      highlightCandidates.find((item) => item.kind === "guardianFeedback")?.detail,
      consultation?.summary,
      consultation?.schoolAction,
    ]),
    "大人把节奏放慢一点，先接住情绪，再陪它继续往前。"
  );
  const attemptDetail = shortenDetail(
    pickFirstString([
      highlightCandidates.find((item) => item.kind === "warningSuggestion")?.detail,
      highlightCandidates.find((item) => item.kind === "consultationSummary")?.detail,
      highlightCandidates[1]?.detail,
    ]),
    "先试一个小动作，再把脚步放稳。"
  );
  const successDetail = shortenDetail(
    pickFirstString([
      highlightCandidates.find((item) => item.kind === "todayGrowth")?.detail,
      highlightCandidates.find((item) => item.kind === "guardianFeedback")?.detail,
      highlightCandidates[2]?.detail,
    ]),
    "原来一点点靠近，也是在认真长大。"
  );
  const challengeDetail = shortenDetail(
    pickFirstString([
      highlightCandidates.find((item) => item.kind === "warningSuggestion")?.detail,
      highlightCandidates[0]?.detail,
      request.manualPrompt,
    ]),
    "面对新的小关卡时，心里还是会轻轻打鼓。"
  );
  const wobbleDetail = shortenDetail(
    pickFirstString([
      highlightCandidates.find((item) => item.kind === "weeklyTrend")?.detail,
      consultation?.summary,
      request.manualPrompt,
    ]),
    "有一点摇晃很正常，停一停，再出发就好。"
  );
  const tonightAction = pickFirstString([
    interventionCard?.tonightHomeAction,
    consultation?.homeAction,
    highlightCandidates.find((item) => item.kind === "consultationAction")?.detail,
    `和孩子一起做一个关于“${focusTheme}”的小练习`,
  ]);
  const tomorrowObservation = pickFirstString([
    interventionCard?.tomorrowObservationPoint,
    interventionCard?.reviewIn48h,
    consultation?.followUp48h,
    highlightCandidates.find((item) => item.kind === "weeklyTrend")?.detail,
    `明天再看看孩子遇到“${focusTheme}”时会不会更从容一点`,
  ]);
  const childHints = [
    request.snapshot.summary.feedback.keywords[0] ?? "",
    request.snapshot.summary.growth.topCategories[0]?.category ?? "",
    request.snapshot.child.specialNotes ?? "",
  ].filter(Boolean);
  const protagonist = resolveProtagonistArchetype({
    requested: request.protagonistArchetype,
    focusTheme,
    childName,
    childHints,
  });
  const styleRecipe = buildCanonicalStylePrompt({
    styleMode: request.styleMode,
    stylePreset: request.stylePreset,
    customStylePrompt: request.customStylePrompt,
    customStyleNegativePrompt: request.customStyleNegativePrompt,
    stylePrompt: request.stylePrompt,
  });
  const storyMode = resolveStoryMode({
    requestStoryMode: request.storyMode,
    generationMode,
    snapshot: request.snapshot,
    highlightCandidates,
  });
  const parentNote = buildParentNote({
    childName,
    storyMode,
    tonightAction,
    tomorrowObservation,
    generationMode,
  });

  return {
    childName,
    className,
    focusTheme,
    goalKeywords: normalizeKeywords(request.goalKeywords),
    protagonist,
    protagonistArchetype: protagonist.archetype,
    protagonistName: protagonist.label,
    generationMode,
    pageCount,
    highlightCandidates,
    summaryHighlight,
    challengeDetail,
    supportDetail,
    attemptDetail,
    successDetail,
    wobbleDetail,
    tonightAction,
    tomorrowObservation,
    promptHint: normalizeText(request.manualPrompt),
    parentNote,
    styleRecipe,
    stylePrompt: styleRecipe.prompt,
    storyMode,
  } satisfies StoryIngredients;
}

function buildSceneVoiceStyle(stage: StoryStage) {
  if (stage === "landing") return "gentle-bedtime";
  if (stage === "challenge" || stage === "wobble") return "warm-storytelling";
  return "calm-encouraging";
}

function selectHighlight(
  candidates: ParentStoryBookHighlightCandidate[],
  index: number,
  fallbackTitle: string,
  fallbackDetail: string
) {
  const candidate = candidates[index] ?? candidates[candidates.length - 1];
  if (candidate) return candidate;
  return {
    kind: "weeklyTrend" as ParentStoryBookHighlightKind,
    title: fallbackTitle,
    detail: fallbackDetail,
    priority: 99,
    source: "rule",
  };
}

function buildSceneTitleV2(stage: StoryStage) {
  switch (stage) {
    case "opening":
      return "月光翻开第一页";
    case "setup":
      return "小脚步在路上";
    case "challenge":
      return "遇到一点点难";
    case "support":
      return "有人轻轻托住它";
    case "attempt":
      return "它决定再试一下";
    case "wobble":
      return "风吹来时先停一停";
    case "small-success":
      return "小小光亮出现了";
    case "landing":
      return "把温柔带回今晚";
  }
}

function buildStageGoalV2(stage: StoryStage) {
  switch (stage) {
    case "opening":
      return "建立温柔开场，让孩子先感到被看见";
    case "setup":
      return "把节奏放慢，让故事进入可尝试的状态";
    case "challenge":
      return "呈现眼前的小挑战，但不责备";
    case "support":
      return "让支持先出现，稳定情绪";
    case "attempt":
      return "把行动拆成最小的一步";
    case "wobble":
      return "承认波动正常，让孩子可以停一停";
    case "small-success":
      return "让孩子看见已经发生的小成功";
    case "landing":
      return "落到今晚行动和明天观察，形成成长闭环";
  }
}

function buildSceneEnvironmentV2(stage: StoryStage, ingredients: StoryIngredients) {
  const classHint = ingredients.className
    ? `${ingredients.className}旁的故事角`
    : "柔软安静的故事角";

  switch (stage) {
    case "opening":
      return `${classHint}和暖暖窗边`;
    case "setup":
      return "铺着浅色地毯的小路口";
    case "challenge":
      return "要迈出一步的小门前";
    case "support":
      return "有抱抱和轻声提醒的陪伴角";
    case "attempt":
      return "留着一束小光的练习地毯";
    case "wobble":
      return "可以先停下来深呼吸的安静角落";
    case "small-success":
      return "冒出一点点光亮的林间小路";
    case "landing":
      return "睡前灯光柔柔的小房间";
  }
}

function buildSceneEmotionV2(stage: StoryStage) {
  switch (stage) {
    case "opening":
      return "安心又期待";
    case "setup":
      return "慢慢稳下来";
    case "challenge":
      return "有点犹豫，但还想试试";
    case "support":
      return "被接住、被陪伴";
    case "attempt":
      return "鼓起一点点勇气";
    case "wobble":
      return "轻轻摇晃，但没有放弃";
    case "small-success":
      return "惊喜、亮起来";
    case "landing":
      return "安定、适合睡前";
  }
}

function buildSceneVisibleActionV2(stage: StoryStage, ingredients: StoryIngredients) {
  switch (stage) {
    case "opening":
      return `${ingredients.protagonist.label}抱着今天的小亮点，轻轻看向前方`;
    case "setup":
      return `${ingredients.protagonist.label}先停一停，再把脚步放轻`;
    case "challenge":
      return `${ingredients.protagonist.label}站在小挑战前，耳朵和尾巴都慢下来`;
    case "support":
      return `一只温柔的大手递来陪伴，${ingredients.protagonist.label}慢慢靠近`;
    case "attempt":
      return `${ingredients.protagonist.label}先做一个最小的动作`;
    case "wobble":
      return `${ingredients.protagonist.label}先抱抱自己，再重新出发`;
    case "small-success":
      return `${ingredients.protagonist.label}抬起头，发现自己已经往前走了一小步`;
    case "landing":
      return `${ingredients.protagonist.label}把今晚的小动作收进睡前仪式`;
  }
}

function buildSceneNarrativeAnchorV2(
  stage: StoryStage,
  ingredients: StoryIngredients,
  highlight: ParentStoryBookHighlightCandidate
) {
  const boundDetail =
    normalizeText(highlight.detail) ||
    (stage === "landing" ? ingredients.tonightAction : ingredients.summaryHighlight);
  const themeAnchor =
    stage === "landing"
      ? `主题“${ingredients.focusTheme}”，今晚行动“${ingredients.tonightAction}”，明天观察“${ingredients.tomorrowObservation}”`
      : `主题“${ingredients.focusTheme}”，本页绑定“${boundDetail}”`;

  if (ingredients.generationMode === "hybrid" && stage !== "landing") {
    return `${themeAnchor}，孩子线索“${boundDetail}”`;
  }

  return themeAnchor;
}

function truncateSceneCueV2(value: string, fallback: string, limit = 28) {
  const text = normalizeText(value) || fallback;
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(limit - 3, 1)).trimEnd()}...`;
}

function buildVisualAnchorV2(
  stage: StoryStage,
  ingredients: StoryIngredients,
  highlight: ParentStoryBookHighlightCandidate
) {
  const sceneTitle = buildSceneTitleV2(stage);
  const sceneGoal = buildStageGoalV2(stage);
  const highlightTitle = truncateSceneCueV2(normalizeText(highlight.title), sceneTitle, 18);
  const highlightDetail = truncateSceneCueV2(
    normalizeText(highlight.detail),
    stage === "landing" ? ingredients.tonightAction : ingredients.summaryHighlight,
    20
  );
  const generationModeLabel =
    ingredients.generationMode === "child-personalized"
      ? "成长线索驱动"
      : ingredients.generationMode === "hybrid"
        ? "混合线索驱动"
        : "主题线索驱动";
  return `${sceneTitle} / ${sceneGoal} / ${ingredients.focusTheme} / ${highlightTitle} / ${highlightDetail} / ${generationModeLabel}`;
}

function buildSceneObjectCueV2(
  stage: StoryStage,
  ingredients: StoryIngredients,
  highlight: ParentStoryBookHighlightCandidate
) {
  const mapping: Record<StoryStage, string> = {
    opening: normalizeText(highlight.title) || ingredients.focusTheme,
    setup: normalizeText(highlight.detail) || ingredients.summaryHighlight,
    challenge: ingredients.challengeDetail,
    support: ingredients.supportDetail,
    attempt: ingredients.attemptDetail,
    wobble: ingredients.wobbleDetail,
    "small-success": ingredients.successDetail,
    landing: ingredients.tonightAction,
  };
  return truncateSceneCueV2(mapping[stage], ingredients.focusTheme);
}

function buildSupportCharacterCueV2(
  stage: StoryStage,
  ingredients: StoryIngredients,
  highlight: ParentStoryBookHighlightCandidate
) {
  const highlightTitle = normalizeText(highlight.title) || ingredients.focusTheme;
  if (stage === "support" || stage === "landing") {
    return truncateSceneCueV2(`轻声陪伴的大人围绕“${highlightTitle}”给出回应`, "轻声陪伴的大人");
  }
  if (ingredients.generationMode === "hybrid") {
    return truncateSceneCueV2(`把最近线索“${highlightTitle}”接进这一页`, "最近被看见的成长线索");
  }
  return truncateSceneCueV2(`让场景里的小伙伴回应“${highlightTitle}”`, "回应主题的小伙伴");
}

function buildActivityCueV2(
  stage: StoryStage,
  ingredients: StoryIngredients,
  highlight: ParentStoryBookHighlightCandidate
) {
  const actionTail =
    stage === "attempt" || stage === "small-success" || stage === "landing"
      ? ingredients.tonightAction
      : normalizeText(highlight.detail) || ingredients.summaryHighlight;
  return truncateSceneCueV2(
    `${buildSceneVisibleActionV2(stage, ingredients)}；${actionTail}`,
    buildSceneVisibleActionV2(stage, ingredients),
    34
  );
}

function buildEmotionCueV2(stage: StoryStage) {
  return truncateSceneCueV2(
    `${buildSceneEmotionV2(stage)}；${buildStageGoalV2(stage)}`,
    buildSceneEmotionV2(stage),
    30
  );
}

function buildTaskCueV2(stage: StoryStage, ingredients: StoryIngredients) {
  if (stage === "landing") {
    return truncateSceneCueV2(
      `今晚先做：${ingredients.tonightAction}；明天观察：${ingredients.tomorrowObservation}`,
      ingredients.tonightAction,
      34
    );
  }
  if (stage === "attempt" || stage === "small-success") {
    return truncateSceneCueV2(
      `这一页先练：${ingredients.tonightAction}`,
      ingredients.tonightAction,
      28
    );
  }
  return truncateSceneCueV2(
    `把“${ingredients.focusTheme}”往明天延续：${ingredients.tomorrowObservation}`,
    ingredients.tomorrowObservation,
    34
  );
}

function buildSceneBlueprintV2(
  stage: StoryStage,
  index: number,
  ingredients: StoryIngredients
): SceneBlueprint {
  const fallbackDetail =
    stage === "landing" ? ingredients.tonightAction : ingredients.summaryHighlight;
  const highlight = selectHighlight(
    ingredients.highlightCandidates,
    index,
    buildSceneTitleV2(stage),
    fallbackDetail
  );
  const visualAnchor = buildVisualAnchorV2(stage, ingredients, highlight);
  const sceneObjectCue = buildSceneObjectCueV2(stage, ingredients, highlight);
  const supportCharacterCue = buildSupportCharacterCueV2(stage, ingredients, highlight);
  const activityCue = buildActivityCueV2(stage, ingredients, highlight);
  const emotionCue = buildEmotionCueV2(stage);
  const taskCue = buildTaskCueV2(stage, ingredients);
  const negativePrompt = buildStoryImageNegativePrompt(ingredients.styleRecipe.negativePrompt);

  return {
    pageIndex: index + 1,
    stage,
    sceneTitle: buildSceneTitleV2(stage),
    sceneGoal: buildStageGoalV2(stage),
    protagonist: ingredients.protagonist,
    environment: buildSceneEnvironmentV2(stage, ingredients),
    visibleAction: buildSceneVisibleActionV2(stage, ingredients),
    emotion: buildSceneEmotionV2(stage),
    mustInclude: [
      visualAnchor,
      sceneObjectCue,
      supportCharacterCue,
      activityCue,
    ].filter(Boolean),
    avoid: [
      "真实孩子正脸",
      "照片感",
      "复杂背景",
      "成人化",
      ...splitPromptClauses(negativePrompt),
    ],
    narrativeAnchor: buildSceneNarrativeAnchorV2(stage, ingredients, highlight),
    highlightSource: normalizeText(highlight.source) || highlight.kind,
    voiceStyle: buildSceneVoiceStyle(stage),
    visualAnchor,
    sceneObjectCue,
    supportCharacterCue,
    activityCue,
    emotionCue,
    taskCue,
  };
}

function buildSceneTextV2(blueprint: SceneBlueprint, ingredients: StoryIngredients) {
  const protagonistName = blueprint.protagonist.label;
  switch (blueprint.stage) {
    case "opening":
      return `${protagonistName}来到${blueprint.environment}。今天，它想练习“${ingredients.focusTheme}”。${ingredients.summaryHighlight}。`;
    case "setup":
      return `${protagonistName}没有急着往前跑，而是先看一看、停一停。慢一点，也是在认真长大。`;
    case "challenge":
      return `当新的小难题出现时，${protagonistName}有一点紧张。${ingredients.challengeDetail}。`;
    case "support":
      return `这时，大人没有催它，只是轻轻陪着它。${ingredients.supportDetail}。`;
    case "attempt":
      return `${protagonistName}决定先做一个最小的动作。${ingredients.attemptDetail}。`;
    case "wobble":
      return `中间有一点摇晃也没关系。${ingredients.wobbleDetail}。`;
    case "small-success":
      return `${protagonistName}慢慢发现，自己真的做到了。${ingredients.successDetail}。`;
    case "landing":
      return `今晚先做一件小事：${ingredients.tonightAction}。明天继续看看${ingredients.tomorrowObservation}。`;
  }
}

function buildSceneAudioScriptV2(blueprint: SceneBlueprint, sceneText: string) {
  if (blueprint.stage === "landing") {
    return `${blueprint.sceneTitle}。${sceneText}`;
  }
  return `${blueprint.sceneTitle}。${sceneText}。这一页想记住的是：${blueprint.narrativeAnchor}。`;
}

function buildSceneImagePromptV2(
  blueprint: SceneBlueprint,
  ingredients: StoryIngredients
) {
  const negativePrompt = buildStoryImageNegativePrompt(
    blueprint.avoid.join("、"),
    ingredients.styleRecipe.negativePrompt
  );
  return [
    ingredients.styleRecipe.prompt,
    "儿童成长绘本场景插画，纯画面叙事，只表现角色、场景、动作与情绪",
    `成长主题氛围：${ingredients.focusTheme}`,
    `主角设定：拟人${blueprint.protagonist.archetype}小动物，视觉特征${blueprint.protagonist.visualCue}`,
    `场景地点：${blueprint.environment}`,
    `动作：${blueprint.visibleAction}`,
    `情绪与表情：${blueprint.emotion}`,
    `画面焦点：${blueprint.visualAnchor}`,
    `关键道具：${blueprint.sceneObjectCue}`,
    `陪伴关系：${blueprint.supportCharacterCue}`,
    `活动线索：${blueprint.activityCue}`,
    `情绪线索：${blueprint.emotionCue}`,
    `收尾动作：${blueprint.taskCue}`,
    "构图：主角明确，前景简洁，背景克制，突出人物关系与动作瞬间",
    `严格禁止任何文字元素：${negativePrompt}`,
  ].join("；");
}

function resolveDemoArtArchetype(archetype: string) {
  return PROTAGONIST_DEFINITIONS.some((item) => item.archetype === archetype)
    ? archetype
    : "bunny";
}

function splitCaptionSegmentsV2(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const segments = normalized
    .split(/(?<=[。！？!?])/u)
    .map((item) => item.trim())
    .filter(Boolean);

  if (segments.length > 0) return segments;

  return normalized
    .split(/[，,；;：:]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCaptionDurationMsV2(segment: string) {
  const contentLength = segment.replace(/\s+/g, "").length;
  const punctuationCount = segment.match(/[，,；;：:。！？!?]/gu)?.length ?? 0;
  return Math.max(2400, 1700 + contentLength * 95 + punctuationCount * 220);
}

function buildSceneCaptionTimingV2(text: string): SceneCaptionTiming {
  const segmentTexts = splitCaptionSegmentsV2(text);
  const safeSegments = segmentTexts.length > 0 ? segmentTexts : [text.trim()].filter(Boolean);
  return {
    mode: "duration-derived",
    segmentTexts: safeSegments,
    segmentDurationsMs: safeSegments.map((segment) => buildCaptionDurationMsV2(segment)),
  };
}

function buildDemoArtBlueprintV2(blueprint: SceneBlueprint): DemoArtBlueprint {
  switch (blueprint.stage) {
    case "opening":
      return {
        environmentFamily: "meadow",
        cameraLayout: "wide",
        pose: "wave",
        expression: "curious",
        prop: "spark",
        accentEffect: "glow",
      };
    case "setup":
      return {
        environmentFamily: "path",
        cameraLayout: "wide",
        pose: "observe",
        expression: "calm",
        prop: "path",
        accentEffect: "breeze",
      };
    case "challenge":
      return {
        environmentFamily: "doorway",
        cameraLayout: "focused",
        pose: "hesitate",
        expression: "shy",
        prop: "door",
        accentEffect: "ripple",
      };
    case "support":
      return {
        environmentFamily: "reading-nook",
        cameraLayout: "focused",
        pose: "lean-in",
        expression: "supported",
        prop: "lantern",
        accentEffect: "glow",
      };
    case "attempt":
      return {
        environmentFamily: "path",
        cameraLayout: "focused",
        pose: "step-forward",
        expression: "brave",
        prop: "star",
        accentEffect: "breeze",
      };
    case "wobble":
      return {
        environmentFamily: "path",
        cameraLayout: "focused",
        pose: "breathe",
        expression: "wobbly",
        prop: "heart",
        accentEffect: "ripple",
      };
    case "small-success":
      return {
        environmentFamily: "meadow",
        cameraLayout: "close",
        pose: "celebrate",
        expression: "bright",
        prop: "spark",
        accentEffect: "confetti",
      };
    case "landing":
      return {
        environmentFamily: "sleepy-room",
        cameraLayout: "close",
        pose: "curl-up",
        expression: "sleepy",
        prop: "moon",
        accentEffect: "glow",
      };
  }
}

function escapeSvgTextV2(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderDemoBackdropV2(
  blueprint: SceneBlueprint,
  ingredients: StoryIngredients,
  demo: DemoArtBlueprint
) {
  const palette = ingredients.styleRecipe.palette;
  const styleFamily = resolveDemoStyleFamily(ingredients.styleRecipe);
  const sunColor =
    demo.environmentFamily === "sleepy-room"
      ? "#fff7d6"
      : styleFamily === "moonlit-cutout"
        ? "#f8fafc"
        : "#fff3bf";
  const stageGlow =
    demo.accentEffect === "confetti"
      ? `<circle cx="690" cy="200" r="126" fill="${palette.accent}" opacity="0.20" />
         <circle cx="250" cy="220" r="82" fill="${palette.chip}" opacity="0.34" />`
      : demo.accentEffect === "ripple"
        ? `<ellipse cx="690" cy="220" rx="140" ry="86" fill="${palette.chip}" opacity="0.40" />
           <ellipse cx="690" cy="220" rx="188" ry="122" fill="${palette.chip}" opacity="0.18" />`
        : `<circle cx="690" cy="190" r="110" fill="${sunColor}" opacity="0.88" />
           <circle cx="212" cy="182" r="56" fill="#ffffff" opacity="0.26" />`;

  const environmentArt =
    demo.environmentFamily === "doorway"
      ? `<path d="M184 950C250 846 340 756 450 680C558 608 648 560 728 542" stroke="#fff7ef" stroke-width="92" stroke-linecap="round" opacity="0.85" />
         <rect x="618" y="330" width="140" height="310" rx="62" fill="#fff7ef" opacity="0.88" />
         <rect x="650" y="378" width="76" height="228" rx="38" fill="${palette.accent}" opacity="0.42" />`
      : demo.environmentFamily === "reading-nook"
        ? `<rect x="124" y="286" width="212" height="182" rx="42" fill="#fff7ef" opacity="0.84" />
           <rect x="584" y="302" width="188" height="156" rx="34" fill="#ffffff" opacity="0.66" />
           <rect x="202" y="640" width="494" height="176" rx="88" fill="#fffaf3" opacity="0.88" />`
        : demo.environmentFamily === "sleepy-room"
          ? `<rect x="150" y="244" width="600" height="498" rx="54" fill="#fffaf3" opacity="0.78" />
             <rect x="202" y="302" width="156" height="156" rx="28" fill="#dbeafe" opacity="0.72" />
             <rect x="198" y="744" width="520" height="122" rx="52" fill="#fef3c7" opacity="0.72" />`
          : demo.environmentFamily === "path"
            ? `<path d="M162 968C238 866 330 780 438 720C554 654 642 618 748 596" stroke="#fff9ef" stroke-width="98" stroke-linecap="round" opacity="0.84" />
               <ellipse cx="286" cy="864" rx="186" ry="72" fill="#9ad48e" opacity="0.42" />
               <ellipse cx="682" cy="762" rx="220" ry="82" fill="#f6d694" opacity="0.34" />`
            : `<ellipse cx="452" cy="708" rx="488" ry="196" fill="#9ad48e" opacity="0.56" />
               <ellipse cx="666" cy="816" rx="266" ry="110" fill="#f6d694" opacity="0.38" />
               <ellipse cx="238" cy="840" rx="220" ry="98" fill="#b8e3a2" opacity="0.44" />`;

  const props =
    demo.prop === "door"
      ? `<path d="M648 430C648 388 680 352 720 352" stroke="${palette.text}" stroke-width="12" stroke-linecap="round" opacity="0.54" />`
      : demo.prop === "lantern"
        ? `<circle cx="222" cy="372" r="34" fill="#fff1bf" opacity="0.94" />
           <rect x="212" y="334" width="20" height="86" rx="10" fill="${palette.accent}" opacity="0.64" />`
        : demo.prop === "moon"
          ? `<path d="M706 118C668 154 664 214 700 252C642 248 594 202 594 144C594 84 644 36 706 36C728 36 748 42 766 52C744 64 724 86 706 118Z" fill="#fff7d6" opacity="0.82" />`
          : demo.prop === "star"
            ? `<path d="M676 332L690 366L724 366L698 386L708 420L676 400L644 420L654 386L628 366L662 366Z" fill="#fff7d6" opacity="0.92" />`
            : demo.prop === "heart"
              ? `<path d="M690 352C690 326 670 308 648 308C630 308 614 318 606 334C598 318 582 308 564 308C542 308 522 326 522 352C522 404 606 446 606 446C606 446 690 404 690 352Z" fill="#fca5a5" opacity="0.72" />`
              : `<circle cx="666" cy="320" r="28" fill="#fff7d6" opacity="0.88" />`;

  return `
  <rect width="900" height="1200" rx="56" fill="url(#storybook-bg-${blueprint.pageIndex})" />
  ${stageGlow}
  ${environmentArt}
  ${props}
  <rect y="0" width="900" height="1200" rx="56" fill="url(#storybook-wash-${blueprint.pageIndex})" opacity="0.18" />
  `;
}

function renderDemoAccentV2(
  blueprint: SceneBlueprint,
  ingredients: StoryIngredients,
  demo: DemoArtBlueprint
) {
  const accent = ingredients.styleRecipe.palette.accent;
  if (demo.accentEffect === "confetti") {
    return `
    <circle cx="164" cy="246" r="10" fill="${accent}" opacity="0.72" />
    <circle cx="214" cy="228" r="7" fill="${accent}" opacity="0.52" />
    <circle cx="746" cy="284" r="9" fill="${accent}" opacity="0.74" />
    <circle cx="708" cy="246" r="6" fill="${accent}" opacity="0.54" />
    `;
  }
  if (demo.accentEffect === "ripple") {
    return `
    <path d="M192 930C252 892 320 872 396 872" stroke="${accent}" stroke-width="10" stroke-linecap="round" opacity="0.34" />
    <path d="M506 904C580 860 660 840 736 840" stroke="${accent}" stroke-width="10" stroke-linecap="round" opacity="0.28" />
    `;
  }
  if (demo.accentEffect === "breeze") {
    return `
    <path d="M134 318C204 286 270 286 332 320" stroke="${accent}" stroke-width="8" stroke-linecap="round" opacity="0.26" />
    <path d="M602 274C666 246 730 250 782 286" stroke="${accent}" stroke-width="8" stroke-linecap="round" opacity="0.26" />
    `;
  }
  return `
  <circle cx="210" cy="290" r="34" fill="${accent}" opacity="0.16" />
  <circle cx="708" cy="260" r="28" fill="${accent}" opacity="0.14" />
  `;
}

function renderProtagonistSvgV2(
  blueprint: SceneBlueprint,
  ingredients: StoryIngredients,
  demo: DemoArtBlueprint
) {
  const archetype = resolveDemoArtArchetype(blueprint.protagonist.archetype);
  const bodyColor =
    archetype === "bear"
      ? "#8c6b4f"
      : archetype === "fox"
        ? "#d97706"
        : archetype === "deer"
          ? "#a16207"
          : archetype === "otter"
            ? "#7c6f64"
            : "#f8fafc";
  const bodyStroke = archetype === "bunny" ? "#94a3b8" : "#4b3a2c";
  const bellyColor = archetype === "fox" ? "#ffedd5" : "#efe3d1";
  const centerX =
    demo.cameraLayout === "wide" ? 452 : demo.cameraLayout === "focused" ? 468 : 486;
  const centerY =
    demo.cameraLayout === "wide" ? 742 : demo.cameraLayout === "focused" ? 764 : 788;
  const bodyScale =
    demo.cameraLayout === "wide" ? 0.86 : demo.cameraLayout === "focused" ? 0.96 : 1.04;
  const headY = centerY - 170 * bodyScale;
  const bodyY = centerY;
  const eyeY = headY + 12;
  const mouthY = headY + 46;
  const armLift =
    demo.pose === "wave" || demo.pose === "celebrate"
      ? 42
      : demo.pose === "lean-in"
        ? 18
        : demo.pose === "hesitate"
          ? -6
          : 12;
  const leftArmEndX = centerX - 72 * bodyScale;
  const leftArmEndY = bodyY - 32 * bodyScale - armLift;
  const rightArmEndX = centerX + 72 * bodyScale;
  const rightArmEndY =
    bodyY - 30 * bodyScale - (demo.pose === "step-forward" ? 26 : armLift * 0.7);
  const legSpread = demo.pose === "step-forward" ? 34 : demo.pose === "curl-up" ? 12 : 24;
  const mouthPath =
    demo.expression === "bright"
      ? `M${centerX - 22 * bodyScale} ${mouthY}C${centerX - 8 * bodyScale} ${mouthY + 18 * bodyScale},${centerX + 8 * bodyScale} ${mouthY + 18 * bodyScale},${centerX + 22 * bodyScale} ${mouthY}`
      : demo.expression === "shy" || demo.expression === "wobbly"
        ? `M${centerX - 12 * bodyScale} ${mouthY + 6 * bodyScale}C${centerX - 2 * bodyScale} ${mouthY - 6 * bodyScale},${centerX + 4 * bodyScale} ${mouthY - 6 * bodyScale},${centerX + 12 * bodyScale} ${mouthY + 4 * bodyScale}`
        : `M${centerX - 16 * bodyScale} ${mouthY}C${centerX - 6 * bodyScale} ${mouthY + 8 * bodyScale},${centerX + 6 * bodyScale} ${mouthY + 8 * bodyScale},${centerX + 16 * bodyScale} ${mouthY}`;
  const ears =
    archetype === "bunny"
      ? `<ellipse cx="${centerX - 48 * bodyScale}" cy="${headY - 86 * bodyScale}" rx="${18 * bodyScale}" ry="${82 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />
         <ellipse cx="${centerX + 48 * bodyScale}" cy="${headY - 86 * bodyScale}" rx="${18 * bodyScale}" ry="${82 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />
         <ellipse cx="${centerX - 48 * bodyScale}" cy="${headY - 96 * bodyScale}" rx="${8 * bodyScale}" ry="${44 * bodyScale}" fill="#fecdd3" opacity="0.74" />
         <ellipse cx="${centerX + 48 * bodyScale}" cy="${headY - 96 * bodyScale}" rx="${8 * bodyScale}" ry="${44 * bodyScale}" fill="#fecdd3" opacity="0.74" />`
      : archetype === "bear"
        ? `<circle cx="${centerX - 54 * bodyScale}" cy="${headY - 44 * bodyScale}" r="${28 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />
           <circle cx="${centerX + 54 * bodyScale}" cy="${headY - 44 * bodyScale}" r="${28 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />`
        : archetype === "deer"
          ? `<circle cx="${centerX - 48 * bodyScale}" cy="${headY - 40 * bodyScale}" r="${24 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />
             <circle cx="${centerX + 48 * bodyScale}" cy="${headY - 40 * bodyScale}" r="${24 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />
             <path d="M${centerX - 34 * bodyScale} ${headY - 68 * bodyScale}C${centerX - 52 * bodyScale} ${headY - 122 * bodyScale},${centerX - 74 * bodyScale} ${headY - 134 * bodyScale},${centerX - 88 * bodyScale} ${headY - 170 * bodyScale}" stroke="${bodyStroke}" stroke-width="${6 * bodyScale}" stroke-linecap="round" />
             <path d="M${centerX + 34 * bodyScale} ${headY - 68 * bodyScale}C${centerX + 52 * bodyScale} ${headY - 122 * bodyScale},${centerX + 74 * bodyScale} ${headY - 134 * bodyScale},${centerX + 88 * bodyScale} ${headY - 170 * bodyScale}" stroke="${bodyStroke}" stroke-width="${6 * bodyScale}" stroke-linecap="round" />`
          : archetype === "fox"
            ? `<polygon points="${centerX - 70 * bodyScale},${headY - 24 * bodyScale} ${centerX - 30 * bodyScale},${headY - 94 * bodyScale} ${centerX - 8 * bodyScale},${headY - 10 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />
               <polygon points="${centerX + 70 * bodyScale},${headY - 24 * bodyScale} ${centerX + 30 * bodyScale},${headY - 94 * bodyScale} ${centerX + 8 * bodyScale},${headY - 10 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" />`
            : `<circle cx="${centerX - 42 * bodyScale}" cy="${headY - 26 * bodyScale}" r="${20 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${6 * bodyScale}" />
               <circle cx="${centerX + 42 * bodyScale}" cy="${headY - 26 * bodyScale}" r="${20 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${6 * bodyScale}" />`;
  const tail =
    archetype === "fox"
      ? `<path d="M${centerX + 110 * bodyScale} ${bodyY + 24 * bodyScale}C${centerX + 182 * bodyScale} ${bodyY + 10 * bodyScale},${centerX + 196 * bodyScale} ${bodyY + 96 * bodyScale},${centerX + 130 * bodyScale} ${bodyY + 130 * bodyScale}" stroke="${bodyStroke}" stroke-width="${20 * bodyScale}" stroke-linecap="round" fill="none" />`
      : archetype === "otter"
        ? `<path d="M${centerX + 106 * bodyScale} ${bodyY + 60 * bodyScale}C${centerX + 176 * bodyScale} ${bodyY + 94 * bodyScale},${centerX + 154 * bodyScale} ${bodyY + 160 * bodyScale},${centerX + 94 * bodyScale} ${bodyY + 166 * bodyScale}" stroke="${bodyStroke}" stroke-width="${18 * bodyScale}" stroke-linecap="round" fill="none" />`
        : "";

  return `
  <g filter="url(#shadow-${blueprint.pageIndex})">
    ${ears}
    <ellipse cx="${centerX}" cy="${headY}" rx="${88 * bodyScale}" ry="${94 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${8 * bodyScale}" />
    <ellipse cx="${centerX}" cy="${bodyY}" rx="${118 * bodyScale}" ry="${140 * bodyScale}" fill="${bodyColor}" stroke="${bodyStroke}" stroke-width="${8 * bodyScale}" />
    <ellipse cx="${centerX}" cy="${bodyY + 10 * bodyScale}" rx="${66 * bodyScale}" ry="${84 * bodyScale}" fill="${bellyColor}" opacity="0.94" />
    <ellipse cx="${centerX - 32 * bodyScale}" cy="${eyeY}" rx="${10 * bodyScale}" ry="${14 * bodyScale}" fill="${bodyStroke}" />
    <ellipse cx="${centerX + 32 * bodyScale}" cy="${eyeY}" rx="${10 * bodyScale}" ry="${14 * bodyScale}" fill="${bodyStroke}" />
    <ellipse cx="${centerX}" cy="${headY + 44 * bodyScale}" rx="${18 * bodyScale}" ry="${14 * bodyScale}" fill="#f59ab5" />
    <path d="${mouthPath}" stroke="${bodyStroke}" stroke-width="${7 * bodyScale}" stroke-linecap="round" fill="none" />
    <path d="M${centerX - 74 * bodyScale} ${bodyY - 56 * bodyScale}C${centerX - 106 * bodyScale} ${bodyY - 18 * bodyScale},${leftArmEndX} ${leftArmEndY},${leftArmEndX - 4 * bodyScale} ${leftArmEndY + 24 * bodyScale}" stroke="${bodyStroke}" stroke-width="${16 * bodyScale}" stroke-linecap="round" fill="none" />
    <path d="M${centerX + 74 * bodyScale} ${bodyY - 56 * bodyScale}C${centerX + 104 * bodyScale} ${bodyY - 18 * bodyScale},${rightArmEndX} ${rightArmEndY},${rightArmEndX + 6 * bodyScale} ${rightArmEndY + 20 * bodyScale}" stroke="${bodyStroke}" stroke-width="${16 * bodyScale}" stroke-linecap="round" fill="none" />
    <path d="M${centerX - 42 * bodyScale} ${bodyY + 126 * bodyScale}C${centerX - 42 * bodyScale} ${bodyY + 194 * bodyScale},${centerX - legSpread * bodyScale} ${bodyY + 242 * bodyScale},${centerX - 24 * bodyScale} ${bodyY + 282 * bodyScale}" stroke="${bodyStroke}" stroke-width="${18 * bodyScale}" stroke-linecap="round" fill="none" />
    <path d="M${centerX + 42 * bodyScale} ${bodyY + 126 * bodyScale}C${centerX + 42 * bodyScale} ${bodyY + 194 * bodyScale},${centerX + legSpread * bodyScale} ${bodyY + 242 * bodyScale},${centerX + 24 * bodyScale} ${bodyY + 282 * bodyScale}" stroke="${bodyStroke}" stroke-width="${18 * bodyScale}" stroke-linecap="round" fill="none" />
    ${tail}
  </g>
  `;
}

function buildDemoArtSceneSvgV2(
  blueprint: SceneBlueprint,
  sceneText: string,
  ingredients: StoryIngredients
) {
  const palette = ingredients.styleRecipe.palette;
  const demo = buildDemoArtBlueprintV2(blueprint);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" fill="none">
  <defs>
    <linearGradient id="storybook-bg-${blueprint.pageIndex}" x1="110" y1="70" x2="790" y2="1140" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.backgroundStart}" />
      <stop offset="1" stop-color="${palette.backgroundEnd}" />
    </linearGradient>
    <linearGradient id="storybook-wash-${blueprint.pageIndex}" x1="150" y1="120" x2="760" y2="1080" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" />
      <stop offset="1" stop-color="${palette.chip}" />
    </linearGradient>
    <filter id="shadow-${blueprint.pageIndex}" x="120" y="140" width="660" height="900" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#0f172a" flood-opacity="0.18" />
    </filter>
  </defs>
  ${renderDemoBackdropV2(blueprint, ingredients, demo)}
  ${renderDemoAccentV2(blueprint, ingredients, demo)}
  ${renderProtagonistSvgV2(blueprint, ingredients, demo)}
  <rect x="54" y="934" width="792" height="190" rx="40" fill="rgba(255,255,255,0.16)" />
  <rect x="72" y="952" width="756" height="154" rx="32" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.42)" />
  <text x="102" y="998" fill="${palette.text}" font-size="34" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">${escapeSvgTextV2(blueprint.sceneTitle)}</text>
  <text x="102" y="1048" fill="${palette.text}" font-size="21" font-family="'Noto Sans SC','PingFang SC',sans-serif">${escapeSvgTextV2(blueprint.visibleAction)}</text>
  <text x="102" y="1088" fill="${palette.text}" font-size="18" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.88">${escapeSvgTextV2(sceneText.slice(0, 52))}</text>
</svg>`.trim();
}

function hashSceneVisualSeedV2(...parts: string[]) {
  return Number.parseInt(stableHash(parts.map((part) => normalizeText(part)).join("::")).slice(0, 8), 16);
}

function buildDynamicFallbackSceneSvgV2(
  blueprint: SceneBlueprint,
  sceneText: string,
  ingredients: StoryIngredients
) {
  const palette = ingredients.styleRecipe.palette;
  const visualSeed = hashSceneVisualSeedV2(
    blueprint.visualAnchor,
    blueprint.sceneObjectCue,
    blueprint.supportCharacterCue,
    blueprint.activityCue,
    blueprint.emotionCue,
    blueprint.taskCue
  );
  const accentX = 118 + (visualSeed % 150);
  const accentY = 158 + (Math.floor(visualSeed / 8) % 120);
  const accentR = 74 + (visualSeed % 22);
  const ribbonWidth = 250 + (Math.floor(visualSeed / 16) % 160);
  const waveHeight = 682 + (Math.floor(visualSeed / 64) % 72);
  const overlayOpacity = 0.22 + ((visualSeed % 10) / 100);
  const modeLabel =
    ingredients.generationMode === "child-personalized"
      ? "成长线索驱动"
      : ingredients.generationMode === "hybrid"
        ? "混合线索驱动"
        : "主题线索驱动";
  const demo = buildDemoArtBlueprintV2(blueprint);
  demo.accentEffect =
    blueprint.stage === "small-success"
      ? "confetti"
      : ingredients.generationMode === "hybrid"
        ? "ripple"
        : blueprint.stage === "landing"
          ? "glow"
          : "breeze";
  demo.prop =
    /睡|晚安/.test(blueprint.taskCue)
      ? "moon"
      : /情绪|安抚/.test(ingredients.focusTheme + blueprint.supportCharacterCue)
        ? "heart"
        : /尝试|勇气/.test(ingredients.focusTheme + blueprint.activityCue)
          ? "star"
          : blueprint.stage === "challenge"
            ? "door"
            : demo.prop;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" fill="none">
  <defs>
    <linearGradient id="dynamic-bg-${blueprint.pageIndex}" x1="72" y1="56" x2="808" y2="1168" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.backgroundStart}" />
      <stop offset="1" stop-color="${palette.backgroundEnd}" />
    </linearGradient>
    <linearGradient id="dynamic-panel-${blueprint.pageIndex}" x1="128" y1="94" x2="750" y2="1096" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.90" />
      <stop offset="1" stop-color="${palette.chip}" stop-opacity="0.64" />
    </linearGradient>
    <filter id="dynamic-shadow-${blueprint.pageIndex}" x="78" y="74" width="744" height="1042" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#0f172a" flood-opacity="0.18" />
    </filter>
  </defs>
  <rect width="900" height="1200" rx="56" fill="url(#dynamic-bg-${blueprint.pageIndex})" />
  <circle cx="${accentX}" cy="${accentY}" r="${accentR}" fill="${palette.chip}" opacity="0.92" />
  <circle cx="756" cy="${220 + (Math.floor(visualSeed / 32) % 70)}" r="${42 + (Math.floor(visualSeed / 4) % 26)}" fill="${palette.accent}" opacity="0.16" />
  <path d="M92 ${waveHeight}C240 ${waveHeight - 92},426 ${waveHeight - 120},812 ${waveHeight - 32}V1200H92Z" fill="${palette.chip}" opacity="0.52" />
  <rect x="78" y="78" width="744" height="1038" rx="46" fill="url(#dynamic-panel-${blueprint.pageIndex})" filter="url(#dynamic-shadow-${blueprint.pageIndex})" />
  <rect x="110" y="112" width="${ribbonWidth}" height="44" rx="22" fill="${palette.chip}" />
  <text x="136" y="141" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">${escapeSvgTextV2(modeLabel)}</text>
  <rect x="628" y="112" width="158" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.14" />
  <text x="652" y="141" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">${escapeSvgTextV2(ingredients.focusTheme)}</text>
  <text x="118" y="208" fill="${palette.text}" font-size="38" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">${escapeSvgTextV2(blueprint.sceneTitle)}</text>
  <text x="118" y="248" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.84">${escapeSvgTextV2(truncateSceneCueV2(blueprint.visualAnchor, blueprint.sceneGoal, 62))}</text>
  <g opacity="${overlayOpacity}">
    ${renderDemoBackdropV2(blueprint, ingredients, demo)}
  </g>
  <g opacity="0.22">
    ${renderDemoAccentV2(blueprint, ingredients, demo)}
  </g>
  <g opacity="0.90">
    ${renderProtagonistSvgV2(blueprint, ingredients, demo)}
  </g>
  <rect x="102" y="798" width="324" height="124" rx="28" fill="#ffffff" fill-opacity="0.84" />
  <text x="128" y="842" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">场景物件</text>
  <text x="128" y="886" fill="${palette.text}" font-size="28" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">${escapeSvgTextV2(blueprint.sceneObjectCue)}</text>
  <rect x="474" y="798" width="324" height="124" rx="28" fill="#ffffff" fill-opacity="0.84" />
  <text x="500" y="842" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">当前动作</text>
  <text x="500" y="886" fill="${palette.text}" font-size="26" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">${escapeSvgTextV2(truncateSceneCueV2(blueprint.activityCue, blueprint.visibleAction, 20))}</text>
  <rect x="102" y="948" width="696" height="132" rx="32" fill="${palette.chip}" fill-opacity="0.92" />
  <text x="132" y="994" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">辅助角色</text>
  <text x="132" y="1034" fill="${palette.text}" font-size="24" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">${escapeSvgTextV2(truncateSceneCueV2(blueprint.supportCharacterCue, blueprint.narrativeAnchor, 34))}</text>
  <text x="132" y="1070" fill="${palette.text}" font-size="20" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.86">${escapeSvgTextV2(truncateSceneCueV2(blueprint.emotionCue, blueprint.emotion, 34))}</text>
  <rect x="102" y="1092" width="420" height="54" rx="27" fill="${palette.accent}" fill-opacity="0.16" />
  <text x="130" y="1127" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">${escapeSvgTextV2(truncateSceneCueV2(blueprint.taskCue, ingredients.tonightAction, 28))}</text>
  <text x="102" y="1178" fill="${palette.text}" font-size="18" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.76">${escapeSvgTextV2(truncateSceneCueV2(sceneText, blueprint.narrativeAnchor, 62))}</text>
</svg>`.trim();
}

function buildFallbackSceneSvgV2(
  blueprint: SceneBlueprint,
  sceneText: string,
  ingredients: StoryIngredients
) {
  const palette = ingredients.styleRecipe.palette;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" fill="none">
  <defs>
    <linearGradient id="storybook-bg-${blueprint.pageIndex}" x1="120" y1="80" x2="780" y2="1120" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.backgroundStart}" />
      <stop offset="1" stop-color="${palette.backgroundEnd}" />
    </linearGradient>
  </defs>
  <rect width="900" height="1200" rx="56" fill="url(#storybook-bg-${blueprint.pageIndex})" />
  <circle cx="150" cy="165" r="82" fill="${palette.chip}" opacity="0.88" />
  <circle cx="738" cy="220" r="56" fill="${palette.chip}" opacity="0.62" />
  <rect x="84" y="92" width="732" height="92" rx="30" fill="white" fill-opacity="0.68" />
  <text x="120" y="148" fill="${palette.text}" font-size="38" font-family="'Noto Sans SC', 'PingFang SC', sans-serif" font-weight="700">${escapeSvgTextV2(blueprint.sceneTitle)}</text>
  <rect x="84" y="222" width="732" height="520" rx="44" fill="white" fill-opacity="0.52" stroke="white" stroke-opacity="0.7" />
  <text x="120" y="320" fill="${palette.text}" font-size="42" font-family="'Noto Sans SC', 'PingFang SC', sans-serif" font-weight="700">${escapeSvgTextV2(blueprint.protagonist.label)}</text>
  <text x="120" y="378" fill="${palette.text}" font-size="28" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">主题：${escapeSvgTextV2(ingredients.focusTheme)}</text>
  <text x="120" y="440" fill="${palette.text}" font-size="28" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">动作：${escapeSvgTextV2(blueprint.visibleAction)}</text>
  <text x="120" y="502" fill="${palette.text}" font-size="28" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">情绪：${escapeSvgTextV2(blueprint.emotion)}</text>
  <rect x="120" y="560" width="224" height="18" rx="9" fill="${palette.accent}" fill-opacity="0.9" />
  <rect x="120" y="604" width="296" height="14" rx="7" fill="${palette.accent}" fill-opacity="0.45" />
  <rect x="84" y="782" width="732" height="276" rx="40" fill="white" fill-opacity="0.76" />
  <text x="120" y="860" fill="${palette.text}" font-size="22" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">本页剧情</text>
  <text x="120" y="918" fill="${palette.text}" font-size="30" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">${escapeSvgTextV2(sceneText)}</text>
  <rect x="84" y="1088" width="320" height="58" rx="29" fill="${palette.chip}" />
  <text x="120" y="1126" fill="${palette.text}" font-size="24" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">Page ${blueprint.pageIndex}</text>
</svg>`.trim();
}

function buildSceneFallbackDataUrlV2(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function buildStoryScenesV2(ingredients: StoryIngredients) {
  const stages =
    ingredients.storyMode === "card"
      ? (["landing"] as StoryStage[])
      : PAGE_STRUCTURES[ingredients.pageCount];

  return stages.map((stage, index) => {
    const blueprint = buildSceneBlueprintV2(stage, index, ingredients);
    const sceneText =
      ingredients.storyMode === "card"
        ? `${ingredients.protagonist.label}把今天那一点点亮光抱进怀里。今晚先做一件小事：${ingredients.tonightAction}。`
        : buildSceneTextV2(blueprint, ingredients);
    const audioScript = buildSceneAudioScriptV2(blueprint, sceneText);
    const dynamicFallbackSvg = buildDynamicFallbackSceneSvgV2(blueprint, sceneText, ingredients);
    const demoArtSvg = buildDemoArtSceneSvgV2(blueprint, sceneText, ingredients);
    const fallbackSvg = buildFallbackSceneSvgV2(blueprint, sceneText, ingredients);
    const hasDynamicFallback = Boolean(dynamicFallbackSvg.trim());
    const hasDemoArt = Boolean(demoArtSvg.trim());
    const imageSourceKind = hasDynamicFallback
      ? "dynamic-fallback"
      : hasDemoArt
        ? "demo-art"
        : "svg-fallback";
    const selectedSvg = hasDynamicFallback
      ? dynamicFallbackSvg
      : hasDemoArt
        ? demoArtSvg
        : fallbackSvg;
    const selectedImage = buildSceneFallbackDataUrlV2(selectedSvg);

    return {
      sceneIndex: blueprint.pageIndex,
      sceneTitle: blueprint.sceneTitle,
      sceneText,
      imagePrompt: buildSceneImagePromptV2(blueprint, ingredients),
      imageUrl: selectedImage,
      assetRef: selectedImage,
      imageSourceKind,
      imageStatus: "fallback",
      audioUrl: null,
      audioRef:
        ingredients.storyMode === "card"
          ? "storybook-audio-card"
          : `storybook-audio-${blueprint.pageIndex}`,
      audioScript,
      audioStatus: "fallback",
      captionTiming: buildSceneCaptionTimingV2(audioScript),
      voiceStyle: blueprint.voiceStyle,
      highlightSource: blueprint.highlightSource,
      imageCacheHit: false,
      audioCacheHit: false,
    } satisfies ParentStoryBookScene;
  });
}

function buildStoryTitle(request: ParentStoryBookRequest, ingredients: StoryIngredients) {
  if (ingredients.generationMode === "manual-theme") {
    return `关于${ingredients.focusTheme}的成长绘本`;
  }
  if (ingredients.generationMode === "hybrid") {
    return `${ingredients.childName}的${ingredients.focusTheme}成长绘本`;
  }
  return `${ingredients.childName}的成长绘本`;
}

function buildStorySummary(request: ParentStoryBookRequest, ingredients: StoryIngredients) {
  const pageText = `${ingredients.storyMode === "card" ? 1 : ingredients.pageCount} 页`;
  if (ingredients.generationMode === "manual-theme") {
    return `这本 ${pageText} 绘本会把“${ingredients.focusTheme}”讲成孩子能听懂的小故事，并在最后自然落到今晚可以做的一件小事。`;
  }
  if (ingredients.generationMode === "hybrid") {
    return `这本 ${pageText} 绘本把“${ingredients.focusTheme}”和 ${ingredients.childName} 最近被看见的成长线索串成一条温柔、可朗读、可继续行动的成长闭环。`;
  }
  return `这本 ${pageText} 绘本会把 ${ingredients.childName} 最近被看见的小进步、今晚的陪伴动作和明天的观察点串成完整的成长故事。`;
}

function buildRequestSeed(request: ParentStoryBookRequest, ingredients: StoryIngredients) {
  return [
    request.childId ?? request.snapshot.child.id ?? "storybook-guest",
    ingredients.storyMode,
    ingredients.generationMode,
    ingredients.pageCount,
    request.styleMode ?? DEFAULT_PARENT_STORYBOOK_STYLE_MODE,
    request.stylePreset ?? DEFAULT_PARENT_STORYBOOK_STYLE_PRESET,
    request.customStylePrompt ?? "",
    request.customStyleNegativePrompt ?? "",
    ingredients.focusTheme,
    ingredients.protagonistArchetype,
    request.goalKeywords?.join("|") ?? "",
    ingredients.highlightCandidates
      .map((item) => `${item.kind}:${item.title}:${item.detail}`)
      .join("|"),
    request.requestSource ?? "",
  ].join("::");
}

function resolveProviderAudioDeliveryFromScenes(
  scenes: ParentStoryBookScene[]
): "real" | "mixed" | "preview-only" {
  const readyCount = scenes.filter(
    (scene) => scene.audioStatus === "ready" && Boolean(scene.audioUrl)
  ).length;
  if (readyCount === 0) return "preview-only";
  if (readyCount === scenes.length) return "real";
  return "mixed";
}

function resolveProviderImageDeliveryFromScenes(
  scenes: ParentStoryBookScene[]
): ParentStoryBookImageDelivery {
  const kinds = new Set(
    scenes.map((scene) => {
      if (scene.imageStatus === "ready" && scene.imageUrl) {
        return "real";
      }
      return scene.imageSourceKind ?? "svg-fallback";
    })
  );

  if (kinds.size === 1) {
    return kinds.values().next().value ?? "svg-fallback";
  }
  return "mixed";
}

function buildLocalDiagnostics(
  transport: ParentStoryBookTransport,
  fallbackReason: string | null,
  upstreamHost?: string | null,
  statusCode?: number | null,
  retryStrategy: "none" | "normalized-base-retry" = "none"
): ParentStoryBookDiagnostics {
  const reachable = transport === "remote-brain-proxy";
  const missingConfig = reachable ? [] : ["brain-unreachable"];

  return {
    brain: {
      reachable,
      fallbackReason,
      upstreamHost: upstreamHost ?? null,
      statusCode: statusCode ?? null,
      retryStrategy,
    },
    image: {
      requestedProvider: "vivo-story-image",
      resolvedProvider: reachable ? "storybook-dynamic-fallback" : "storybook-local-dynamic-fallback",
      liveEnabled: false,
      missingConfig,
    },
    audio: {
      requestedProvider: "vivo-story-tts",
      resolvedProvider: reachable ? "storybook-mock-preview" : "storybook-local-preview",
      liveEnabled: false,
      missingConfig,
    },
  };
}

export function buildParentStoryBookResponse(
  request: ParentStoryBookRequest,
  options?: {
    transport?: ParentStoryBookTransport;
    fallbackReason?: string | null;
    source?: ParentStoryBookResponse["source"];
    fallback?: boolean;
    upstreamHost?: string | null;
    statusCode?: number | null;
    retryStrategy?: "none" | "normalized-base-retry";
  }
): ParentStoryBookResponse {
  const stylePreset = resolveParentStoryBookStylePreset(request.stylePreset);
  const ingredients = buildStoryIngredients({
    ...request,
    stylePreset,
  });
  const scenes = buildStoryScenesV2(ingredients);
  const storySeed = buildRequestSeed(request, ingredients);
  const storyId = `storybook-${stableHash(storySeed)}`;
  const generatedAt = buildStableTimestamp(storySeed);
  const fallbackReason =
    options?.fallbackReason ??
    (ingredients.storyMode === "card"
      ? "sparse-parent-context"
      : "mock-storybook-pipeline");

  return {
    storyId,
    childId: request.childId ?? request.snapshot.child.id ?? "storybook-guest",
    mode: ingredients.storyMode,
    title: buildStoryTitle(request, ingredients),
    summary: buildStorySummary(request, ingredients),
    moral: buildMoral({
      protagonistName: ingredients.protagonistName,
      focusTheme: ingredients.focusTheme,
      summaryHighlight: ingredients.summaryHighlight,
    }),
    parentNote: ingredients.parentNote,
    source: options?.source ?? "rule",
    fallback: options?.fallback ?? true,
    fallbackReason,
    generatedAt,
    stylePreset,
    providerMeta: {
      provider: "parent-storybook-rule",
      mode: "fallback",
      transport: options?.transport ?? "next-json-fallback",
      imageProvider: "storybook-dynamic-fallback",
      audioProvider: "storybook-mock-preview",
      imageDelivery: resolveProviderImageDeliveryFromScenes(scenes),
      audioDelivery: resolveProviderAudioDeliveryFromScenes(scenes),
      diagnostics: buildLocalDiagnostics(
        options?.transport ?? "next-json-fallback",
        fallbackReason,
        options?.upstreamHost,
        options?.statusCode,
        options?.retryStrategy ?? "none"
      ),
      stylePreset,
      requestSource: request.requestSource ?? "parent-storybook-page",
      fallbackReason,
      realProvider: false,
      highlightCount: ingredients.highlightCandidates.length,
      sceneCount: scenes.length,
      cacheHitCount: 0,
      cacheWindowSeconds: 0,
    },
    scenes,
  };
}

export function buildParentStoryBookScenesPreview(input: {
  request: ParentStoryBookRequest;
  imageStatus?: ParentStoryBookMediaStatus;
  audioStatus?: ParentStoryBookMediaStatus;
}) {
  const response = buildParentStoryBookResponse(input.request);
  return {
    ...response,
    scenes: response.scenes.map((scene) => ({
      ...scene,
      imageStatus: input.imageStatus ?? scene.imageStatus,
      audioStatus: input.audioStatus ?? scene.audioStatus,
      imageCacheHit: false,
      audioCacheHit: false,
    })),
  } satisfies ParentStoryBookResponse;
}
