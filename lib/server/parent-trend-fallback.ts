import type {
  ParentTrendComparison,
  ParentTrendDirection,
  ParentTrendIntent,
  ParentTrendQueryPayload,
  ParentTrendQueryResponse,
  ParentTrendSeries,
  ParentTrendSeriesPoint,
  ParentTrendLabel,
} from "@/lib/ai/types";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import {
  normalizeAppStateSnapshot,
  type AppStateSnapshot,
} from "@/lib/persistence/snapshot";

type TrendSource = "request_snapshot" | "demo_snapshot";
type TrendRecord = Record<string, unknown>;

const SUPPORTED_WINDOWS = [7, 14, 30] as const;

const INTENT_METRICS: Record<ParentTrendIntent, string> = {
  emotion: "emotion_calm_score",
  diet: "diet_quality_score",
  sleep: "sleep_stability_score",
  health: "health_stability_score",
  growth_overall: "overall_growth_score",
};

const INTENT_LABELS: Record<ParentTrendIntent, string> = {
  emotion: "情绪状态",
  diet: "饮食情况",
  sleep: "睡眠稳定度",
  health: "健康状态",
  growth_overall: "综合成长状态",
};

const SERIES_LABELS: Record<string, { label: string; unit: string; kind: "line" | "bar" }> = {
  emotion_calm_score: { label: "情绪平稳度", unit: "score", kind: "line" },
  distress_signals: { label: "波动信号", unit: "count", kind: "bar" },
  diet_quality_score: { label: "饮食质量", unit: "score", kind: "line" },
  hydration_ml: { label: "补水趋势", unit: "ml", kind: "bar" },
  picky_signals: { label: "挑食信号", unit: "count", kind: "bar" },
  sleep_stability_score: { label: "睡眠稳定度", unit: "score", kind: "line" },
  sleep_distress_signals: { label: "睡眠波动信号", unit: "count", kind: "bar" },
  health_stability_score: { label: "健康稳定度", unit: "score", kind: "line" },
  abnormal_checks: { label: "异常晨检", unit: "count", kind: "bar" },
  max_temperature_c: { label: "最高体温", unit: "celsius", kind: "line" },
  overall_growth_score: { label: "综合成长", unit: "score", kind: "line" },
};

const KEYWORDS = {
  emotion: ["分离焦虑", "情绪", "哭", "哭闹", "入园", "安抚", "想妈妈", "紧张", "害怕"],
  diet: ["饮食", "吃饭", "进食", "喝水", "补水", "挑食", "蔬菜", "蛋白", "午餐"],
  sleep: ["睡", "午睡", "入睡", "夜醒", "午休", "睡前"],
  health: ["健康", "晨检", "体温", "发热", "咳", "不适", "精神"],
};

const POSITIVE_WORDS = ["平静", "稳定", "主动", "适应", "缓解", "改善", "顺利", "接受", "配合", "完成"];
const NEGATIVE_WORDS = ["焦虑", "哭", "哭闹", "拒", "不愿", "紧张", "害怕", "波动", "异常", "发热", "咳", "困难"];
const PICKY_WORDS = ["挑食", "拒食", "不吃", "剩余", "蔬菜", "蛋白", "回避"];

function isRecord(value: unknown): value is TrendRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecords(value: unknown): TrendRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function clamp(value: number, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

function round(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseDate(value: unknown): Date | null {
  const text = readString(value);
  if (!text) return null;
  const normalized = text.includes("T") ? text : `${text}T00:00:00.000Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayLabel(key: string) {
  return key.slice(5).replace("-", "/");
}

function recordDate(record: TrendRecord, keys: string[]) {
  for (const key of keys) {
    const parsed = parseDate(record[key]);
    if (parsed) return parsed;
  }
  return null;
}

function textOf(record: TrendRecord, keys: string[]) {
  const parts: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      parts.push(
        ...value
          .map((item) => {
            if (isRecord(item)) {
              return [item.name, item.category, item.amount].map(readString).filter(Boolean).join(" ");
            }
            return readString(item);
          })
          .filter(Boolean)
      );
    } else if (isRecord(value)) {
      parts.push(...Object.values(value).map(readString).filter(Boolean));
    } else {
      const text = readString(value);
      if (text) parts.push(text);
    }
  }
  return parts.join(" ");
}

function includesAny(text: string, words: readonly string[]) {
  return words.some((word) => text.includes(word));
}

function resolveWindowDays(question: string, requestedWindowDays?: number | null) {
  if (requestedWindowDays && SUPPORTED_WINDOWS.includes(requestedWindowDays as (typeof SUPPORTED_WINDOWS)[number])) {
    return requestedWindowDays;
  }

  if (/30|一个月|一月|本月|近一月|最近一个月/u.test(question)) return 30;
  if (/14|两周|二周|半个月|近两周|最近两周/u.test(question)) return 14;
  return 7;
}

function resolveIntent(question: string): ParentTrendIntent {
  for (const [intent, words] of Object.entries(KEYWORDS) as Array<[Exclude<ParentTrendIntent, "growth_overall">, string[]]>) {
    if (includesAny(question, words)) return intent;
  }
  return "growth_overall";
}

function selectSnapshot(payload: ParentTrendQueryPayload, now?: string): {
  snapshot: AppStateSnapshot;
  source: TrendSource;
  warnings: string[];
} {
  const requestedSnapshot = normalizeAppStateSnapshot(payload.appSnapshot);
  const requestedChildId = readString(payload.childId);
  if (
    requestedSnapshot &&
    (!requestedChildId || requestedSnapshot.children.some((child) => child.id === requestedChildId))
  ) {
    return { snapshot: requestedSnapshot, source: "request_snapshot", warnings: [] };
  }

  const demoSnapshot = normalizeAppStateSnapshot(createDemoSeedSnapshot(now)) ?? createDemoSeedSnapshot(now);
  return {
    snapshot: demoSnapshot,
    source: "demo_snapshot",
    warnings: requestedSnapshot
      ? ["请求快照中没有找到当前孩子，已改用授权演示快照生成本地趋势解释。"]
      : ["远端趋势服务不可用，已使用演示快照生成本地趋势解释。"],
  };
}

function resolveChild(snapshot: AppStateSnapshot, childId?: string | null) {
  const requestedChildId = readString(childId);
  return (
    snapshot.children.find((child) => child.id === requestedChildId) ??
    snapshot.children[0] ??
    null
  );
}

function buildBuckets(snapshot: AppStateSnapshot, childId: string, range: string[]) {
  const buckets = new Map(
    range.map((key) => [
      key,
      {
        meals: [] as TrendRecord[],
        growth: [] as TrendRecord[],
        health: [] as TrendRecord[],
        feedback: [] as TrendRecord[],
      },
    ])
  );

  const append = (records: unknown[], bucketName: "meals" | "growth" | "health" | "feedback", keys: string[]) => {
    for (const record of asRecords(records)) {
      if (readString(record.childId) !== childId) continue;
      const parsed = recordDate(record, keys);
      if (!parsed) continue;
      const key = dateKey(parsed);
      const bucket = buckets.get(key);
      if (bucket) bucket[bucketName].push(record);
    }
  };

  append(snapshot.meals, "meals", ["date", "createdAt", "submittedAt"]);
  append(snapshot.growth, "growth", ["createdAt", "reviewDate", "date"]);
  append(snapshot.health, "health", ["date", "createdAt"]);
  append(snapshot.feedback, "feedback", ["submittedAt", "date", "createdAt"]);

  return buckets;
}

function candidateEndDate(snapshot: AppStateSnapshot, childId: string) {
  const dates: Date[] = [];
  const updatedAt = parseDate(snapshot.updatedAt);
  if (updatedAt) dates.push(updatedAt);

  const collect = (records: unknown[], keys: string[]) => {
    for (const record of asRecords(records)) {
      if (readString(record.childId) !== childId) continue;
      const parsed = recordDate(record, keys);
      if (parsed) dates.push(parsed);
    }
  };

  collect(snapshot.meals, ["date", "createdAt"]);
  collect(snapshot.growth, ["createdAt", "reviewDate", "date"]);
  collect(snapshot.health, ["date", "createdAt"]);
  collect(snapshot.feedback, ["submittedAt", "date", "createdAt"]);

  return dates.length > 0
    ? new Date(Math.max(...dates.map((item) => item.getTime())))
    : new Date();
}

function buildPoint(day: string, value: number | null, rawCount: number): ParentTrendSeriesPoint {
  return {
    date: day,
    label: dayLabel(day),
    value: value === null ? null : round(value),
    rawCount,
    missing: value === null,
  };
}

function seriesFromPoints(id: string, points: ParentTrendSeriesPoint[]): ParentTrendSeries {
  const meta = SERIES_LABELS[id] ?? { label: id, unit: "score", kind: "line" as const };
  return {
    id,
    label: meta.label,
    unit: meta.unit,
    kind: meta.kind,
    data: points,
  };
}

function buildEmotionMetrics(range: string[], buckets: ReturnType<typeof buildBuckets>) {
  const scorePoints: ParentTrendSeriesPoint[] = [];
  const distressPoints: ParentTrendSeriesPoint[] = [];
  const signals: ParentTrendQueryResponse["supportingSignals"] = [];

  for (const day of range) {
    const bucket = buckets.get(day);
    const records = [...(bucket?.growth ?? []), ...(bucket?.health ?? []), ...(bucket?.feedback ?? [])];
    const relevant = records.filter((record) =>
      includesAny(textOf(record, ["category", "tags", "selectedIndicators", "description", "followUpAction", "mood", "remark", "content", "notes", "freeNote", "childReaction"]), KEYWORDS.emotion)
    );

    if (relevant.length === 0) {
      scorePoints.push(buildPoint(day, null, 0));
      distressPoints.push(buildPoint(day, null, 0));
      continue;
    }

    const text = relevant
      .map((record) => textOf(record, ["tags", "description", "remark", "content", "notes", "freeNote", "childReaction", "improvementStatus"]))
      .join(" ");
    const negative = KEYWORDS.emotion.filter((word) => text.includes(word)).length + NEGATIVE_WORDS.filter((word) => text.includes(word)).length;
    const positive = POSITIVE_WORDS.filter((word) => text.includes(word)).length;
    const attention = relevant.filter((record) => record.needsAttention === true).length;
    const score = clamp(86 - negative * 8 - attention * 8 + positive * 6, 10, 98);
    scorePoints.push(buildPoint(day, score, relevant.length));
    distressPoints.push(buildPoint(day, Math.max(0, negative + attention), relevant.length));
    pushSignals(signals, day, relevant);
  }

  return {
    primaryPoints: scorePoints,
    series: [seriesFromPoints("emotion_calm_score", scorePoints), seriesFromPoints("distress_signals", distressPoints)],
    signals,
  };
}

function mealScore(record: TrendRecord) {
  const explicit = readNumber(record.nutritionScore);
  if (explicit !== null) return clamp(explicit, 0, 100);

  const text = textOf(record, ["intakeLevel", "preference", "foods", "aiEvaluation"]);
  let score = 72;
  if (/充足|高|high|good|accept|喜欢/u.test(text)) score += 12;
  if (/适中|medium|normal|正常/u.test(text)) score += 4;
  if (/少|低|拒|dislike|refuse|poor|low/u.test(text)) score -= 18;
  return clamp(score, 20, 96);
}

function buildDietMetrics(range: string[], buckets: ReturnType<typeof buildBuckets>) {
  const scorePoints: ParentTrendSeriesPoint[] = [];
  const hydrationPoints: ParentTrendSeriesPoint[] = [];
  const pickyPoints: ParentTrendSeriesPoint[] = [];
  const signals: ParentTrendQueryResponse["supportingSignals"] = [];

  for (const day of range) {
    const records = buckets.get(day)?.meals ?? [];
    if (records.length === 0) {
      scorePoints.push(buildPoint(day, null, 0));
      hydrationPoints.push(buildPoint(day, null, 0));
      pickyPoints.push(buildPoint(day, null, 0));
      continue;
    }

    const scores = records.map(mealScore);
    const waterValues = records.map((record) => readNumber(record.waterMl)).filter((value): value is number => value !== null);
    const pickyCount = records.filter((record) => includesAny(textOf(record, ["preference", "intakeLevel", "foods", "aiEvaluation"]), PICKY_WORDS)).length;
    scorePoints.push(buildPoint(day, average(scores), records.length));
    hydrationPoints.push(buildPoint(day, waterValues.length > 0 ? average(waterValues) : null, waterValues.length));
    pickyPoints.push(buildPoint(day, pickyCount, records.length));
    pushSignals(signals, day, records);
  }

  return {
    primaryPoints: scorePoints,
    series: [
      seriesFromPoints("diet_quality_score", scorePoints),
      seriesFromPoints("hydration_ml", hydrationPoints),
      seriesFromPoints("picky_signals", pickyPoints),
    ],
    signals,
  };
}

function buildSleepMetrics(range: string[], buckets: ReturnType<typeof buildBuckets>) {
  const scorePoints: ParentTrendSeriesPoint[] = [];
  const distressPoints: ParentTrendSeriesPoint[] = [];
  const signals: ParentTrendQueryResponse["supportingSignals"] = [];

  for (const day of range) {
    const records = [...(buckets.get(day)?.growth ?? []), ...(buckets.get(day)?.health ?? []), ...(buckets.get(day)?.feedback ?? [])];
    const relevant = records.filter((record) =>
      includesAny(textOf(record, ["category", "tags", "selectedIndicators", "description", "followUpAction", "mood", "remark", "content", "notes", "freeNote"]), KEYWORDS.sleep)
    );

    if (relevant.length === 0) {
      scorePoints.push(buildPoint(day, null, 0));
      distressPoints.push(buildPoint(day, null, 0));
      continue;
    }

    const text = relevant
      .map((record) => textOf(record, ["tags", "description", "remark", "content", "notes", "freeNote", "childReaction", "improvementStatus"]))
      .join(" ");
    const negative = NEGATIVE_WORDS.filter((word) => text.includes(word)).length;
    const positive = POSITIVE_WORDS.filter((word) => text.includes(word)).length;
    const attention = relevant.filter((record) => record.needsAttention === true).length;
    const score = clamp(84 - negative * 12 - attention * 8 + positive * 6, 12, 98);
    scorePoints.push(buildPoint(day, score, relevant.length));
    distressPoints.push(buildPoint(day, Math.max(0, negative + attention), relevant.length));
    pushSignals(signals, day, relevant);
  }

  return {
    primaryPoints: scorePoints,
    series: [
      seriesFromPoints("sleep_stability_score", scorePoints),
      seriesFromPoints("sleep_distress_signals", distressPoints),
    ],
    signals,
  };
}

function buildHealthMetrics(range: string[], buckets: ReturnType<typeof buildBuckets>) {
  const scorePoints: ParentTrendSeriesPoint[] = [];
  const abnormalPoints: ParentTrendSeriesPoint[] = [];
  const temperaturePoints: ParentTrendSeriesPoint[] = [];
  const signals: ParentTrendQueryResponse["supportingSignals"] = [];

  for (const day of range) {
    const records = buckets.get(day)?.health ?? [];
    if (records.length === 0) {
      scorePoints.push(buildPoint(day, null, 0));
      abnormalPoints.push(buildPoint(day, null, 0));
      temperaturePoints.push(buildPoint(day, null, 0));
      continue;
    }

    const temperatures = records.map((record) => readNumber(record.temperature)).filter((value): value is number => value !== null);
    const maxTemperature = temperatures.length > 0 ? Math.max(...temperatures) : null;
    const abnormalCount = records.filter((record) => record.isAbnormal === true || readString(record.handMouthEye).includes("异常")).length;
    const feverPenalty = maxTemperature === null ? 0 : maxTemperature >= 38 ? 26 : maxTemperature >= 37.3 ? 12 : 0;
    const score = clamp(92 - abnormalCount * 22 - feverPenalty, 10, 98);
    scorePoints.push(buildPoint(day, score, records.length));
    abnormalPoints.push(buildPoint(day, abnormalCount, records.length));
    temperaturePoints.push(buildPoint(day, maxTemperature, temperatures.length));
    pushSignals(signals, day, records);
  }

  return {
    primaryPoints: scorePoints,
    series: [
      seriesFromPoints("health_stability_score", scorePoints),
      seriesFromPoints("abnormal_checks", abnormalPoints),
      seriesFromPoints("max_temperature_c", temperaturePoints),
    ],
    signals,
  };
}

function buildOverallMetrics(
  range: string[],
  metrics: {
    emotion: ReturnType<typeof buildEmotionMetrics>;
    diet: ReturnType<typeof buildDietMetrics>;
    sleep: ReturnType<typeof buildSleepMetrics>;
    health: ReturnType<typeof buildHealthMetrics>;
  }
) {
  const scorePoints = range.map((day, index) => {
    const values = [
      metrics.emotion.primaryPoints[index]?.value,
      metrics.diet.primaryPoints[index]?.value,
      metrics.sleep.primaryPoints[index]?.value,
      metrics.health.primaryPoints[index]?.value,
    ].filter((value): value is number => typeof value === "number");
    return buildPoint(day, values.length > 0 ? average(values) : null, values.length);
  });

  return {
    primaryPoints: scorePoints,
    series: [seriesFromPoints("overall_growth_score", scorePoints)],
    signals: uniqueSignals([
      ...metrics.emotion.signals,
      ...metrics.diet.signals,
      ...metrics.sleep.signals,
      ...metrics.health.signals,
    ]),
  };
}

function pushSignals(target: ParentTrendQueryResponse["supportingSignals"], day: string, records: TrendRecord[]) {
  for (const record of records.slice(0, 2)) {
    const summary =
      textOf(record, ["description", "remark", "content", "notes", "freeNote", "aiEvaluation"]) ||
      textOf(record, ["category", "meal", "mood", "preference"]);
    if (!summary) continue;
    target.push({
      sourceType: inferSourceType(record),
      date: day,
      summary: summary.slice(0, 220),
    });
  }
}

function inferSourceType(record: TrendRecord) {
  if ("meal" in record || "nutritionScore" in record) return "meal";
  if ("temperature" in record || "handMouthEye" in record) return "health";
  if ("executionStatus" in record || "improvementStatus" in record || "feedbackId" in record) return "feedback";
  return "growth";
}

function uniqueSignals(signals: ParentTrendQueryResponse["supportingSignals"], limit = 6) {
  const result: ParentTrendQueryResponse["supportingSignals"] = [];
  const seen = new Set<string>();
  for (const signal of signals) {
    const key = `${signal.sourceType}:${signal.date ?? ""}:${signal.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
    if (result.length >= limit) break;
  }
  return result;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function buildComparison(points: ParentTrendSeriesPoint[]): {
  comparison: ParentTrendComparison;
  trendLabel: ParentTrendLabel;
  trendScore: number;
} {
  const values = points.map((point) => point.value).filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return {
      comparison: { baselineAvg: null, recentAvg: null, deltaPct: null, direction: "insufficient" },
      trendLabel: "需关注",
      trendScore: 0,
    };
  }

  if (values.length < 2) {
    return {
      comparison: { baselineAvg: null, recentAvg: round(values[0] ?? null), deltaPct: null, direction: "insufficient" },
      trendLabel: "需关注",
      trendScore: round(values[0] ?? 0) ?? 0,
    };
  }

  const midpoint = Math.max(1, Math.floor(values.length / 2));
  const baselineAvg = average(values.slice(0, midpoint));
  const recentAvg = average(values.slice(midpoint));
  const delta = recentAvg - baselineAvg;
  const deltaPct = Math.abs(baselineAvg) > 1e-6 ? (delta / baselineAvg) * 100 : null;
  const direction: ParentTrendDirection = delta >= 2 ? "up" : delta <= -2 ? "down" : "flat";
  const volatility = Math.sqrt(average(values.map((value) => (value - average(values)) ** 2)));
  const trendLabel: ParentTrendLabel =
    delta >= 8 ? "改善" : delta <= -8 || recentAvg < 55 ? "需关注" : volatility >= 12 ? "波动" : "稳定";

  return {
    comparison: {
      baselineAvg: round(baselineAvg),
      recentAvg: round(recentAvg),
      deltaPct: round(deltaPct),
      direction,
    },
    trendLabel,
    trendScore: round(recentAvg) ?? 0,
  };
}

function buildFeedbackSignals(snapshot: AppStateSnapshot, childId: string) {
  const feedback = asRecords(snapshot.feedback)
    .filter((record) => readString(record.childId) === childId)
    .sort((a, b) => {
      const left = recordDate(a, ["submittedAt", "date", "createdAt"])?.getTime() ?? 0;
      const right = recordDate(b, ["submittedAt", "date", "createdAt"])?.getTime() ?? 0;
      return right - left;
    })
    .slice(0, 2);

  const signals: ParentTrendQueryResponse["supportingSignals"] = [];
  const warnings: string[] = [];
  let explanation = "";

  for (const record of feedback) {
    const note = textOf(record, ["notes", "freeNote", "content"]);
    const executionStatus = readString(record.executionStatus) || "unknown";
    const improvementStatus = readString(record.improvementStatus) || readString(record.improved) || "unknown";
    const childReaction = readString(record.childReaction) || "unknown";
    const barriers = Array.isArray(record.barriers) ? record.barriers.map(readString).filter(Boolean) : [];
    const date = recordDate(record, ["submittedAt", "date", "createdAt"]);
    const summary = [
      `已纳入家长反馈：执行状态 ${executionStatus}`,
      `孩子反应 ${childReaction}`,
      `效果 ${improvementStatus}`,
      barriers[0] ? `主要阻碍 ${barriers[0]}` : "",
      note,
    ].filter(Boolean).join("；");

    signals.push({
      sourceType: "feedback",
      date: date ? dateKey(date) : null,
      summary,
    });
    if (!explanation) explanation = summary;
    if (/not_started|unable|worse|no_change|未|无法|变差|没有/u.test(`${executionStatus} ${improvementStatus}`)) {
      warnings.push(`最新家长反馈提示仍需跟进：${summary}`);
    }
  }

  return { signals, warnings, explanation };
}

export function isParentTrendQueryResponse(value: unknown): value is ParentTrendQueryResponse {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.query) &&
    typeof value.intent === "string" &&
    typeof value.metric === "string" &&
    isRecord(value.child) &&
    typeof value.windowDays === "number" &&
    isRecord(value.range) &&
    Array.isArray(value.labels) &&
    Array.isArray(value.xAxis) &&
    Array.isArray(value.series) &&
    typeof value.trendLabel === "string" &&
    typeof value.trendScore === "number" &&
    isRecord(value.comparison) &&
    typeof value.explanation === "string" &&
    Array.isArray(value.supportingSignals) &&
    isRecord(value.dataQuality) &&
    Array.isArray(value.warnings) &&
    typeof value.source === "string" &&
    typeof value.fallback === "boolean"
  );
}

export function buildParentTrendFallbackResponse(input: {
  payload: ParentTrendQueryPayload;
  fallbackReason: string;
  now?: string;
}): ParentTrendQueryResponse {
  const question = readString(input.payload.question);
  if (!question) {
    throw new Error("趋势问题不能为空。");
  }

  const selected = selectSnapshot(input.payload, input.now);
  const child = resolveChild(selected.snapshot, input.payload.childId);
  if (!child?.id) {
    throw new Error("当前没有可用于生成趋势解释的孩子数据。");
  }

  const windowDays = resolveWindowDays(question, input.payload.windowDays ?? null);
  const endDate = candidateEndDate(selected.snapshot, child.id);
  const range = Array.from({ length: windowDays }, (_, index) =>
    dateKey(addDays(endDate, index - windowDays + 1))
  );
  const buckets = buildBuckets(selected.snapshot, child.id, range);
  const intent = resolveIntent(question);
  const metrics = {
    emotion: buildEmotionMetrics(range, buckets),
    diet: buildDietMetrics(range, buckets),
    sleep: buildSleepMetrics(range, buckets),
    health: buildHealthMetrics(range, buckets),
  };
  const selectedMetrics =
    intent === "growth_overall"
      ? buildOverallMetrics(range, metrics)
      : metrics[intent];
  const observedDays = selectedMetrics.primaryPoints.filter((point) => point.value !== null).length;
  const coverageRatio = windowDays > 0 ? observedDays / windowDays : 0;
  const sparse = observedDays === 0 || observedDays < Math.min(3, windowDays) || coverageRatio < 0.4;
  const { comparison, trendLabel, trendScore } = buildComparison(selectedMetrics.primaryPoints);
  const feedback = buildFeedbackSignals(selected.snapshot, child.id);
  const warnings = [
    ...selected.warnings,
    `AI provider 不可用，已降级为本地趋势解释（${input.fallbackReason}）。`,
    sparse ? `当前有效记录覆盖 ${observedDays}/${windowDays} 天，趋势判断会保守展示。` : "",
    ...feedback.warnings,
  ].filter(Boolean);
  const childName = readString(child.name) || "孩子";
  const explanation = [
    `基于当前记录的本地趋势解释：最近 ${windowDays} 天，${childName}的${INTENT_LABELS[intent]}显示为“${trendLabel}”。`,
    comparison.direction === "insufficient"
      ? `目前可用样本为 ${observedDays}/${windowDays} 天，先以记录事实和后续观察为主。`
      : `后半段与前半段相比方向为 ${comparison.direction}，本地分数约 ${trendScore}。`,
    feedback.explanation,
    "远端 AI 恢复后可继续生成更完整的解释，本次不会阻断家长端主流程。",
  ].filter(Boolean).join(" ");

  return {
    query: {
      question,
      requestedWindowDays: input.payload.windowDays ?? null,
      resolvedWindowDays: windowDays,
      childId: child.id,
      childName: readString(child.name) || null,
    },
    intent,
    metric: INTENT_METRICS[intent],
    child: {
      childId: child.id,
      name: readString(child.name) || null,
      nickname: readString(child.nickname) || null,
      className: readString(child.className) || null,
      institutionId: readString(child.institutionId) || null,
      birthDate: readString(child.birthDate) || null,
      ageBand: readString((child as unknown as TrendRecord).ageBand) || null,
      normalizedAgeBand: null,
      ageBandSource: null,
    },
    windowDays,
    range: {
      startDate: range[0] ?? dateKey(endDate),
      endDate: range[range.length - 1] ?? dateKey(endDate),
    },
    labels: range,
    xAxis: range.map(dayLabel),
    series: selectedMetrics.series,
    trendLabel: sparse && observedDays === 0 ? "需关注" : trendLabel,
    trendScore: sparse && observedDays === 0 ? 0 : trendScore,
    comparison,
    explanation,
    supportingSignals: uniqueSignals([...feedback.signals, ...selectedMetrics.signals]),
    dataQuality: {
      observedDays,
      coverageRatio: round(coverageRatio, 2) ?? 0,
      sparse,
      fallbackUsed: true,
      source: selected.source,
    },
    warnings,
    memoryMeta: {
      mode: "next-local-fallback",
      fallbackReason: input.fallbackReason,
    },
    source: selected.source,
    fallback: true,
    fallbackReason: input.fallbackReason,
  };
}
