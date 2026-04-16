import type { TeacherCopilotPayload } from "@/lib/teacher-copilot/types";
import {
  buildTeacherVoiceCopilotCompatPayload,
  buildTeacherVoiceCopilotPayload,
  type TeacherVoiceMicroTrainingSOP,
  type TeacherVoiceParentCommunicationScript,
  type TeacherVoiceRecordCompletionHint,
} from "@/lib/ai/teacher-voice-copilot";

export type TeacherVoiceCategory =
  | "DIET"
  | "EMOTION"
  | "HEALTH"
  | "SLEEP"
  | "LEAVE"
  | "MIXED";

export interface TeacherVoiceTranscriptPayload {
  text: string;
  source: string;
  confidence: number | null;
  provider: string;
  mode: string;
  fallback: boolean;
  raw: Record<string, unknown>;
  meta: Record<string, unknown>;
}

export interface TeacherVoiceRouterTask {
  task_id: string;
  category: TeacherVoiceCategory;
  child_ref: string | null;
  child_name: string | null;
  raw_excerpt: string;
  confidence: number;
  meta: Record<string, unknown>;
}

export interface TeacherVoiceRouterResult {
  is_multi_child: boolean;
  is_multi_event: boolean;
  primary_category: TeacherVoiceCategory;
  tasks: TeacherVoiceRouterTask[];
}

export interface TeacherVoiceDraftItem {
  child_ref: string | null;
  child_name: string | null;
  category: Exclude<TeacherVoiceCategory, "MIXED">;
  summary: string;
  structured_fields: Record<string, unknown>;
  confidence: number;
  suggested_actions: string[];
  raw_excerpt: string;
  source: string;
}

export interface TeacherVoiceUnderstandResponse {
  transcript: TeacherVoiceTranscriptPayload;
  router_result: TeacherVoiceRouterResult;
  draft_items: TeacherVoiceDraftItem[];
  warnings: string[];
  record_completion_hints: TeacherVoiceRecordCompletionHint[];
  micro_training_sop: TeacherVoiceMicroTrainingSOP[];
  parent_communication_script: TeacherVoiceParentCommunicationScript;
  copilot?: TeacherCopilotPayload | Record<string, unknown> | null;
  recordCompletionHints?: TeacherCopilotPayload["recordCompletionHints"];
  microTrainingSOP?: TeacherCopilotPayload["microTrainingSOP"];
  parentCommunicationScript?: TeacherCopilotPayload["parentCommunicationScript"];
  source: {
    asr: string;
    router: string;
    chaining: string;
  };
  model: {
    asr: string | null;
    router: string;
    chaining: string;
  };
  generated_at: string;
  trace: {
    request_id: string;
    trace_id: string | null;
    fallback: boolean;
    input_mode: "json" | "multipart";
    stages: string[];
  };
  meta: {
    scene: string | null;
    attachment_name: string | null;
    mime_type: string | null;
    duration_ms: number | null;
    asr: Record<string, unknown>;
  };
}

export interface TeacherVoiceUnderstandFallbackInput {
  transcript: string;
  childId?: string;
  childName?: string;
  attachmentName?: string;
  mimeType?: string;
  durationMs?: number;
  scene?: string;
  traceId?: string;
  inputMode: "json" | "multipart";
  asrProvider: string;
  asrMode: string;
  asrSource: string;
  asrConfidence: number | null;
  asrRaw?: Record<string, unknown>;
  asrMeta?: Record<string, unknown>;
  asrFallback: boolean;
}

const CATEGORY_PRIORITY: Exclude<TeacherVoiceCategory, "MIXED">[] = [
  "HEALTH",
  "LEAVE",
  "SLEEP",
  "DIET",
  "EMOTION",
];

const KEYWORDS: Record<Exclude<TeacherVoiceCategory, "MIXED">, string[]> = {
  DIET: ["吃饭", "午餐", "早餐", "晚餐", "点心", "喝水", "饮水", "饭量", "食欲", "挑食", "过敏"],
  EMOTION: ["哭", "哭闹", "情绪", "焦虑", "安抚", "黏人", "冲突", "生气"],
  HEALTH: ["发热", "发烧", "体温", "咳嗽", "腹泻", "呕吐", "红疹", "不适", "观察", "复查"],
  SLEEP: ["午睡", "入睡", "惊醒", "早醒", "睡觉", "睡眠", "没睡"],
  LEAVE: ["请假", "离园", "接走", "回家", "病假", "事假", "返园"],
};

function uniqueItems(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeTranscript(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function splitSegments(transcript: string) {
  const primary = transcript
    .split(/[。；;\n]+/u)
    .map((item) => item.trim())
    .filter(Boolean);

  const segments = primary.flatMap((item) =>
    item
      .split(/(?:同时|然后|还有|并且|另外|随后)/u)
      .map((part) => part.trim())
      .filter(Boolean)
  );

  return segments.length ? segments : [transcript];
}

function extractChildNames(segment: string, providedChildName?: string) {
  const names = new Set<string>();
  if (providedChildName?.trim()) names.add(providedChildName.trim());

  const patterns = [
    /([一-龥]{2,4})(?=小朋友|同学|宝宝)/gu,
    /([小阿大][一-龥]{1,2})(?=(?:今天|同学|小朋友|宝宝|午睡|午餐|请假|体温|发热|哭|吃|喝|回家))/gu,
  ];

  for (const pattern of patterns) {
    for (const match of segment.matchAll(pattern)) {
      const candidate = match[1]?.trim();
      if (candidate) names.add(candidate);
    }
  }

  return [...names];
}

function scoreSegment(segment: string) {
  const scores = new Map<Exclude<TeacherVoiceCategory, "MIXED">, number>();
  for (const category of CATEGORY_PRIORITY) {
    scores.set(
      category,
      KEYWORDS[category].reduce((total, keyword) => total + (segment.includes(keyword) ? 1 : 0), 0)
    );
  }

  const temperatureMatch = segment.match(/(\d{2}(?:\.\d)?)\s*度/u);
  if (temperatureMatch) {
    scores.set("HEALTH", (scores.get("HEALTH") ?? 0) + 2);
  }

  let primary: Exclude<TeacherVoiceCategory, "MIXED"> = "EMOTION";
  let maxScore = -1;
  for (const category of CATEGORY_PRIORITY) {
    const score = scores.get(category) ?? 0;
    if (score > maxScore) {
      primary = category;
      maxScore = score;
    }
  }

  const secondary = CATEGORY_PRIORITY.filter(
    (category) => category !== primary && (scores.get(category) ?? 0) > 0
  );

  return {
    primary: maxScore > 0 ? primary : "EMOTION",
    scores,
    secondary,
    fallback: maxScore <= 0,
  };
}

function inferRouterResult(params: {
  transcript: string;
  childId?: string;
  childName?: string;
}) {
  const warnings: string[] = [];
  const detectedNames = new Set<string>();
  const tasks: TeacherVoiceRouterTask[] = splitSegments(params.transcript).map((segment, index) => {
    const scoring = scoreSegment(segment);
    const names = extractChildNames(segment, params.childName);
    names.forEach((name) => detectedNames.add(name));
    const childName = names[0] ?? params.childName ?? null;
    let childRef: string | null = null;
    if (params.childId && !params.childName && names.length === 0) {
      childRef = params.childId;
    } else if (params.childId && childName && childName === params.childName) {
      childRef = params.childId;
    }

    const primaryScore = scoring.scores.get(scoring.primary) ?? 0;
    const confidence = scoring.fallback
      ? 0.4
      : Math.min(0.95, 0.55 + primaryScore * 0.12 + scoring.secondary.length * 0.03);

    return {
      task_id: `task-${index + 1}`,
      category: scoring.primary,
      child_ref: childRef,
      child_name: childName,
      raw_excerpt: segment,
      confidence,
      meta: {
        keyword_hits: Object.fromEntries(
          [...scoring.scores.entries()].filter(([, value]) => value > 0)
        ),
        secondary_categories: scoring.secondary,
        fallback: scoring.fallback,
      },
    };
  });

  const categorySet = new Set(tasks.map((task) => task.category));
  const primary_category = categorySet.size > 1 ? "MIXED" : tasks[0]?.category ?? "EMOTION";

  if (detectedNames.size > 1) warnings.push("multiple_children_detected");
  if (!params.childId && tasks.some((task) => task.child_name)) warnings.push("child_ref_unresolved");
  if (tasks.some((task) => task.confidence < 0.5)) warnings.push("router_low_confidence");

  return {
    router_result: {
      is_multi_child: detectedNames.size > 1,
      is_multi_event: tasks.length > 1,
      primary_category,
      tasks,
    } satisfies TeacherVoiceRouterResult,
    warnings,
  };
}

function buildStructuredFields(task: TeacherVoiceRouterTask) {
  const excerpt = task.raw_excerpt;
  if (task.category === "DIET") {
    return {
      meal_period: excerpt.includes("早餐")
        ? "breakfast"
        : excerpt.includes("午餐")
          ? "lunch"
          : excerpt.includes("晚餐")
            ? "dinner"
            : excerpt.includes("点心") || excerpt.includes("加餐")
              ? "snack"
              : null,
      appetite: excerpt.includes("挑食") || excerpt.includes("饭量少") || excerpt.includes("食欲差") ? "low" : null,
      hydration: excerpt.includes("喝水") || excerpt.includes("饮水") ? "mentioned" : null,
      food_items: ["米饭", "牛奶", "水果", "蔬菜", "鸡蛋", "点心"].filter((item) => excerpt.includes(item)),
      allergy_flag: excerpt.includes("过敏") || excerpt.includes("红疹") ? true : null,
    };
  }

  if (task.category === "EMOTION") {
    return {
      mood: excerpt.includes("哭") ? "crying" : excerpt.includes("焦虑") ? "anxious" : "needs_observation",
      trigger: excerpt.includes("午睡前") ? "before_nap" : excerpt.includes("家长") ? "separation" : null,
      duration: null,
      soothing_status: excerpt.includes("安抚后") ? "improved_after_soothing" : null,
      social_context: excerpt.includes("同学") || excerpt.includes("冲突") ? "peer_interaction" : null,
    };
  }

  if (task.category === "HEALTH") {
    const temperature = excerpt.match(/(\d{2}(?:\.\d)?)\s*度/u);
    return {
      symptoms: ["咳嗽", "腹泻", "呕吐", "红疹", "发热", "发烧", "流涕", "鼻塞"].filter((item) =>
        excerpt.includes(item)
      ),
      temperature_c: temperature ? Number(temperature[1]) : null,
      body_part: ["喉咙", "肚子", "皮肤", "鼻子", "胃", "头", "眼睛"].find((item) => excerpt.includes(item)) ?? null,
      severity_hint:
        excerpt.includes("就医") || excerpt.includes("持续") ? "high" : temperature || excerpt.includes("观察") ? "medium" : "low",
      follow_up_needed: /(观察|复查|就医|回家)/u.test(excerpt),
    };
  }

  if (task.category === "SLEEP") {
    const minuteMatch = excerpt.match(/(\d{1,3})\s*(?:分钟|分)/u);
    const hourMatch = excerpt.match(/(\d{1,2}(?:\.\d)?)\s*(?:小时|h)/u);
    return {
      sleep_phase: excerpt.includes("午睡") ? "nap" : excerpt.includes("入睡") ? "fall_asleep" : null,
      sleep_duration_min: minuteMatch
        ? Number(minuteMatch[1])
        : hourMatch
          ? Math.round(Number(hourMatch[1]) * 60)
          : null,
      sleep_quality: excerpt.includes("惊醒") || excerpt.includes("早醒") ? "interrupted" : excerpt.includes("没睡") ? "poor" : null,
      wake_pattern: excerpt.includes("早醒") ? "early_wake" : excerpt.includes("惊醒") ? "sudden_wake" : null,
    };
  }

  return {
    leave_type: excerpt.includes("病假")
      ? "sick_leave"
      : excerpt.includes("事假")
        ? "personal_leave"
        : excerpt.includes("接走") || excerpt.includes("离园")
          ? "early_pickup"
          : "leave_notice",
    time_range: excerpt.includes("上午")
      ? "morning"
      : excerpt.includes("下午")
        ? "afternoon"
        : excerpt.includes("今天")
          ? "today"
          : null,
    reason: excerpt.includes("发热") || excerpt.includes("发烧") ? "fever" : excerpt.includes("观察") ? "home_observation" : null,
    pickup_person: excerpt.includes("妈妈")
      ? "mother"
      : excerpt.includes("爸爸")
        ? "father"
        : excerpt.includes("家长")
          ? "guardian"
          : null,
    return_expected: excerpt.includes("返园") ? "mentioned" : null,
  };
}

function buildSummary(task: TeacherVoiceRouterTask) {
  const childLabel = task.child_name ?? "未识别幼儿";
  switch (task.category) {
    case "DIET":
      return `${childLabel} 今日饮食观察需要补充记录：${task.raw_excerpt}`;
    case "EMOTION":
      return `${childLabel} 出现情绪相关事件：${task.raw_excerpt}`;
    case "HEALTH":
      return `${childLabel} 出现健康观察信号：${task.raw_excerpt}`;
    case "SLEEP":
      return `${childLabel} 睡眠相关情况需继续跟进：${task.raw_excerpt}`;
    default:
      return `${childLabel} 存在请假或离园事项：${task.raw_excerpt}`;
  }
}

function buildSuggestedActions(task: TeacherVoiceRouterTask) {
  if (task.category === "HEALTH") {
    return ["补充记录症状出现时间和复查结果。", "如已离园或需请假，提醒家长回传观察反馈。"];
  }
  if (task.category === "LEAVE") {
    return ["确认请假或离园原因、接送人与返园预期。", "提醒家长补充在家观察结果，便于次日衔接。"];
  }
  if (task.category === "SLEEP") {
    return ["记录入睡时点、持续时长和醒后状态。", "如睡眠波动影响情绪或健康，补充联动观察。"];
  }
  if (task.category === "DIET") {
    return ["补充记录进食量和饮水量。", "如持续食欲下降，和家长同步今日饮食观察。"];
  }
  return ["记录触发场景和安抚方式。", "离园前同步家长今日情绪变化和后续观察点。"];
}

function buildDraftItems(routerResult: TeacherVoiceRouterResult) {
  const warnings: string[] = [];
  const draftItems = routerResult.tasks
    .filter(
      (
        task
      ): task is TeacherVoiceRouterTask & {
        category: Exclude<TeacherVoiceCategory, "MIXED">;
      } => {
        if (task.category === "MIXED") {
          warnings.push("mixed_task_unresolved");
          return false;
        }
        return true;
      }
    )
    .map(
      (task) =>
        ({
          child_ref: task.child_ref,
          child_name: task.child_name,
          category: task.category,
          summary: buildSummary(task),
          structured_fields: buildStructuredFields(task),
          confidence: task.confidence,
          suggested_actions: buildSuggestedActions(task),
          raw_excerpt: task.raw_excerpt,
          source: "rule-chain",
        }) satisfies TeacherVoiceDraftItem
    );

  if (!draftItems.length) warnings.push("draft_items_empty");
  return { draftItems, warnings };
}

export function buildTeacherVoiceUnderstandFallback(
  input: TeacherVoiceUnderstandFallbackInput
): TeacherVoiceUnderstandResponse {
  const transcript = normalizeTranscript(input.transcript);
  const router = inferRouterResult({
    transcript,
    childId: input.childId,
    childName: input.childName,
  });
  const chaining = buildDraftItems(router.router_result);
  const warnings = uniqueItems([...router.warnings, ...chaining.warnings]);
  const transcriptPayload: TeacherVoiceTranscriptPayload = {
    text: transcript,
    source: input.asrSource,
    confidence: input.asrConfidence,
    provider: input.asrProvider,
    mode: input.asrMode,
    fallback: input.asrFallback,
    raw: input.asrRaw ?? {},
    meta: input.asrMeta ?? {},
  };
  const copilotPayload = buildTeacherVoiceCopilotPayload({
    transcript: {
      text: transcriptPayload.text,
      confidence: transcriptPayload.confidence,
      fallback: transcriptPayload.fallback,
    },
    draftItems: chaining.draftItems,
    warnings,
  });
  const compatCopilotPayload = buildTeacherVoiceCopilotCompatPayload(
    copilotPayload
  );

  return {
    transcript: transcriptPayload,
    router_result: router.router_result,
    draft_items: chaining.draftItems,
    warnings,
    ...copilotPayload,
    ...compatCopilotPayload,
    source: {
      asr: input.asrSource,
      router: "rule",
      chaining: "rule",
    },
    model: {
      asr: input.asrProvider === "mock-asr" ? null : input.asrProvider,
      router: "rule-router-v1",
      chaining: "rule-chain-v1",
    },
    generated_at: new Date().toISOString(),
    trace: {
      request_id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `trace-${Date.now()}`,
      trace_id: input.traceId ?? null,
      fallback: true,
      input_mode: input.inputMode,
      stages: ["asr", "router", "prompt_chain"],
    },
    meta: {
      scene: input.scene ?? null,
      attachment_name: input.attachmentName ?? null,
      mime_type: input.mimeType ?? null,
      duration_ms: input.durationMs ?? null,
      asr: {
        provider: input.asrProvider,
        mode: input.asrMode,
        confidence: input.asrConfidence,
        raw: input.asrRaw ?? {},
        meta: input.asrMeta ?? {},
      },
    },
  };
}
