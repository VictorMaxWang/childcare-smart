/** 这些固定选项描述观察，不是执行障碍；只精确匹配旧 UI 标签，不猜测自由文本。 */
export const PARENT_FEEDBACK_OBSERVATION_OPTIONS = ["主动参与", "注意力较好", "需要提醒", "情绪稳定", "有求助行为", "按步骤完成", "其他"] as const;
const observations = new Set<string>(PARENT_FEEDBACK_OBSERVATION_OPTIONS);
function texts(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))] : [];
}

export function classifyFeedbackObservationTags(barriers: unknown, selectedObservations: unknown = []) {
  const all = texts(barriers);
  const tags = [...new Set([...all.filter(tag => observations.has(tag)), ...texts(selectedObservations)])];
  return {
    barriers: all.filter(tag => !observations.has(tag)),
    observations: tags.filter(tag => tag !== "需要提醒"),
    supportNeeds: tags.filter(tag => tag === "需要提醒"),
  };
}

function observationLines(tags: ReturnType<typeof classifyFeedbackObservationTags>) {
  return [tags.observations.length ? `观察到：${tags.observations.join("、")}` : "", tags.supportNeeds.length ? `支持需求：${tags.supportNeeds.join("、")}` : ""].filter(Boolean);
}

/**
 * 旧自动消息曾把正向标签写成“主要阻碍”。仅修正受控消息模板/分隔字段的读时显示，
 * 不改写数据库原文，也不把包含“情绪稳定”的任意家长自由文本重新分类。
 */
export function formatLegacyFeedbackObservationMessage(value: string) {
  let content = value;
  if (/今晚反馈：[\s\S]{0,160}孩子反应：[\s\S]{0,160}改善情况：/u.test(content)) {
    content = content.replace(/主要阻碍：([^。\n]+)。/u, (original, labels: string) => {
      const tags = classifyFeedbackObservationTags(labels.split(/[、；;]/u));
      if (!tags.observations.length && !tags.supportNeeds.length) return original;
      return [tags.barriers.length ? `主要阻碍：${tags.barriers.join("、")}。` : "", ...observationLines(tags).map(line => `${line}。`)].join("");
    });
  }
  return content.replace(/(^| \| )Barriers: ([^|]+)(?= \| |$)/gu, (original, prefix: string, labels: string) => {
    const tags = classifyFeedbackObservationTags(labels.split(/[、；;]/u));
    if (!tags.observations.length && !tags.supportNeeds.length) return original;
    return `${prefix}${[tags.barriers.length ? `Barriers: ${tags.barriers.join("; ")}` : "", ...observationLines(tags)].filter(Boolean).join(" | ")}`;
  });
}

/**
 * 新提交和历史读取共用的语义投影：真实障碍原样保留，观察与支持需求进入 notes。
 * 返回副本，不更改输入；已有 notes/附件/ID/执行状态均保留，可重复投影而不重复追加。
 */
export function projectFeedbackObservationSemantics<T extends { barriers?: unknown; observations?: unknown; notes?: unknown; content?: unknown; freeNote?: unknown }>(value: T) {
  const tags = classifyFeedbackObservationTags(value.barriers, value.observations);
  const baseNotes = [value.notes, value.freeNote, value.content].find((item): item is string => typeof item === "string" && Boolean(item.trim())) ?? "";
  const notes = formatLegacyFeedbackObservationMessage(baseNotes);
  const lines = notes.split("\n");
  return {
    ...value,
    barriers: tags.barriers,
    notes: [notes, ...observationLines(tags).filter(line => !lines.includes(line))].filter(Boolean).join("\n"),
    ...(typeof value.content === "string" ? { content: formatLegacyFeedbackObservationMessage(value.content) } : {}),
    ...(typeof value.freeNote === "string" ? { freeNote: formatLegacyFeedbackObservationMessage(value.freeNote) } : {}),
  };
}
