import type { InterventionCard } from "@/lib/agent/intervention-card";
import type {
  ConsultationResult,
  MobileDraft,
  ParentTrendQueryPayload,
  ParentTrendQueryResponse,
  ReminderItem,
} from "@/lib/ai/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type {
  AttendanceRecord,
  Child,
  GrowthRecord,
  GuardianFeedback,
  HealthCheckRecord,
  MealRecord,
  TaskCheckInRecord,
} from "@/lib/store";

export const PARENT_TREND_QUICK_QUESTIONS = [
  "最近一个月分离焦虑缓解了吗？",
  "这周饮食情况有改善吗？",
  "最近睡眠更稳定了吗？",
] as const;

export const PARENT_TREND_DEBUG_CASES = [
  "loading",
  "success",
  "fallback",
  "insufficient",
  "empty",
  "error",
] as const;

export type ParentTrendDebugCase = (typeof PARENT_TREND_DEBUG_CASES)[number];

export interface ParentTrendDebugState {
  question: string;
  loading: boolean;
  error: string | null;
  result: ParentTrendQueryResponse | null;
}

const TREND_TIME_KEYWORDS = [
  "最近",
  "这周",
  "本周",
  "近7天",
  "7天",
  "最近一周",
  "近一周",
  "最近两周",
  "近两周",
  "14天",
  "最近一个月",
  "近一个月",
  "30天",
  "本月",
];

const TREND_MOVEMENT_KEYWORDS = [
  "改善",
  "稳定",
  "波动",
  "缓解",
  "趋势",
  "变化",
  "好转",
  "更稳定",
  "更好吗",
];

const TREND_TOPIC_KEYWORDS = [
  "情绪",
  "分离焦虑",
  "入园",
  "哭闹",
  "饮食",
  "吃饭",
  "喝水",
  "挑食",
  "睡眠",
  "午睡",
  "夜醒",
  "健康",
  "晨检",
  "体温",
  "成长",
];

function normalizeQuestion(value: string) {
  return value.replace(/[？?！!。，“”、,;；:\s]/g, "").toLowerCase();
}

const NORMALIZED_TREND_QUICK_QUESTIONS = new Set(
  PARENT_TREND_QUICK_QUESTIONS.map((item) => normalizeQuestion(item))
);

function includesAnyKeyword(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function isLikelyTrendQuestion(question: string) {
  const trimmed = question.trim();
  if (!trimmed) return false;

  const normalized = normalizeQuestion(trimmed);
  if (NORMALIZED_TREND_QUICK_QUESTIONS.has(normalized)) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  return (
    includesAnyKeyword(lower, TREND_TIME_KEYWORDS) &&
    includesAnyKeyword(lower, TREND_MOVEMENT_KEYWORDS) &&
    includesAnyKeyword(lower, TREND_TOPIC_KEYWORDS)
  );
}

export interface BuildParentTrendQueryPayloadInput {
  question: string;
  childId?: string;
  children: Child[];
  attendanceRecords: AttendanceRecord[];
  mealRecords: MealRecord[];
  growthRecords: GrowthRecord[];
  guardianFeedbacks: GuardianFeedback[];
  healthCheckRecords: HealthCheckRecord[];
  taskCheckInRecords: TaskCheckInRecord[];
  interventionCards: InterventionCard[];
  consultations: ConsultationResult[];
  mobileDrafts: MobileDraft[];
  reminders: ReminderItem[];
  traceId?: string;
  debugMemory?: boolean;
  updatedAt?: string;
}

export function buildParentTrendAppSnapshot(
  input: Omit<BuildParentTrendQueryPayloadInput, "question" | "childId" | "traceId" | "debugMemory">
): AppStateSnapshot {
  return {
    children: input.children,
    attendance: input.attendanceRecords,
    meals: input.mealRecords,
    growth: input.growthRecords,
    feedback: input.guardianFeedbacks,
    health: input.healthCheckRecords,
    taskCheckIns: input.taskCheckInRecords,
    interventionCards: input.interventionCards,
    consultations: input.consultations,
    mobileDrafts: input.mobileDrafts,
    reminders: input.reminders,
    tasks: [],
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function buildParentTrendQueryPayload(
  input: BuildParentTrendQueryPayloadInput
): ParentTrendQueryPayload {
  const appSnapshot = buildParentTrendAppSnapshot(input);

  return {
    question: input.question.trim(),
    childId: input.childId,
    appSnapshot,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.debugMemory ? { debugMemory: true } : {}),
  };
}

export function isTrendFallbackResult(result: ParentTrendQueryResponse | null) {
  if (!result) return false;
  return result.source === "demo_snapshot" || result.dataQuality.fallbackUsed || result.fallback;
}

export function resolveParentTrendDebugCase(value?: string | null): ParentTrendDebugCase | null {
  if (!value) return null;
  return PARENT_TREND_DEBUG_CASES.includes(value as ParentTrendDebugCase)
    ? (value as ParentTrendDebugCase)
    : null;
}

function buildDebugWindow(windowDays: number) {
  const endDate = new Date("2026-04-04T00:00:00Z");
  const dates: string[] = [];
  const labels: string[] = [];

  for (let index = windowDays - 1; index >= 0; index -= 1) {
    const nextDate = new Date(endDate);
    nextDate.setUTCDate(endDate.getUTCDate() - index);
    const isoDate = nextDate.toISOString().slice(0, 10);
    dates.push(isoDate);
    labels.push(isoDate.slice(5).replace("-", "/"));
  }

  return {
    dates,
    labels,
    range: {
      startDate: dates[0] ?? "2026-04-04",
      endDate: dates[dates.length - 1] ?? "2026-04-04",
    },
  };
}

function buildDebugSeries({
  id,
  label,
  unit,
  values,
  kind = "line",
  windowDays,
}: {
  id: string;
  label: string;
  unit: string;
  values: Array<number | null>;
  kind?: "line" | "bar";
  windowDays: number;
}) {
  const window = buildDebugWindow(windowDays);
  return {
    id,
    label,
    unit,
    kind,
    data: window.dates.map((date, index) => {
      const value = values[index] ?? null;
      return {
        date,
        label: window.labels[index] ?? date,
        value,
        rawCount: value === null ? 0 : 1,
        missing: value === null,
      };
    }),
  };
}

function buildBaseDebugResult({
  child,
  question,
  intent,
  metric,
  windowDays,
  series,
  trendLabel,
  trendScore,
  comparison,
  explanation,
  supportingSignals,
  dataQuality,
  warnings,
  source,
  fallback,
  debugCase,
}: {
  child: Pick<Child, "id" | "name" | "nickname" | "className" | "institutionId">;
  question: string;
  intent: ParentTrendQueryResponse["intent"];
  metric: string;
  windowDays: number;
  series: ParentTrendQueryResponse["series"];
  trendLabel: ParentTrendQueryResponse["trendLabel"];
  trendScore: number;
  comparison: ParentTrendQueryResponse["comparison"];
  explanation: string;
  supportingSignals: ParentTrendQueryResponse["supportingSignals"];
  dataQuality: ParentTrendQueryResponse["dataQuality"];
  warnings: string[];
  source: string;
  fallback: boolean;
  debugCase: ParentTrendDebugCase;
}): ParentTrendQueryResponse {
  const window = buildDebugWindow(windowDays);

  return {
    query: {
      question,
      requestedWindowDays: windowDays,
      resolvedWindowDays: windowDays,
      childId: child.id,
      childName: child.name,
    },
    intent,
    metric,
    child: {
      childId: child.id,
      name: child.name,
      nickname: child.nickname ?? null,
      className: child.className ?? null,
      institutionId: child.institutionId ?? null,
    },
    windowDays,
    range: window.range,
    labels: window.labels,
    xAxis: window.labels,
    series,
    trendLabel,
    trendScore,
    comparison,
    explanation,
    supportingSignals,
    dataQuality,
    warnings,
    memoryMeta: {
      mode: "debug-fixture",
      case: debugCase,
    },
    source,
    fallback,
  };
}

export function buildParentTrendDebugState({
  trendCase,
  child,
}: {
  trendCase: ParentTrendDebugCase;
  child: Pick<Child, "id" | "name" | "nickname" | "className" | "institutionId">;
}): ParentTrendDebugState {
  if (trendCase === "loading") {
    return {
      question: "这周饮食情况有改善吗？",
      loading: true,
      error: null,
      result: null,
    };
  }

  if (trendCase === "error") {
    return {
      question: "最近两周睡眠情况稳定吗？",
      loading: false,
      error: "趋势服务暂时不可用，请稍后重试。当前请用 trace=debug 切换其他 QA case 做页面验证。",
      result: null,
    };
  }

  if (trendCase === "success") {
    const question = "这周饮食情况有改善吗？";
    return {
      question,
      loading: false,
      error: null,
      result: buildBaseDebugResult({
        child,
        question,
        intent: "diet",
        metric: "diet_quality_score",
        windowDays: 7,
        series: [
          buildDebugSeries({
            id: "diet_quality_score",
            label: "饮食质量分",
            unit: "score",
            values: [56, 58, 60, 74, 80, 84, 88],
            windowDays: 7,
          }),
          buildDebugSeries({
            id: "hydration_ml",
            label: "补水趋势",
            unit: "ml",
            values: [90, 100, 110, 140, 150, 170, 180],
            windowDays: 7,
          }),
          buildDebugSeries({
            id: "picky_signals",
            label: "挑食信号",
            unit: "count",
            values: [3, 3, 2, 2, 1, 1, 0],
            windowDays: 7,
          }),
        ],
        trendLabel: "改善",
        trendScore: 86,
        comparison: {
          baselineAvg: 58,
          recentAvg: 84,
          deltaPct: 45,
          direction: "up",
        },
        explanation:
          "这 7 天的饮食质量分在上升，补水状态也在改善，挑食信号同步下降。这个 case 用来演示正常有数据时的趋势线，不依赖 fallback，也不会伪造高质量趋势。",
        supportingSignals: [
          {
            sourceType: "meal",
            date: "2026-04-03",
            summary: "午餐基本吃完，蛋白和蔬菜的接受度比前几天更好。",
          },
          {
            sourceType: "meal",
            date: "2026-04-04",
            summary: "当天饮食完成度高，补水状态也更稳定。",
          },
        ],
        dataQuality: {
          observedDays: 7,
          coverageRatio: 1,
          sparse: false,
          fallbackUsed: false,
          source: "request_snapshot",
        },
        warnings: ["当前演示基于 request_snapshot 成功返回，适合录屏说明真实趋势链路已经接通。"],
        source: "request_snapshot",
        fallback: false,
        debugCase: trendCase,
      }),
    };
  }

  if (trendCase === "fallback") {
    const question = "最近两周睡眠情况稳定吗？";
    return {
      question,
      loading: false,
      error: null,
      result: buildBaseDebugResult({
        child,
        question,
        intent: "sleep",
        metric: "sleep_stability_score",
        windowDays: 14,
        series: [
          buildDebugSeries({
            id: "sleep_stability_score",
            label: "睡眠稳定度",
            unit: "score",
            values: Array.from({ length: 14 }, () => null),
            windowDays: 14,
          }),
        ],
        trendLabel: "需关注",
        trendScore: 24,
        comparison: {
          baselineAvg: null,
          recentAvg: null,
          deltaPct: null,
          direction: "insufficient",
        },
        explanation:
          "这个 case 明确演示 fallback honesty：当前只拿到了 demo_snapshot，且没有可用睡眠记录，所以页面会诚实显示 fallback 和 insufficient-data，而不是画一条看起来很完整的趋势线。",
        supportingSignals: [
          {
            sourceType: "demo_snapshot",
            summary: "当前演示快照里只有饮食样本，没有可用的睡眠记录。",
          },
        ],
        dataQuality: {
          observedDays: 0,
          coverageRatio: 0,
          sparse: true,
          fallbackUsed: true,
          source: "demo_snapshot",
        },
        warnings: [
          "当前结果来自 demo_snapshot，仅用于演示或后端不可达时的 fallback。",
          "有效记录为 0 天，系统不会伪造高质量睡眠趋势。",
        ],
        source: "demo_snapshot",
        fallback: true,
        debugCase: trendCase,
      }),
    };
  }

  if (trendCase === "insufficient") {
    const question = "最近成长情况怎么样？";
    return {
      question,
      loading: false,
      error: null,
      result: buildBaseDebugResult({
        child,
        question,
        intent: "growth_overall",
        metric: "overall_growth_score",
        windowDays: 7,
        series: [
          buildDebugSeries({
            id: "overall_growth_score",
            label: "成长综合分",
            unit: "score",
            values: [null, null, null, 78, null, null, null],
            windowDays: 7,
          }),
        ],
        trendLabel: "需关注",
        trendScore: 46,
        comparison: {
          baselineAvg: null,
          recentAvg: 78,
          deltaPct: null,
          direction: "insufficient",
        },
        explanation:
          "这个 case 用来演示非 fallback 的 insufficient-data。虽然请求成功了，但当前时间窗里只有 1 个有效点位，所以不应该强行给出完整趋势判断。",
        supportingSignals: [
          {
            sourceType: "growth",
            date: "2026-04-02",
            summary: "当前时间窗内仅有一条成长观察记录。",
          },
        ],
        dataQuality: {
          observedDays: 1,
          coverageRatio: 1 / 7,
          sparse: true,
          fallbackUsed: false,
          source: "request_snapshot",
        },
        warnings: ["有效点位少于 2 个，趋势图应该进入 insufficient-data 状态。"],
        source: "request_snapshot",
        fallback: false,
        debugCase: trendCase,
      }),
    };
  }

  const question = "最近一个月分离焦虑缓解了吗？";
  return {
    question,
    loading: false,
    error: null,
    result: buildBaseDebugResult({
      child,
      question,
      intent: "emotion",
      metric: "emotion_calm_score",
      windowDays: 30,
      series: [],
      trendLabel: "需关注",
      trendScore: 40,
      comparison: {
        baselineAvg: null,
        recentAvg: null,
        deltaPct: null,
        direction: "insufficient",
      },
      explanation:
        "empty case 用来验证页面空态。结果结构仍然完整，但图表区必须诚实显示“当前 window 内没有可展示数据”。",
      supportingSignals: [],
      dataQuality: {
        observedDays: 0,
        coverageRatio: 0,
        sparse: true,
        fallbackUsed: false,
        source: "request_snapshot",
      },
      warnings: ["当前时间窗内没有可展示的情绪样本，图表区应显示 empty state。"],
      source: "request_snapshot",
      fallback: false,
      debugCase: trendCase,
    }),
  };
}
