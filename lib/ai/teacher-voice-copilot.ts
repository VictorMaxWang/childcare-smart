import type {
  TeacherCopilotCommunicationScript,
  TeacherCopilotHint,
  TeacherCopilotPayload,
  TeacherCopilotSOP,
  TeacherCopilotStep,
} from "@/lib/teacher-copilot/types";

export type TeacherVoiceCopilotCategory =
  | "DIET"
  | "EMOTION"
  | "HEALTH"
  | "SLEEP"
  | "LEAVE";

export interface TeacherVoiceRecordCompletionHint {
  label: string;
  reason: string;
  suggested_prompt: string;
}

export interface TeacherVoiceMicroTrainingSOP {
  title: string;
  steps: string[];
  duration_text: string;
  scenario_tag:
    | "health"
    | "sleep"
    | "diet"
    | "emotion"
    | "separation_anxiety";
}

export interface TeacherVoiceParentCommunicationScript {
  short_message: string;
  calm_explanation: string;
  follow_up_reminder: string;
}

export interface TeacherVoiceCopilotTranscriptInput {
  text: string;
  confidence: number | null;
  fallback: boolean;
}

export interface TeacherVoiceCopilotDraftItem {
  child_name: string | null;
  category: TeacherVoiceCopilotCategory;
  summary: string;
  structured_fields: Record<string, unknown>;
  confidence: number;
  raw_excerpt: string;
}

const ASR_LOW_CONFIDENCE = 0.75;
const ROUTER_LOW_CONFIDENCE = 0.65;
const CATEGORY_HINT_PRIORITY: Record<TeacherVoiceCopilotCategory, number> = {
  HEALTH: 0,
  SLEEP: 1,
  DIET: 2,
  EMOTION: 3,
  LEAVE: 4,
};
const SOP_PRIORITY: Record<Exclude<TeacherVoiceCopilotCategory, "LEAVE">, number> = {
  HEALTH: 0,
  SLEEP: 1,
  DIET: 2,
  EMOTION: 3,
};
const COMMUNICATION_PRIORITY: Record<TeacherVoiceCopilotCategory, number> = {
  HEALTH: 0,
  LEAVE: 1,
  SLEEP: 2,
  DIET: 3,
  EMOTION: 4,
};

const FIELD_HINTS: Record<
  TeacherVoiceCopilotCategory,
  Array<{
    field_name: string;
    label: string;
    reason: string;
    suggested_prompt: string;
  }>
> = {
  SLEEP: [
    {
      field_name: "sleep_phase",
      label: "补充睡眠阶段",
      reason: "先明确是午睡、入睡困难还是睡后惊醒，草稿才不会过泛。",
      suggested_prompt: "可以最短补一句：是午睡难入睡，还是睡着后容易惊醒？",
    },
    {
      field_name: "sleep_duration_min",
      label: "补充睡眠时长",
      reason: "睡了多久会直接影响后续对情绪和体力的判断。",
      suggested_prompt: "可以最短补一句：大约睡了多久，或几分钟后醒。",
    },
    {
      field_name: "wake_pattern",
      label: "补充醒后状态",
      reason: "是否早醒、惊醒、哭醒，会决定老师下一步观察重点。",
      suggested_prompt: "可以最短补一句：是自然醒、惊醒，还是醒后情绪明显波动？",
    },
  ],
  DIET: [
    {
      field_name: "meal_period",
      label: "补充是哪一餐",
      reason: "不区分早餐、午餐还是点心，后续饮食判断会失真。",
      suggested_prompt: "可以最短补一句：是早餐、午餐，还是点心时段。",
    },
    {
      field_name: "appetite",
      label: "补充食量表现",
      reason: "只记吃饭事件、不记食量高低，草稿还不够稳。",
      suggested_prompt: "可以最短补一句：是吃得少、挑食，还是基本吃完。",
    },
    {
      field_name: "hydration",
      label: "补充饮水情况",
      reason: "进食和补水通常要一起看，便于后续 follow-up。",
      suggested_prompt: "可以最短补一句：今天喝水怎么样，有没有明显偏少。",
    },
  ],
  EMOTION: [
    {
      field_name: "trigger",
      label: "补充触发场景",
      reason: "情绪记录最怕只有结果，没有触发点。",
      suggested_prompt: "可以最短补一句：是在入园分离、午睡前，还是同伴冲突后开始波动。",
    },
    {
      field_name: "soothing_status",
      label: "补充安抚后变化",
      reason: "是否被安抚下来，会直接影响老师下一步动作。",
      suggested_prompt: "可以最短补一句：安抚后有没有缓下来，大概多久稳定。",
    },
    {
      field_name: "duration",
      label: "补充持续时间",
      reason: "持续时间会帮助区分短暂波动还是需要继续跟进。",
      suggested_prompt: "可以最短补一句：情绪波动大约持续了多久。",
    },
  ],
  HEALTH: [
    {
      field_name: "symptoms",
      label: "补充主要症状",
      reason: "只有“身体不适”太宽泛，后续记录需要具体症状。",
      suggested_prompt: "可以最短补一句：主要是咳嗽、流涕、腹泻，还是精神差。",
    },
    {
      field_name: "temperature_c",
      label: "补充体温",
      reason: "健康场景里体温是最关键的基础字段之一。",
      suggested_prompt: "可以最短补一句：如果量过体温，请补一个数值。",
    },
    {
      field_name: "follow_up_needed",
      label: "补充复查安排",
      reason: "是否需要继续观察、复测或家园联动，会影响后续 follow-up。",
      suggested_prompt: "可以最短补一句：今晚还要继续观察什么，明早需不需要再反馈。",
    },
  ],
  LEAVE: [
    {
      field_name: "reason",
      label: "补充离园/请假原因",
      reason: "只记离园，不记原因，后续衔接容易断。",
      suggested_prompt: "可以最短补一句：是发热、咳嗽，还是家长临时请假。",
    },
    {
      field_name: "pickup_person",
      label: "补充接送人",
      reason: "接送人是园内交接的重要字段。",
      suggested_prompt: "可以最短补一句：今天是谁来接，妈妈、爸爸还是其他监护人。",
    },
    {
      field_name: "return_expected",
      label: "补充返园预期",
      reason: "返园时间影响明天的班级安排和晨检衔接。",
      suggested_prompt: "可以最短补一句：明天预计返园，还是先在家观察。",
    },
  ],
};

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function childLabel(item: TeacherVoiceCopilotDraftItem) {
  return item.child_name?.trim() || "孩子";
}

function sortDraftItems(
  items: TeacherVoiceCopilotDraftItem[],
  priorities: Record<string, number>
) {
  return [...items].sort((left, right) => {
    const leftPriority = priorities[left.category] ?? 99;
    const rightPriority = priorities[right.category] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    if (left.confidence !== right.confidence) return right.confidence - left.confidence;
    return left.summary.localeCompare(right.summary, "zh-CN");
  });
}

function missingFieldCount(item: TeacherVoiceCopilotDraftItem) {
  return (FIELD_HINTS[item.category] ?? []).filter(
    (hint) => !hasValue(item.structured_fields[hint.field_name])
  ).length;
}

function buildRecordCompletionHints(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  draftItems: TeacherVoiceCopilotDraftItem[];
  warnings: string[];
}) {
  const entries: Array<{
    priority: number;
    label: string;
    reason: string;
    suggested_prompt: string;
  }> = [];

  if (params.warnings.includes("transcript_empty")) {
    entries.push({
      priority: 0,
      label: "请先补一条观察原句",
      reason: "当前没有足够的原始描述，系统无法稳定生成结构化草稿。",
      suggested_prompt: "可以最短补一句：谁、什么时候、发生了什么、老师已经做了什么。",
    });
  }

  if (
    params.transcript.fallback ||
    params.warnings.includes("router_low_confidence") ||
    (typeof params.transcript.confidence === "number" &&
      params.transcript.confidence < ASR_LOW_CONFIDENCE)
  ) {
    entries.push({
      priority: 1,
      label: "请再补一句更清晰的事件描述",
      reason: "当前语音识别或理解置信度偏低，直接生成草稿会放大误差。",
      suggested_prompt:
        "可以最短补一句：哪个孩子、什么时间点、发生了什么、老师已经做了什么。",
    });
  }

  if (params.warnings.includes("child_ref_unresolved")) {
    entries.push({
      priority: 2,
      label: "请确认孩子是谁",
      reason: "当前记录还没有稳定映射到具体孩子，后续草稿和 follow-up 会不稳。",
      suggested_prompt: "可以最短补一句：这是哪位孩子，例如“是小明，今天午睡前哭闹”。",
    });
  }

  if (params.warnings.includes("multiple_children_detected")) {
    entries.push({
      priority: 3,
      label: "建议拆成两条记录",
      reason: "一条语音里混入多个孩子，容易让草稿确认和后续沟通混线。",
      suggested_prompt: "可以最短补一句：把两个孩子分开各说一条，分别生成草稿。",
    });
  }

  if (params.warnings.includes("draft_items_empty")) {
    entries.push({
      priority: 4,
      label: "请补一个更具体的观察点",
      reason: "当前内容还不够具体，系统还没法给出稳定草稿。",
      suggested_prompt: "可以最短补一句：补充最明显的现象、时间点和老师动作。",
    });
  }

  for (const item of sortDraftItems(params.draftItems, CATEGORY_HINT_PRIORITY)) {
    const fieldHints = FIELD_HINTS[item.category] ?? [];
    fieldHints.forEach((hint, index) => {
      if (hasValue(item.structured_fields[hint.field_name])) return;
      entries.push({
        priority:
          10 + (CATEGORY_HINT_PRIORITY[item.category] ?? 9) * 3 + index,
        label: hint.label,
        reason: hint.reason,
        suggested_prompt: hint.suggested_prompt,
      });
    });
  }

  const hints: TeacherVoiceRecordCompletionHint[] = [];
  const seenLabels = new Set<string>();
  for (const entry of entries.sort((left, right) => left.priority - right.priority)) {
    if (seenLabels.has(entry.label)) continue;
    seenLabels.add(entry.label);
    hints.push({
      label: entry.label,
      reason: entry.reason,
      suggested_prompt: entry.suggested_prompt,
    });
    if (hints.length >= 3) break;
  }

  return hints;
}

function buildSopForItem(item: TeacherVoiceCopilotDraftItem) {
  const child = childLabel(item);

  if (item.category === "HEALTH") {
    return {
      title: `${child} 健康观察 SOP`,
      steps: [
        "先复述主要症状，补齐体温、出现时间和精神状态。",
        "先做一轮园内复测或持续观察，再判断是否需要离园或复查。",
        "把今晚需要家长反馈的点单独记清。",
      ],
      duration_text: "约30秒",
      scenario_tag: "health",
    } satisfies TeacherVoiceMicroTrainingSOP;
  }

  if (item.category === "SLEEP") {
    return {
      title: `${child} 睡眠记录 SOP`,
      steps: [
        "先补是午睡、入睡困难还是惊醒。",
        "再记大概睡了多久，以及醒后状态。",
        "如果影响下午情绪或进食，再补一条联动观察。",
      ],
      duration_text: "约30秒",
      scenario_tag: "sleep",
    } satisfies TeacherVoiceMicroTrainingSOP;
  }

  if (item.category === "DIET") {
    return {
      title: `${child} 饮食观察 SOP`,
      steps: [
        "先补是哪一餐，再记吃了多少。",
        "再补饮水情况，避免只记进食不记补水。",
        "如果有挑食或过敏信号，单独备注触发食物。",
      ],
      duration_text: "约30秒",
      scenario_tag: "diet",
    } satisfies TeacherVoiceMicroTrainingSOP;
  }

  if (item.category !== "EMOTION") {
    return null;
  }

  if (item.structured_fields.trigger === "separation") {
    return {
      title: `${child} 分离焦虑 SOP`,
      steps: [
        "先确认是在入园分离还是午睡前分离场景开始波动。",
        "再记老师用了什么安抚方式，以及多久缓下来。",
        "离园前同步家长明早接送配合点。",
      ],
      duration_text: "约30秒",
      scenario_tag: "separation_anxiety",
    } satisfies TeacherVoiceMicroTrainingSOP;
  }

  return {
    title: `${child} 情绪观察 SOP`,
    steps: [
      "先补触发场景，避免只记结果不记原因。",
      "再记安抚方式和恢复速度。",
      "如果持续时间偏长，单独补一条后续观察点。",
    ],
    duration_text: "约30秒",
    scenario_tag: "emotion",
  } satisfies TeacherVoiceMicroTrainingSOP;
}

function buildMicroTrainingSop(draftItems: TeacherVoiceCopilotDraftItem[]) {
  const sopItems: TeacherVoiceMicroTrainingSOP[] = [];
  const seenTags = new Set<string>();
  const candidates = draftItems.filter(
    (item): item is TeacherVoiceCopilotDraftItem & {
      category: keyof typeof SOP_PRIORITY;
    } => item.category in SOP_PRIORITY
  );

  for (const item of sortDraftItems(candidates, SOP_PRIORITY)) {
    const sop = buildSopForItem(item);
    if (!sop || seenTags.has(sop.scenario_tag)) continue;
    seenTags.add(sop.scenario_tag);
    sopItems.push(sop);
    if (sopItems.length >= 2) break;
  }

  return sopItems;
}

function symptomText(item: TeacherVoiceCopilotDraftItem) {
  const symptoms = item.structured_fields.symptoms;
  if (Array.isArray(symptoms)) {
    const selected = symptoms
      .map((symptom) => (typeof symptom === "string" ? symptom.trim() : ""))
      .filter(Boolean);
    if (selected.length > 0) return selected.slice(0, 2).join("、");
  }

  const temperature = item.structured_fields.temperature_c;
  if (typeof temperature === "number" && Number.isFinite(temperature)) {
    return `体温 ${temperature.toFixed(1)}℃`;
  }

  return "一些身体不适信号";
}

function leaveReasonText(item: TeacherVoiceCopilotDraftItem) {
  const reason =
    typeof item.structured_fields.reason === "string"
      ? item.structured_fields.reason.trim()
      : "";
  if (reason === "fever") return "因发热离园/请假";
  if (reason === "home_observation") return "需在家继续观察";
  return "有一条离园/请假记录";
}

function needsCaution(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  warnings: string[];
  item: TeacherVoiceCopilotDraftItem;
}) {
  return (
    params.transcript.fallback ||
    params.warnings.includes("router_low_confidence") ||
    (typeof params.transcript.confidence === "number" &&
      params.transcript.confidence < ASR_LOW_CONFIDENCE) ||
    params.item.confidence < ROUTER_LOW_CONFIDENCE ||
    missingFieldCount(params.item) > 0
  );
}

function buildHealthScript(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  warnings: string[];
  item: TeacherVoiceCopilotDraftItem;
}) {
  const child = childLabel(params.item);
  const cautious = needsCaution(params);
  const followUpNeeded = Boolean(params.item.structured_fields.follow_up_needed);

  return {
    short_message: cautious
      ? `今天先观察到${child}在园里有${symptomText(params.item)}，我们已先做记录并继续观察。`
      : `今天${child}在园里出现${symptomText(params.item)}，我们已完成园内记录并继续跟进。`,
    calm_explanation: cautious
      ? "这是一条基于园内初步观察的同步，关键信息还在继续补充确认。"
      : "目前重点是把园内观察和今晚在家状态连起来看，便于判断是否需要继续复查。",
    follow_up_reminder: followUpNeeded
      ? "今晚请反馈体温、精神状态和是否持续不适；如已就医或需在家观察，明早再同步一次。"
      : "今晚请简单反馈体温和精神状态，明早返园前再告诉我们一次。",
  } satisfies TeacherVoiceParentCommunicationScript;
}

function buildLeaveScript(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  warnings: string[];
  item: TeacherVoiceCopilotDraftItem;
}) {
  const child = childLabel(params.item);
  const cautious = needsCaution(params);

  return {
    short_message: cautious
      ? `今天${child}有一条离园/请假记录，我们已先做园内交接。`
      : `今天${child}${leaveReasonText(params.item)}，我们已先做园内交接记录。`,
    calm_explanation: cautious
      ? "当前主要是先把离园原因、接送和返园安排补充确认，避免明天衔接断线。"
      : "目前重点是看今晚状态和明早安排，再判断是否需要继续在家观察。",
    follow_up_reminder: "今晚请反馈在家观察结果；如明早返园或继续请假，请尽早告诉我们。",
  } satisfies TeacherVoiceParentCommunicationScript;
}

function buildSleepScript(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  warnings: string[];
  item: TeacherVoiceCopilotDraftItem;
}) {
  const child = childLabel(params.item);
  const cautious = needsCaution(params);

  return {
    short_message: `今天${child}的睡眠情况有一点波动，我们先同步给您。`,
    calm_explanation: cautious
      ? "这更像园内初步观察，是否是连续性睡眠问题，还需要结合今晚作息继续判断。"
      : "睡眠波动需要结合今晚作息一起看连续性，我们会和明早状态一起判断。",
    follow_up_reminder: "今晚请反馈入睡时间、夜间是否易醒；明早如果仍明显波动，请继续告诉我们。",
  } satisfies TeacherVoiceParentCommunicationScript;
}

function buildDietScript(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  warnings: string[];
  item: TeacherVoiceCopilotDraftItem;
}) {
  const child = childLabel(params.item);
  const cautious = needsCaution(params);

  return {
    short_message: `今天${child}在园里的进食或饮水情况有些波动，我们先同步一下。`,
    calm_explanation: cautious
      ? "这条记录主要用于提醒连续观察，目前还在补齐是哪一餐、食量和饮水情况。"
      : "我们会把园内进食表现和今晚在家情况连起来看，避免只凭单次表现下结论。",
    follow_up_reminder: "今晚请反馈晚餐食量、饮水和是否有不适反应，明早如仍异常请继续告知。",
  } satisfies TeacherVoiceParentCommunicationScript;
}

function buildEmotionScript(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  warnings: string[];
  item: TeacherVoiceCopilotDraftItem;
}) {
  const child = childLabel(params.item);
  const cautious = needsCaution(params);
  const separationTrigger = params.item.structured_fields.trigger === "separation";

  return {
    short_message: separationTrigger
      ? `今天${child}在分离场景下出现情绪波动，我们已先做安抚记录。`
      : `今天${child}在园里有一段情绪波动，我们已先做安抚观察。`,
    calm_explanation: cautious
      ? "这类情况通常要看触发场景和安抚后恢复情况，目前先按初步观察同步给您。"
      : "情绪波动需要结合触发点和恢复速度一起看，我们会继续关注连续性。",
    follow_up_reminder: separationTrigger
      ? "今晚请简单反馈离园后的情绪恢复情况，明早入园前也可提醒接送节奏。"
      : "今晚请简单反馈回家后的情绪恢复情况，明早如仍有波动请继续告诉我们。",
  } satisfies TeacherVoiceParentCommunicationScript;
}

function buildGenericScript(transcript: TeacherVoiceCopilotTranscriptInput) {
  if (transcript.text.trim()) {
    return {
      short_message: "今天这条在园观察我们已先记录，但关键信息还在补充确认中。",
      calm_explanation:
        "为了避免误读，我们会先把孩子、时间点和主要现象补齐，再形成更稳的后续记录。",
      follow_up_reminder: "如果今晚有继续观察结果，明早可以补充孩子状态，便于园内衔接。",
    } satisfies TeacherVoiceParentCommunicationScript;
  }

  return {
    short_message: "今天这条记录还没有形成稳定观察结论。",
    calm_explanation: "当前信息不足，我们会先补齐原始观察，再决定是否需要进一步沟通。",
    follow_up_reminder: "如今晚出现新的观察结果，明早可继续补充给老师。",
  } satisfies TeacherVoiceParentCommunicationScript;
}

function buildParentCommunicationScript(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  draftItems: TeacherVoiceCopilotDraftItem[];
  warnings: string[];
}) {
  const orderedItems = sortDraftItems(
    params.draftItems,
    COMMUNICATION_PRIORITY
  );
  if (orderedItems.length === 0) {
    return buildGenericScript(params.transcript);
  }

  const item = orderedItems[0];
  if (item.category === "HEALTH") {
    return buildHealthScript({ transcript: params.transcript, warnings: params.warnings, item });
  }
  if (item.category === "LEAVE") {
    return buildLeaveScript({ transcript: params.transcript, warnings: params.warnings, item });
  }
  if (item.category === "SLEEP") {
    return buildSleepScript({ transcript: params.transcript, warnings: params.warnings, item });
  }
  if (item.category === "DIET") {
    return buildDietScript({ transcript: params.transcript, warnings: params.warnings, item });
  }
  return buildEmotionScript({ transcript: params.transcript, warnings: params.warnings, item });
}

export function buildTeacherVoiceCopilotPayload(params: {
  transcript: TeacherVoiceCopilotTranscriptInput;
  draftItems: TeacherVoiceCopilotDraftItem[];
  warnings: string[];
}) {
  return {
    record_completion_hints: buildRecordCompletionHints(params),
    micro_training_sop: buildMicroTrainingSop(params.draftItems),
    parent_communication_script: buildParentCommunicationScript(params),
  };
}

export function buildTeacherVoiceCopilotCompatPayload(params: {
  record_completion_hints: TeacherVoiceRecordCompletionHint[];
  micro_training_sop: TeacherVoiceMicroTrainingSOP[];
  parent_communication_script: TeacherVoiceParentCommunicationScript;
}) {
  const recordCompletionHints: TeacherCopilotHint[] = params.record_completion_hints.map(
    (hint, index) => ({
      id: `hint-${index + 1}`,
      title: hint.label,
      detail: `${hint.reason} ${hint.suggested_prompt}`.trim(),
      tone: "warning",
      tags: ["teacher-voice"],
    })
  );

  const firstSop = params.micro_training_sop[0];
  const microTrainingSOP: TeacherCopilotSOP | null = firstSop
    ? {
        title: firstSop.title,
        summary: firstSop.steps[0],
        durationLabel: firstSop.duration_text,
        steps: firstSop.steps.map(
          (step) =>
            ({
              title: step,
            }) satisfies TeacherCopilotStep
        ),
      }
    : null;

  const hasScriptContent =
    params.parent_communication_script.short_message.trim().length > 0 ||
    params.parent_communication_script.calm_explanation.trim().length > 0 ||
    params.parent_communication_script.follow_up_reminder.trim().length > 0;
  const parentCommunicationScript: TeacherCopilotCommunicationScript | null =
    hasScriptContent
      ? {
          title: "家长沟通话术卡",
          opening: params.parent_communication_script.short_message,
          situation: params.parent_communication_script.calm_explanation,
          closing: params.parent_communication_script.follow_up_reminder,
          bullets: [
            params.parent_communication_script.short_message,
            params.parent_communication_script.follow_up_reminder,
          ].filter((item) => item.trim().length > 0),
        }
      : null;

  const copilot: TeacherCopilotPayload | null =
    recordCompletionHints.length > 0 ||
    microTrainingSOP !== null ||
    parentCommunicationScript !== null
      ? {
          recordCompletionHints:
            recordCompletionHints.length > 0 ? recordCompletionHints : undefined,
          microTrainingSOP: microTrainingSOP ?? undefined,
          parentCommunicationScript: parentCommunicationScript ?? undefined,
        }
      : null;

  return {
    copilot,
    recordCompletionHints:
      recordCompletionHints.length > 0 ? recordCompletionHints : undefined,
    microTrainingSOP,
    parentCommunicationScript,
  };
}
