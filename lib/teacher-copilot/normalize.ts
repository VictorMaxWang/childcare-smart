import type { TeacherAgentResult } from "@/lib/agent/teacher-agent";
import type {
  TeacherVoiceDraftItem,
  TeacherVoiceUnderstandResponse,
} from "@/lib/ai/teacher-voice-understand";
import type { TeacherDraftUnderstandingSeed } from "@/lib/mobile/teacher-draft-records";
import type { TeacherVoiceDraftPayload } from "@/lib/mobile/voice-input";
import type {
  TeacherCopilotCommunicationScript,
  TeacherCopilotHint,
  TeacherCopilotPayload,
  TeacherCopilotSOP,
  TeacherCopilotStep,
} from "@/lib/teacher-copilot/types";

const LOW_CONFIDENCE_THRESHOLD = 0.68;

const WARNING_COPY: Record<
  string,
  { title: string; detail: string; tone?: TeacherCopilotHint["tone"] }
> = {
  multiple_children_detected: {
    title: "先确认记录对象",
    detail: "这段输入可能提到了多名幼儿，确认当前草稿只对应 1 名幼儿后再保存。",
    tone: "warning",
  },
  child_ref_unresolved: {
    title: "补齐幼儿指向",
    detail: "系统还没有把内容稳定挂到具体幼儿，保存前补一句幼儿姓名或场景。",
    tone: "warning",
  },
  router_low_confidence: {
    title: "补一句场景和结果",
    detail: "当前理解置信度偏低，建议补充时间点、具体表现和处理结果。",
    tone: "warning",
  },
  draft_items_empty: {
    title: "先补可记录事实",
    detail: "当前内容还不足以生成结构化草稿，先补一句客观观察事实。",
    tone: "warning",
  },
  mixed_task_unresolved: {
    title: "拆成单条记录",
    detail: "这段输入里可能混了多类事件，建议拆成单条可确认草稿。",
    tone: "warning",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

function readSectionRecord(source: unknown, key: string) {
  if (!isRecord(source)) return undefined;
  return source[key];
}

function readSectionRecordAny(source: unknown, ...keys: string[]) {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }
  return undefined;
}

function parseHint(value: unknown, index: number): TeacherCopilotHint | null {
  if (typeof value === "string") {
    return {
      id: `hint-${index + 1}`,
      title: value.trim(),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const title =
    readString(value.title) ??
    readString(value.label) ??
    readString(value.headline) ??
    readString(value.name);
  if (!title) {
    return null;
  }

  const toneValue =
    readString(value.tone) ??
    readString(value.level) ??
    readString(value.severity);
  const tone =
    toneValue === "warning" || toneValue === "info" ? toneValue : undefined;

  return {
    id: readString(value.id) ?? `hint-${index + 1}`,
    title,
    detail:
      readString(value.detail) ??
      readString(value.reason) ??
      readString(value.suggested_prompt) ??
      readString(value.description) ??
      readString(value.body) ??
      readString(value.message),
    tone,
    tags: readStringArray(value.tags),
  };
}

function parseHints(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => parseHint(item, index))
    .filter((item): item is TeacherCopilotHint => Boolean(item));
}

function parseStep(value: unknown): TeacherCopilotStep | null {
  if (typeof value === "string") {
    return {
      title: value.trim(),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const title =
    readString(value.title) ??
    readString(value.label) ??
    readString(value.name);
  if (!title) {
    return null;
  }

  return {
    title,
    detail:
      readString(value.detail) ??
      readString(value.description) ??
      readString(value.body),
  };
}

function parseSOP(value: unknown): TeacherCopilotSOP | null {
  if (typeof value === "string") {
    return {
      title: "30 秒微培训 SOP",
      summary: value.trim(),
      durationLabel: "30 秒",
      steps: [],
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const steps = Array.isArray(value.steps)
    ? value.steps
        .map((item) => parseStep(item))
        .filter((item): item is TeacherCopilotStep => Boolean(item))
    : Array.isArray(value.items)
      ? value.items
          .map((item) => parseStep(item))
          .filter((item): item is TeacherCopilotStep => Boolean(item))
      : [];

  const title =
    readString(value.title) ??
    readString(value.label) ??
    readString(value.headline) ??
    (steps.length > 0 ? "30 秒微培训 SOP" : undefined);
  if (!title) {
    return null;
  }

  return {
    title,
    summary:
      readString(value.summary) ??
      readString(value.reason) ??
      readString(value.description) ??
      readString(value.body),
    durationLabel:
      readString(value.durationLabel) ??
      readString(value.duration) ??
      readString(value.duration_text) ??
      readString(value.timeHint),
    steps,
  };
}

function parseSOPValue(value: unknown): TeacherCopilotSOP | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseSOP(item);
      if (parsed) {
        return parsed;
      }
    }
    return null;
  }

  return parseSOP(value);
}

function parseCommunicationScript(value: unknown): TeacherCopilotCommunicationScript | null {
  if (typeof value === "string") {
    return {
      title: "家长沟通话术卡",
      opening: value.trim(),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const title =
    readString(value.title) ??
    readString(value.label) ??
    readString(value.headline) ??
    "家长沟通话术卡";
  const bullets =
    Array.isArray(value.bullets) || Array.isArray(value.keyPoints)
      ? readStringArray(value.bullets ?? value.keyPoints)
      : [];

  const script = {
    title,
    opening:
      readString(value.opening) ??
      readString(value.open) ??
      readString(value.short_message),
    situation:
      readString(value.situation) ??
      readString(value.context) ??
      readString(value.observation) ??
      readString(value.calm_explanation),
    ask:
      readString(value.ask) ??
      readString(value.request) ??
      readString(value.familyAsk),
    closing:
      readString(value.closing) ??
      readString(value.wrapUp) ??
      readString(value.followUp) ??
      readString(value.follow_up_reminder),
    bullets,
  } satisfies TeacherCopilotCommunicationScript;

  if (
    !script.opening &&
    !script.situation &&
    !script.ask &&
    !script.closing &&
    script.bullets.length === 0
  ) {
    return null;
  }

  return script;
}

function firstHints(...values: Array<TeacherCopilotHint[] | null | undefined>) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function firstValue<T>(...values: Array<T | null | undefined>) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function cleanupCopilotPayload(payload: TeacherCopilotPayload): TeacherCopilotPayload | null {
  const normalized: TeacherCopilotPayload = {
    recordCompletionHints:
      payload.recordCompletionHints && payload.recordCompletionHints.length > 0
        ? payload.recordCompletionHints
        : undefined,
    microTrainingSOP: payload.microTrainingSOP ?? undefined,
    parentCommunicationScript: payload.parentCommunicationScript ?? undefined,
  };

  if (
    !normalized.recordCompletionHints &&
    !normalized.microTrainingSOP &&
    !normalized.parentCommunicationScript
  ) {
    return null;
  }

  return normalized;
}

export function normalizeTeacherCopilotPayload(source: unknown): TeacherCopilotPayload | null {
  if (!isRecord(source)) {
    return null;
  }

  const nestedCopilot = readSectionRecord(source, "copilot");
  const hints = firstHints(
    parseHints(
      readSectionRecordAny(source, "recordCompletionHints", "record_completion_hints")
    ),
    parseHints(
      readSectionRecordAny(
        nestedCopilot,
        "recordCompletionHints",
        "record_completion_hints"
      )
    )
  );
  const sop = firstValue(
    parseSOPValue(readSectionRecordAny(source, "microTrainingSOP", "micro_training_sop")),
    parseSOPValue(
      readSectionRecordAny(nestedCopilot, "microTrainingSOP", "micro_training_sop")
    )
  );
  const script = firstValue(
    parseCommunicationScript(
      readSectionRecordAny(
        source,
        "parentCommunicationScript",
        "parent_communication_script"
      )
    ),
    parseCommunicationScript(
      readSectionRecordAny(
        nestedCopilot,
        "parentCommunicationScript",
        "parent_communication_script"
      )
    )
  );

  return cleanupCopilotPayload({
    recordCompletionHints: hints,
    microTrainingSOP: sop,
    parentCommunicationScript: script,
  });
}

function buildWarningHint(warning: string, index: number): TeacherCopilotHint {
  const knownCopy = WARNING_COPY[warning];
  if (knownCopy) {
    return {
      id: `warning-${index + 1}`,
      title: knownCopy.title,
      detail: knownCopy.detail,
      tone: knownCopy.tone ?? "warning",
      tags: [warning],
    };
  }

  return {
    id: `warning-${index + 1}`,
    title: "补一条更清楚的老师记录",
    detail: warning,
    tone: "warning",
  };
}

function buildLowConfidenceHint(item: TeacherVoiceDraftItem, index: number): TeacherCopilotHint {
  const suggestion = item.suggested_actions[0];

  return {
    id: `low-confidence-${index + 1}`,
    title: `补充 ${item.category} 关键事实`,
    detail:
      suggestion ??
      `${item.summary}。建议补一句时间点、场景和处理结果后再确认。`,
    tone: "warning",
    tags: [item.category],
  };
}

function buildFallbackRecordCompletionHints(seed: {
  warnings: string[];
  draft_items: TeacherVoiceDraftItem[];
}) {
  const warningHints = seed.warnings.map((warning, index) =>
    buildWarningHint(warning, index)
  );
  const lowConfidenceHints = seed.draft_items
    .filter((item) => item.confidence < LOW_CONFIDENCE_THRESHOLD)
    .slice(0, 2)
    .map((item, index) => buildLowConfidenceHint(item, index));

  const suggestedActionHint =
    warningHints.length === 0 && lowConfidenceHints.length === 0
      ? seed.draft_items
          .flatMap((item) =>
            item.suggested_actions[0]
              ? [
                  {
                    id: `suggested-action-${item.category}`,
                    title: "保存前补一句关键动作",
                    detail: item.suggested_actions[0],
                    tone: "info" as const,
                    tags: [item.category],
                  },
                ]
              : []
          )
          .slice(0, 1)
      : [];

  return [...warningHints, ...lowConfidenceHints, ...suggestedActionHint].slice(0, 3);
}

function buildDraftFallbackSOP(
  seed: Pick<TeacherDraftUnderstandingSeed, "warnings" | "draft_items">
): TeacherCopilotSOP | null {
  const hasAttentionSignal =
    seed.warnings.length > 0 ||
    seed.draft_items.some((item) => item.confidence < LOW_CONFIDENCE_THRESHOLD);
  if (!hasAttentionSignal) {
    return null;
  }

  const firstAction = seed.draft_items
    .flatMap((item) => item.suggested_actions)
    .find((item) => item.trim().length > 0);

  return {
    title: "30 秒补录 SOP",
    summary: "先确认对象，再补一句事实，最后再保存草稿。",
    durationLabel: "30 秒",
    steps: [
      {
        title: "先确认对象",
        detail: "保存前确认这条草稿只对应 1 名幼儿和 1 个场景。",
      },
      {
        title: "补一句事实",
        detail:
          firstAction ??
          "补充时间点、表现和老师已做动作，让记录能被后续流程继续消费。",
      },
      {
        title: "再确认交接点",
        detail: "保存前检查是否写清后续观察点或需要同步家长的信息。",
      },
    ],
  };
}

function buildFallbackResultSOP(result: TeacherAgentResult): TeacherCopilotSOP | null {
  if (result.workflow !== "follow-up") {
    return null;
  }

  const steps = [
    {
      title: "先对齐重点",
      detail: result.highlights[0] ?? result.summary,
    },
    {
      title: "执行当班动作",
      detail:
        result.actionItems[0]?.action ??
        result.interventionCard?.todayInSchoolAction,
    },
    {
      title: "锁定下一观察点",
      detail:
        result.tomorrowObservationPoint ?? result.interventionCard?.reviewIn48h,
    },
  ].filter(
    (item): item is TeacherCopilotStep & { detail: string } =>
      Boolean(item.detail)
  );

  if (steps.length === 0) {
    return null;
  }

  return {
    title: "30 秒微培训 SOP",
    summary: "先完成园内动作，再确认家园交接，最后锁定下一观察点。",
    durationLabel: "30 秒",
    steps,
  };
}

function buildFallbackCommunicationScript(
  result: TeacherAgentResult
): TeacherCopilotCommunicationScript | null {
  if (
    result.workflow !== "communication" ||
    (!result.parentMessageDraft &&
      result.actionItems.length === 0 &&
      !result.tomorrowObservationPoint)
  ) {
    return null;
  }

  return {
    title: "家长沟通话术卡",
    opening: `${result.targetLabel} 今天有一个需要同步的观察点。`,
    situation: result.highlights[0] ?? result.summary,
    ask:
      result.interventionCard?.tonightHomeAction ??
      result.actionItems[0]?.action ??
      result.tomorrowObservationPoint,
    closing:
      result.tomorrowObservationPoint ??
      "请家长今晚反馈执行情况，方便明天继续跟进。",
    bullets: result.actionItems
      .slice(0, 2)
      .map((item) => `${item.timing}：${item.action}`),
  };
}

export function normalizeTeacherCopilotFromVoiceUnderstand(
  understanding: TeacherVoiceUnderstandResponse | null | undefined
) {
  if (!understanding) {
    return null;
  }

  const explicit = normalizeTeacherCopilotPayload(understanding);
  const fallbackHints = buildFallbackRecordCompletionHints(understanding);
  const fallbackSOP = buildDraftFallbackSOP(understanding);

  return cleanupCopilotPayload({
    recordCompletionHints: firstHints(
      explicit?.recordCompletionHints,
      fallbackHints
    ),
    microTrainingSOP: firstValue(explicit?.microTrainingSOP, fallbackSOP),
    parentCommunicationScript: explicit?.parentCommunicationScript,
  });
}

export function normalizeTeacherCopilotFromDraftSeed(
  seed: TeacherDraftUnderstandingSeed | null | undefined
) {
  if (!seed) {
    return null;
  }

  const explicit = normalizeTeacherCopilotPayload(seed);
  const fallbackHints = buildFallbackRecordCompletionHints(seed);
  const fallbackSOP = buildDraftFallbackSOP(seed);

  return cleanupCopilotPayload({
    recordCompletionHints: firstHints(
      explicit?.recordCompletionHints,
      fallbackHints
    ),
    microTrainingSOP: firstValue(explicit?.microTrainingSOP, fallbackSOP),
    parentCommunicationScript: explicit?.parentCommunicationScript,
  });
}

export function normalizeTeacherCopilotFromDraftPayload(
  payload: TeacherVoiceDraftPayload | Record<string, unknown> | null | undefined
) {
  if (!payload) {
    return null;
  }

  const payloadSections = normalizeTeacherCopilotPayload(payload);
  const seed = isRecord(payload) && isRecord(payload.t5Seed)
    ? (payload.t5Seed as unknown as TeacherDraftUnderstandingSeed)
    : null;
  const seedSections = normalizeTeacherCopilotFromDraftSeed(seed);
  const understanding = isRecord(payload) && isRecord(payload.understanding)
    ? (payload.understanding as unknown as TeacherVoiceUnderstandResponse)
    : null;
  const understandingSections = normalizeTeacherCopilotFromVoiceUnderstand(understanding);

  return cleanupCopilotPayload({
    recordCompletionHints: firstHints(
      payloadSections?.recordCompletionHints,
      seedSections?.recordCompletionHints,
      understandingSections?.recordCompletionHints
    ),
    microTrainingSOP: firstValue(
      payloadSections?.microTrainingSOP,
      seedSections?.microTrainingSOP,
      understandingSections?.microTrainingSOP
    ),
    parentCommunicationScript: firstValue(
      payloadSections?.parentCommunicationScript,
      seedSections?.parentCommunicationScript,
      understandingSections?.parentCommunicationScript
    ),
  });
}

export function normalizeTeacherCopilotFromResult(
  result: TeacherAgentResult | null | undefined
) {
  if (!result) {
    return null;
  }

  const explicit = normalizeTeacherCopilotPayload(result);
  const fallbackSOP = buildFallbackResultSOP(result);
  const fallbackScript = buildFallbackCommunicationScript(result);

  return cleanupCopilotPayload({
    recordCompletionHints: explicit?.recordCompletionHints,
    microTrainingSOP: firstValue(explicit?.microTrainingSOP, fallbackSOP),
    parentCommunicationScript: firstValue(
      explicit?.parentCommunicationScript,
      fallbackScript
    ),
  });
}

export function hasTeacherDraftAttentionSignal(
  seed: TeacherDraftUnderstandingSeed | null | undefined
) {
  if (!seed) {
    return false;
  }

  return (
    seed.warnings.length > 0 ||
    seed.draft_items.some((item) => item.confidence < LOW_CONFIDENCE_THRESHOLD)
  );
}

export function hasTeacherResultAttentionSignal(
  result: TeacherAgentResult | null | undefined
) {
  if (!result) {
    return false;
  }

  return result.source !== "ai" || Boolean(result.consultationMode);
}
