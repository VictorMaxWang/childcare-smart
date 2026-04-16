import type {
  ConsultationEvidenceCategory,
  ConsultationEvidenceConfidence,
  ConsultationEvidenceItem,
  ConsultationEvidenceSourceType,
  ConsultationEvidenceSupportRef,
  ExplainabilityItem,
} from "@/lib/ai/types";

export type ConsultationEvidenceStageKey =
  | "long_term_profile"
  | "recent_context"
  | "current_recommendation";

type ConsultationEvidenceBuildParams = {
  consultationId: string;
  generatedAt?: string;
  keyFindings: string[];
  triggerReasons: string[];
  todayInSchoolActions: string[];
  tonightAtHomeActions: string[];
  followUp48h: string[];
  explainability: ExplainabilityItem[];
  continuityNotes: string[];
  memoryMeta?: Record<string, unknown> | null;
  providerTrace?: Record<string, unknown> | null;
  multimodalNotes?: Record<string, unknown> | null;
  rawEvidenceItems?: unknown;
};

const EVIDENCE_SOURCE_TYPES: ConsultationEvidenceSourceType[] = [
  "health_check",
  "teacher_voice",
  "teacher_note",
  "guardian_feedback",
  "ocr_document",
  "trend",
  "memory_snapshot",
  "consultation_history",
  "derived_explainability",
];

const EVIDENCE_CONFIDENCES: ConsultationEvidenceConfidence[] = [
  "low",
  "medium",
  "high",
];

const EVIDENCE_CATEGORIES: ConsultationEvidenceCategory[] = [
  "risk_control",
  "family_communication",
  "daily_care",
  "development_support",
];

const EVIDENCE_STAGE_SOURCES: Record<
  ConsultationEvidenceStageKey,
  ConsultationEvidenceSourceType[]
> = {
  long_term_profile: ["memory_snapshot", "consultation_history"],
  recent_context: [
    "health_check",
    "teacher_note",
    "teacher_voice",
    "guardian_feedback",
    "ocr_document",
    "trend",
  ],
  current_recommendation: ["derived_explainability"],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isSourceType(value: unknown): value is ConsultationEvidenceSourceType {
  return EVIDENCE_SOURCE_TYPES.includes(value as ConsultationEvidenceSourceType);
}

function isConfidence(value: unknown): value is ConsultationEvidenceConfidence {
  return EVIDENCE_CONFIDENCES.includes(value as ConsultationEvidenceConfidence);
}

function isCategory(value: unknown): value is ConsultationEvidenceCategory {
  return EVIDENCE_CATEGORIES.includes(value as ConsultationEvidenceCategory);
}

function uniqueSupportRefs(
  refs: Array<ConsultationEvidenceSupportRef | null | undefined>
) {
  const seen = new Set<string>();
  const items: ConsultationEvidenceSupportRef[] = [];

  refs.forEach((ref) => {
    if (!ref) return;
    const key = `${ref.type}:${ref.targetId}:${ref.targetLabel ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(ref);
  });

  return items;
}

function buildFindingSupport(
  kind: "key" | "trigger",
  index: number,
  label: string
) {
  return {
    type: "finding" as const,
    targetId: `finding:${kind}:${index}`,
    targetLabel: label,
  };
}

function buildActionSupport(
  kind: "school" | "home" | "followup",
  index: number,
  label: string
) {
  return {
    type: "action" as const,
    targetId: `action:${kind}:${index}`,
    targetLabel: label,
  };
}

function buildExplainabilitySupport(index: number, label: string) {
  return {
    type: "explainability" as const,
    targetId: `explainability:${index}`,
    targetLabel: label,
  };
}

function firstActionSupport(params: {
  todayInSchoolActions: string[];
  tonightAtHomeActions: string[];
  followUp48h: string[];
}) {
  if (params.todayInSchoolActions[0]) {
    return buildActionSupport("school", 0, params.todayInSchoolActions[0]);
  }
  if (params.tonightAtHomeActions[0]) {
    return buildActionSupport("home", 0, params.tonightAtHomeActions[0]);
  }
  if (params.followUp48h[0]) {
    return buildActionSupport("followup", 0, params.followUp48h[0]);
  }
  return null;
}

function firstFindingSupport(keyFindings: string[]) {
  return keyFindings[0] ? buildFindingSupport("key", 0, keyFindings[0]) : null;
}

function buildProvenance(providerTrace: Record<string, unknown> | null | undefined) {
  const trace = asRecord(providerTrace);
  const provenance: Record<string, unknown> = {};

  ["provider", "source", "model", "requestId", "transport"].forEach((key) => {
    const value = trace[key];
    if (value !== undefined && value !== null && value !== "") {
      provenance[key] = value;
    }
  });

  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

function resolveCategory(
  sourceType: ConsultationEvidenceSourceType,
  supports: ConsultationEvidenceSupportRef[]
): ConsultationEvidenceCategory {
  if (sourceType === "guardian_feedback") {
    return "family_communication";
  }
  if (sourceType === "trend") {
    return "development_support";
  }
  if (sourceType === "memory_snapshot" || sourceType === "consultation_history") {
    return "daily_care";
  }
  if (supports.some((item) => item.targetId.startsWith("action:home:"))) {
    return "family_communication";
  }
  if (supports.some((item) => item.targetId.startsWith("action:followup:"))) {
    return "development_support";
  }
  if (supports.some((item) => item.targetId.startsWith("action:school:"))) {
    return "daily_care";
  }
  return "risk_control";
}

function buildMetadata(params: {
  sourceField?: string;
  providerTrace?: Record<string, unknown> | null;
  extra?: Record<string, unknown>;
}) {
  const metadata: Record<string, unknown> = {};

  if (params.sourceField) {
    metadata.sourceField = params.sourceField;
  }

  const provenance = buildProvenance(params.providerTrace);
  if (provenance) {
    metadata.provenance = provenance;
  }

  Object.entries(params.extra ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    metadata[key] = value;
  });

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function buildEvidenceItem(params: {
  consultationId: string;
  sourceType: ConsultationEvidenceSourceType;
  bucket: string;
  index: number;
  sourceLabel: string;
  sourceId?: string;
  summary: string;
  excerpt?: string;
  confidence: ConsultationEvidenceConfidence;
  requiresHumanReview: boolean;
  supports: ConsultationEvidenceSupportRef[];
  timestamp?: string;
  metadata?: Record<string, unknown>;
}): ConsultationEvidenceItem | null {
  const summary = params.summary.trim();
  if (!summary) return null;

  return {
    id: `ce:${params.consultationId}:${params.sourceType}:${params.bucket}:${params.index}`,
    sourceType: params.sourceType,
    sourceLabel: params.sourceLabel,
    sourceId: params.sourceId,
    summary,
    excerpt: params.excerpt?.trim() || undefined,
    confidence: params.confidence,
    requiresHumanReview: params.requiresHumanReview,
    evidenceCategory: resolveCategory(params.sourceType, params.supports),
    supports: uniqueSupportRefs(params.supports),
    timestamp: params.timestamp?.trim() || undefined,
    metadata:
      params.metadata && Object.keys(params.metadata).length > 0
        ? params.metadata
        : undefined,
  } satisfies ConsultationEvidenceItem;
}

export function isConsultationEvidenceItem(
  value: unknown
): value is ConsultationEvidenceItem {
  const item = asRecord(value);
  const supports = Array.isArray(item.supports) ? item.supports : [];

  return (
    Boolean(asString(item.id)) &&
    isSourceType(item.sourceType) &&
    Boolean(asString(item.sourceLabel)) &&
    Boolean(asString(item.summary) || asString(item.excerpt)) &&
    isConfidence(item.confidence) &&
    typeof item.requiresHumanReview === "boolean" &&
    isCategory(item.evidenceCategory) &&
    supports.every((support) => {
      const ref = asRecord(support);
      const type = asString(ref.type);
      return (
        (type === "finding" || type === "action" || type === "explainability") &&
        Boolean(asString(ref.targetId))
      );
    })
  );
}

export function normalizeConsultationEvidenceItems(
  value: unknown
): ConsultationEvidenceItem[] {
  if (!Array.isArray(value)) return [];

  const items: ConsultationEvidenceItem[] = [];

  value.forEach((item) => {
    const record = asRecord(item);
    const sourceType = isSourceType(record.sourceType)
      ? record.sourceType
      : ("derived_explainability" as const);
    const supports = Array.isArray(record.supports)
      ? uniqueSupportRefs(
          record.supports.map((support) => {
            const ref = asRecord(support);
            const type = asString(ref.type);
            if (
              (type !== "finding" && type !== "action" && type !== "explainability") ||
              !asString(ref.targetId)
            ) {
              return null;
            }

            return {
              type,
              targetId: asString(ref.targetId),
              targetLabel: asString(ref.targetLabel) || undefined,
            } satisfies ConsultationEvidenceSupportRef;
          })
        )
      : [];
    const summary = asString(record.summary) || asString(record.excerpt);
    const normalized = buildEvidenceItem({
      consultationId: "normalized",
      sourceType,
      bucket: "normalized",
      index: 0,
      sourceLabel: asString(record.sourceLabel) || "证据",
      sourceId: asString(record.sourceId) || undefined,
      summary,
      excerpt: asString(record.excerpt) || undefined,
      confidence: isConfidence(record.confidence) ? record.confidence : "low",
      requiresHumanReview:
        typeof record.requiresHumanReview === "boolean"
          ? record.requiresHumanReview
          : true,
      supports,
      timestamp: asString(record.timestamp) || undefined,
      metadata: asRecord(record.metadata),
    });

    if (!normalized) return;

    items.push({
      ...normalized,
      id: asString(record.id) || normalized.id,
      sourceLabel: asString(record.sourceLabel) || normalized.sourceLabel,
      evidenceCategory: isCategory(record.evidenceCategory)
        ? record.evidenceCategory
        : normalized.evidenceCategory,
    });
  });

  return items;
}

export function buildConsultationEvidenceItems(
  params: ConsultationEvidenceBuildParams
): ConsultationEvidenceItem[] {
  const normalizedExisting = normalizeConsultationEvidenceItems(params.rawEvidenceItems);
  if (normalizedExisting.length > 0) {
    const provenance = buildProvenance(params.providerTrace);
    if (!provenance) {
      return normalizedExisting;
    }

    return normalizedExisting.map((item) => {
      const metadata = asRecord(item.metadata);
      if (metadata.provenance) {
        return item;
      }

      return {
        ...item,
        metadata: {
          ...metadata,
          provenance,
        },
      };
    });
  }

  const evidenceItems: ConsultationEvidenceItem[] = [];
  const consultationId = params.consultationId || "unknown";
  const multimodalNotes = asRecord(params.multimodalNotes);
  const generatedAt = asString(params.generatedAt) || undefined;
  const defaultSupports = uniqueSupportRefs([
    firstFindingSupport(params.keyFindings),
    firstActionSupport(params),
  ]);

  const teacherNote = asString(multimodalNotes.teacherNote);
  const voiceText = asString(multimodalNotes.voiceText);
  const imageText = asString(multimodalNotes.imageText);

  const multimodalEvidence: Array<ConsultationEvidenceItem | null> = [
    teacherNote
      ? buildEvidenceItem({
          consultationId,
          sourceType: "teacher_note",
          bucket: "multimodal",
          index: 0,
          sourceLabel: "教师补充",
          sourceId: "multimodalNotes.teacherNote",
          summary: teacherNote,
          excerpt: teacherNote,
          confidence: "high",
          requiresHumanReview: false,
          supports: defaultSupports,
          metadata: buildMetadata({
            sourceField: "multimodalNotes.teacherNote",
            providerTrace: params.providerTrace,
          }),
        })
      : null,
    voiceText
      ? buildEvidenceItem({
          consultationId,
          sourceType: "teacher_voice",
          bucket: "multimodal",
          index: 1,
          sourceLabel: "教师语音转写",
          sourceId: "multimodalNotes.voiceText",
          summary: voiceText,
          excerpt: voiceText,
          confidence: "medium",
          requiresHumanReview: true,
          supports: defaultSupports,
          metadata: buildMetadata({
            sourceField: "multimodalNotes.voiceText",
            providerTrace: params.providerTrace,
          }),
        })
      : null,
    imageText
      ? buildEvidenceItem({
          consultationId,
          sourceType: "ocr_document",
          bucket: "multimodal",
          index: 2,
          sourceLabel: "OCR 文本",
          sourceId: "multimodalNotes.imageText",
          summary: imageText,
          excerpt: imageText,
          confidence: "medium",
          requiresHumanReview: true,
          supports: defaultSupports,
          metadata: buildMetadata({
            sourceField: "multimodalNotes.imageText",
            providerTrace: params.providerTrace,
          }),
        })
      : null,
  ];

  multimodalEvidence.filter(isDefined).forEach((item) => evidenceItems.push(item));

  params.continuityNotes.forEach((detail, index) => {
    const item = buildEvidenceItem({
      consultationId,
      sourceType: "consultation_history",
      bucket: "continuity",
      index,
      sourceLabel: "连续性说明",
      sourceId: `continuityNotes:${index}`,
      summary: detail,
      excerpt: detail,
      confidence: "medium",
      requiresHumanReview: false,
      supports: uniqueSupportRefs([
        buildFindingSupport("key", 0, params.keyFindings[0] ?? detail),
        buildActionSupport(
          "followup",
          0,
          params.followUp48h[0] ?? params.todayInSchoolActions[0] ?? detail
        ),
      ]),
      metadata: buildMetadata({
        sourceField: "continuityNotes",
        providerTrace: params.providerTrace,
      }),
    });
    if (item) evidenceItems.push(item);
  });

  const memoryMeta = asRecord(params.memoryMeta);
  const usedSources = Array.isArray(memoryMeta.usedSources)
    ? memoryMeta.usedSources.map((item) => asString(item)).filter(Boolean)
    : [];
  const matchedSnapshotIds = Array.isArray(memoryMeta.matchedSnapshotIds)
    ? memoryMeta.matchedSnapshotIds.map((item) => asString(item)).filter(Boolean)
    : [];
  const matchedTraceIds = Array.isArray(memoryMeta.matchedTraceIds)
    ? memoryMeta.matchedTraceIds.map((item) => asString(item)).filter(Boolean)
    : [];

  const memorySnapshotSummaryParts = [
    usedSources.length > 0 ? `命中记忆来源：${usedSources.slice(0, 3).join("、")}` : "",
    matchedSnapshotIds.length > 0 ? `快照 ${matchedSnapshotIds.length} 条` : "",
  ].filter(Boolean);
  const memorySnapshotItem = buildEvidenceItem({
    consultationId,
    sourceType: "memory_snapshot",
    bucket: "memory",
    index: 0,
    sourceLabel: "记忆快照",
    sourceId: matchedSnapshotIds.length > 0 ? "memoryMeta.matchedSnapshotIds" : undefined,
    summary: memorySnapshotSummaryParts.join("；"),
    confidence: "medium",
    requiresHumanReview: false,
    supports: uniqueSupportRefs([
      firstFindingSupport(params.keyFindings),
      buildActionSupport(
        "followup",
        0,
        params.followUp48h[0] ?? params.todayInSchoolActions[0] ?? "继续复核"
      ),
    ]),
    metadata: buildMetadata({
      sourceField: "memoryMeta",
      providerTrace: params.providerTrace,
      extra: {
        backend: asString(memoryMeta.backend),
        usedSources,
        matchedSnapshotCount: matchedSnapshotIds.length,
      },
    }),
  });
  if (memorySnapshotItem) evidenceItems.push(memorySnapshotItem);

  const historyTraceItem = buildEvidenceItem({
    consultationId,
    sourceType: "consultation_history",
    bucket: "memory",
    index: 1,
    sourceLabel: "历史会诊",
    sourceId: matchedTraceIds.length > 0 ? "memoryMeta.matchedTraceIds" : undefined,
    summary:
      matchedTraceIds.length > 0
        ? `命中历史会诊 trace ${matchedTraceIds.length} 条`
        : "",
    confidence: "medium",
    requiresHumanReview: false,
    supports: uniqueSupportRefs([
      firstFindingSupport(params.keyFindings),
      buildActionSupport(
        "followup",
        0,
        params.followUp48h[0] ?? params.todayInSchoolActions[0] ?? "继续复核"
      ),
    ]),
    metadata: buildMetadata({
      sourceField: "memoryMeta.matchedTraceIds",
      providerTrace: params.providerTrace,
      extra: {
        matchedTraceCount: matchedTraceIds.length,
      },
    }),
  });
  if (historyTraceItem) evidenceItems.push(historyTraceItem);

  params.keyFindings.forEach((detail, index) => {
    const item = buildEvidenceItem({
      consultationId,
      sourceType: "derived_explainability",
      bucket: "finding",
      index,
      sourceLabel: "关键发现推断",
      sourceId: `finding:key:${index}`,
      summary: detail,
      excerpt: detail,
      confidence: "medium",
      requiresHumanReview: true,
      supports: [buildFindingSupport("key", index, detail)],
      timestamp: generatedAt,
      metadata: buildMetadata({
        sourceField: "keyFindings",
        providerTrace: params.providerTrace,
      }),
    });
    if (item) evidenceItems.push(item);
  });

  params.triggerReasons.forEach((detail, index) => {
    const item = buildEvidenceItem({
      consultationId,
      sourceType: "derived_explainability",
      bucket: "trigger",
      index,
      sourceLabel: "触发原因推断",
      sourceId: `finding:trigger:${index}`,
      summary: detail,
      excerpt: detail,
      confidence: "medium",
      requiresHumanReview: true,
      supports: [buildFindingSupport("trigger", index, detail)],
      timestamp: generatedAt,
      metadata: buildMetadata({
        sourceField: "triggerReasons",
        providerTrace: params.providerTrace,
      }),
    });
    if (item) evidenceItems.push(item);
  });

  params.explainability.forEach((detail, index) => {
    const supports = uniqueSupportRefs([
      buildExplainabilitySupport(index, `${detail.label}: ${detail.detail}`),
      detail.label.includes("关键发现") ? firstFindingSupport(params.keyFindings) : null,
      detail.label.includes("协调结论") && params.followUp48h[0]
        ? buildActionSupport("followup", 0, params.followUp48h[0])
        : null,
    ]);
    const item = buildEvidenceItem({
      consultationId,
      sourceType: "derived_explainability",
      bucket: "explainability",
      index,
      sourceLabel: detail.label || "说明",
      sourceId: `explainability:${index}`,
      summary: detail.detail,
      excerpt: detail.detail,
      confidence: "low",
      requiresHumanReview: true,
      supports,
      timestamp: generatedAt,
      metadata: buildMetadata({
        sourceField: "explainability",
        providerTrace: params.providerTrace,
        extra: { explainabilityLabel: detail.label },
      }),
    });
    if (item) evidenceItems.push(item);
  });

  return evidenceItems;
}

export function filterConsultationEvidenceItemsByStage(
  items: ConsultationEvidenceItem[],
  stage: ConsultationEvidenceStageKey
) {
  const supportedSourceTypes = new Set(EVIDENCE_STAGE_SOURCES[stage]);
  return items.filter((item) => supportedSourceTypes.has(item.sourceType));
}

export function buildConsultationEvidenceHighlights(
  items: ConsultationEvidenceItem[],
  limit = 4
) {
  const seen = new Set<string>();
  const highlights: string[] = [];

  items.forEach((item) => {
    const text = `${item.sourceLabel}: ${item.summary}`.trim();
    if (!text || seen.has(text) || highlights.length >= limit) return;
    seen.add(text);
    highlights.push(text);
  });

  return highlights;
}

export function buildLegacyTraceEvidenceFromItems(
  items: ConsultationEvidenceItem[],
  limit = 4
) {
  const seen = new Set<string>();
  const evidence: Array<{ label: string; detail: string }> = [];

  items.forEach((item) => {
    const label = item.sourceLabel || "证据";
    const detail = item.summary || item.excerpt || "";
    const key = `${label}:${detail}`;
    if (!detail || seen.has(key) || evidence.length >= limit) return;
    seen.add(key);
    evidence.push({ label, detail });
  });

  return evidence;
}
