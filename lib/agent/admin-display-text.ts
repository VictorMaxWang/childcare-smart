const ADMIN_STRUCTURED_HINTS = [
  "teacher-agent",
  "workflow",
  "objectscope",
  "targetchildid",
  "actionitems",
  "node_name",
  "action_type",
  "input_summary",
  "output_summary",
  "prompt_context",
  "snapshot_json",
  "metadata_json",
  "trace_id",
  '"snapshot":',
  '"child":',
  '"summary":',
  '"recordcount":',
  '"pendingreviewcount":',
  '"moodkeywords":',
  '"allergies":',
] as const;

const ADMIN_SOURCE_LABELS: Record<string, string> = {
  backend: "后端",
  fallback: "兜底",
  demo: "演示",
  snapshot: "快照",
  memory: "记忆库",
  mock: "演示",
  "mock-brain": "演示推理",
  unknown: "未说明",
  "fastapi-brain": "后端编排",
  fastapi_brain: "后端编排",
  "next-json": "页面快照",
  next_json: "页面快照",
  "current-snapshot": "当前快照",
  current_snapshot: "当前快照",
  consultation_snapshot: "会诊快照",
  "high-risk-consultation": "高风险会诊",
  demo_snapshot: "演示快照",
  demo_consultations: "演示会诊",
  "demo-fallback": "演示兜底",
  demo_fallback: "演示兜底",
  "demo-seed": "演示种子",
  demo_seed: "演示种子",
  demo_suppressed: "已关闭演示兜底",
};

const ADMIN_INLINE_LABEL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bwithin\s*48\s*hours?\b/gi, "48小时内"],
  [/\btoday\b/gi, "今日"],
  [/\btonight\b/gi, "今晚"],
  [/\btomorrow\b/gi, "明日"],
  [/\bthis[\s-]?week\b/gi, "本周内"],
  [/\bdeadline\b/gi, "截止时间"],
];

type PrefixFormatter = (body: string) => string | null;

const ADMIN_PREFIX_FORMATTERS: Array<{
  pattern: RegExp;
  format: PrefixFormatter;
}> = [
  {
    pattern: /^(recent consultation|recent context)\s*:\s*/i,
    format: (body) => body.trim() || null,
  },
  {
    pattern: /^memory source\s*:\s*/i,
    format: (body) => (body.trim() ? `参考来源：${formatAdminSourceLabel(body)}` : null),
  },
  {
    pattern: /^memory backend\s*:\s*/i,
    format: (body) => (body.trim() ? `记忆后端：${formatAdminSourceLabel(body)}` : null),
  },
  {
    pattern: /^child\s*:\s*/i,
    format: (body) => (body.trim() ? `儿童：${body.trim()}` : null),
  },
  {
    pattern: /^class\s*:\s*/i,
    format: (body) => (body.trim() ? `班级：${body.trim()}` : null),
  },
];

function normalizeInlineWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function replaceInlineLabels(value: string) {
  return ADMIN_INLINE_LABEL_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
}

function applyKnownPrefix(value: string) {
  for (const entry of ADMIN_PREFIX_FORMATTERS) {
    if (entry.pattern.test(value)) {
      return entry.format(value.replace(entry.pattern, ""));
    }
  }

  return value;
}

export function looksLikeAdminStructuredPayload(text: string) {
  const compact = normalizeInlineWhitespace(text);
  if (!compact) return false;

  const lower = compact.toLowerCase();
  if (ADMIN_STRUCTURED_HINTS.some((hint) => lower.includes(hint))) {
    return true;
  }

  if (/^[\[{]/.test(compact) && (compact.match(/"[^"]+"\s*:/g)?.length ?? 0) >= 2) {
    return true;
  }

  if (/[A-Za-z0-9_-]+\s*:\s*[\[{]/.test(compact)) {
    return true;
  }

  const keyValueCount =
    (compact.match(/"[^"]+"\s*:/g)?.length ?? 0) +
    (compact.match(/\b[A-Za-z_][A-Za-z0-9_]*\s*:/g)?.length ?? 0);
  const punctuationDensity =
    (compact.match(/[{}[\]":,]/g)?.length ?? 0) / Math.max(compact.length, 1);
  const naturalSentenceLike = /[。！？；]/.test(compact);

  return keyValueCount >= 3 && compact.length >= 80 && punctuationDensity > 0.1 && !naturalSentenceLike;
}

export function formatAdminSourceLabel(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "未说明";

  const directKey = normalized.toLowerCase();
  if (ADMIN_SOURCE_LABELS[directKey]) {
    return ADMIN_SOURCE_LABELS[directKey];
  }

  const segments = normalized.split(/\s*\/\s*/).map((segment) => {
    const key = segment.trim().toLowerCase();
    if (ADMIN_SOURCE_LABELS[key]) {
      return ADMIN_SOURCE_LABELS[key];
    }

    return segment
      .replace(/demo_snapshot/gi, "演示快照")
      .replace(/demo_consultations/gi, "演示会诊")
      .replace(/demo[-_]?fallback/gi, "演示兜底")
      .replace(/demo[-_]?seed/gi, "演示种子")
      .replace(/current[-_]?snapshot/gi, "当前快照")
      .replace(/consultation[-_]?snapshot/gi, "会诊快照")
      .replace(/fastapi[-_]?brain/gi, "后端编排")
      .replace(/\bbackend\b/gi, "后端")
      .replace(/\bsnapshot\b/gi, "快照")
      .replace(/\bmemory\b/gi, "记忆库")
      .replace(/\bmock\b/gi, "演示")
      .replace(/\bunknown\b/gi, "未说明")
      .replace(/[_-]+/g, " ")
      .trim();
  });

  return segments.filter(Boolean).join(" / ") || "未说明";
}

export function localizeAdminRelativeText(value: string | null | undefined) {
  const normalized = normalizeInlineWhitespace(value ?? "");
  if (!normalized) return "";
  return replaceInlineLabels(normalized);
}

export function sanitizeAdminVisibleText(value: string | null | undefined) {
  const normalized = normalizeInlineWhitespace(value ?? "");
  if (!normalized) return null;

  const prefixed = applyKnownPrefix(normalized);
  if (!prefixed) return null;

  const localized = replaceInlineLabels(prefixed);
  if (looksLikeAdminStructuredPayload(localized)) {
    return null;
  }

  return normalizeInlineWhitespace(localized);
}

export function sanitizeAdminVisibleTexts(
  values: string[] | null | undefined,
  limit = 6
) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values ?? []) {
    const normalized = sanitizeAdminVisibleText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

export function resolveAdminVisibleText(
  ...values: Array<string | null | undefined>
) {
  for (const value of values) {
    const sanitized = sanitizeAdminVisibleText(value);
    if (sanitized) return sanitized;
  }

  return "待补充说明";
}

export function formatAdminDateTimeLabel(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "建议今日处理";

  const localizedRelativeText = localizeAdminRelativeText(normalized);
  if (localizedRelativeText !== normalized) {
    return localizedRelativeText;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return sanitizeAdminVisibleText(normalized) ?? normalized;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
