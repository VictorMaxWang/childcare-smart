import type {
  HealthFileBridgeActionItem,
  HealthFileBridgeActionMapping,
  HealthFileBridgeContraindication,
  HealthFileBridgeFollowUpSeed,
  HealthFileBridgeFact,
  HealthFileBridgeFile,
  HealthFileBridgeFileType,
  HealthFileBridgeFollowUpHint,
  HealthFileBridgeMemoryCandidate,
  HealthFileBridgeRequest,
  HealthFileBridgeResponse,
  HealthFileBridgeRiskItem,
  HealthFileBridgeSource,
  HealthFileBridgeWriteback,
} from "../ai/types";

const HEALTH_FILE_BRIDGE_DISCLAIMER =
  "T9 bridge returns structured facts plus conservative childcare action suggestions from file metadata and text hints. It does not perform verified binary OCR, medical diagnosis, medication authorization, clearance decisions, writeback, or escalation dispatch.";

const REPORT_KEYWORDS = ["report", "lab", "result", "检验", "检查", "报告"];
const CHECKLIST_KEYWORDS = ["checklist", "form", "sheet", "单", "表"];
const RECHECK_KEYWORDS = ["recheck", "follow-up", "follow up", "复查", "复诊", "复测", "复检"];
const ALLERGY_KEYWORDS = ["allergy", "allergic", "过敏"];
const MEDICATION_KEYWORDS = [
  "medication",
  "medicine",
  "prescription",
  "antibiotic",
  "nebulizer",
  "用药",
  "药",
  "处方",
  "抗生素",
  "雾化",
];
const ABNORMAL_KEYWORDS = ["abnormal", "positive", "elevated", "high", "low", "异常", "偏高", "偏低", "阳性"];
const FOLLOW_UP_HINT_KEYWORDS = [...RECHECK_KEYWORDS, "review", "随访", "明天", "tomorrow", "48h", "48小时"];
const TEMPERATURE_PATTERN = /(?<!\d)(3[5-9](?:\.\d)?)(?:\s*(?:°?\s*[cC]|℃))?/;
const DANGEROUS_ACTION_PATTERNS = {
  allergy: ["allergen exposure is acceptable", "resume suspect food", "resume shared food"],
  medication: ["administer medicine based on the file", "start a medication plan from this file"],
  clearance: ["resume normal activity", "treat the file as clearance", "cleared for regular activity"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isValidFile(value: unknown): value is HealthFileBridgeFile {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && value.name.trim().length > 0;
}

export function isValidHealthFileBridgeRequest(payload: unknown): payload is HealthFileBridgeRequest {
  if (!isRecord(payload)) return false;
  if (payload.sourceRole !== "parent" && payload.sourceRole !== "teacher") return false;
  if (typeof payload.requestSource !== "string" || payload.requestSource.trim().length === 0) {
    return false;
  }
  if (!Array.isArray(payload.files) || payload.files.length === 0) return false;
  return payload.files.every(isValidFile);
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function safeText(value?: string | null) {
  return value?.trim() ?? "";
}

function collectSignals(request: HealthFileBridgeRequest) {
  const fileNames = request.files.map((file) => safeText(file.name)).filter(Boolean);
  const mimeTypes = request.files.map((file) => safeText(file.mimeType)).filter(Boolean);
  const previewTexts = request.files.map((file) => safeText(file.previewText)).filter(Boolean);
  const fileUrls = request.files.map((file) => safeText(file.fileUrl)).filter(Boolean);
  const notes = safeText(request.optionalNotes);
  const providerText = [...previewTexts, notes].filter(Boolean).join("\n");
  const haystack = normalizeText(
    [request.fileKind ?? "", ...fileNames, ...mimeTypes, ...previewTexts, ...fileUrls, notes, providerText].join(" ")
  );

  return {
    fileNames,
    mimeTypes,
    previewTexts,
    fileUrls,
    notes,
    providerText,
    haystack,
  };
}

function hasKeyword(haystack: string, keywords: string[]) {
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function detectFileType(request: HealthFileBridgeRequest, signals: ReturnType<typeof collectSignals>): HealthFileBridgeFileType {
  const fileTypes = new Set<HealthFileBridgeFileType>();
  for (const file of request.files) {
    const mimeType = normalizeText(file.mimeType);
    const name = normalizeText(file.name);
    if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
      fileTypes.add("pdf");
    } else if (mimeType.startsWith("image/")) {
      fileTypes.add("report-screenshot");
    }
  }

  const fileKind = normalizeText(request.fileKind);
  if (fileKind === "lab-report" || fileKind === "health-note" || hasKeyword(signals.haystack, REPORT_KEYWORDS)) {
    fileTypes.add(fileTypes.has("pdf") ? "pdf" : "report-screenshot");
  }
  if (fileKind === "discharge-note" || hasKeyword(signals.haystack, RECHECK_KEYWORDS)) {
    fileTypes.add("recheck-slip");
  }
  if (fileKind === "prescription" || hasKeyword(signals.haystack, CHECKLIST_KEYWORDS)) {
    fileTypes.add("checklist");
  }

  if (fileTypes.size === 0) return "unknown";
  if (fileTypes.size === 1) return Array.from(fileTypes)[0]!;
  return "mixed";
}

function extractTemperature(haystack: string) {
  return haystack.match(TEMPERATURE_PATTERN)?.[1] ?? null;
}

function baseFacts(
  request: HealthFileBridgeRequest,
  signals: ReturnType<typeof collectSignals>,
  fileType: HealthFileBridgeFileType
): HealthFileBridgeFact[] {
  const facts: HealthFileBridgeFact[] = [
    {
      label: "File type",
      detail: `Detected fileType=${fileType} from the uploaded file metadata and text hints.`,
      source: "derived:file-type",
    },
    {
      label: "Source role",
      detail: `Current request came from ${request.sourceRole}.`,
      source: "request-meta",
    },
    {
      label: "Extraction mode",
      detail: `T8 processed ${request.files.length} file(s) using request-supplied preview text, notes, file names, and mime hints only.`,
      source: "request-meta",
    },
  ];

  if (signals.providerText) {
    facts.push({
      label: "Text evidence",
      detail: "A text hint was available for structured extraction.",
      source: "ocr:text-fallback",
    });
  }

  return facts;
}

function signalFacts(haystack: string): HealthFileBridgeFact[] {
  const facts: HealthFileBridgeFact[] = [];
  const temperature = extractTemperature(haystack);
  if (temperature) {
    facts.push({
      label: "Temperature mention",
      detail: `Detected a temperature-like value: ${temperature}.`,
      source: "pattern:temperature",
    });
  }
  if (hasKeyword(haystack, ALLERGY_KEYWORDS)) {
    facts.push({
      label: "Allergy mention",
      detail: "Detected allergy-related wording in the provided text hints.",
      source: "pattern:allergy",
    });
  }
  if (hasKeyword(haystack, MEDICATION_KEYWORDS)) {
    facts.push({
      label: "Medication mention",
      detail: "Detected medication or prescription-related wording in the provided text hints.",
      source: "pattern:medication",
    });
  }
  if (hasKeyword(haystack, ABNORMAL_KEYWORDS)) {
    facts.push({
      label: "Abnormal result wording",
      detail: "Detected wording that usually appears around abnormal or flagged findings.",
      source: "pattern:abnormal",
    });
  }
  if (hasKeyword(haystack, FOLLOW_UP_HINT_KEYWORDS)) {
    facts.push({
      label: "Follow-up wording",
      detail: "Detected recheck, review, or follow-up wording in the available text hints.",
      source: "pattern:follow-up",
    });
  }
  return facts;
}

function riskItems(haystack: string): HealthFileBridgeRiskItem[] {
  const risks: HealthFileBridgeRiskItem[] = [];
  const temperature = extractTemperature(haystack);
  if (temperature) {
    risks.push({
      title: "Temperature-related signal needs manual confirmation",
      severity: Number(temperature) >= 38 ? "high" : "medium",
      detail:
        "A temperature mention was detected in the uploaded material. Staff should verify the original document and the child's current status before operational use.",
      source: "pattern:temperature",
    });
  }
  if (hasKeyword(haystack, ALLERGY_KEYWORDS)) {
    risks.push({
      title: "Potential allergy-related instruction detected",
      severity: "high",
      detail:
        "Allergy wording was detected, but the exact allergen and scope were not independently verified from binary OCR.",
      source: "pattern:allergy",
    });
  }
  if (hasKeyword(haystack, MEDICATION_KEYWORDS)) {
    risks.push({
      title: "Medication wording should not be treated as verified administration guidance",
      severity: "medium",
      detail:
        "Prescription or medication wording was detected, but T8 only extracts structure and does not verify dosage, authorization, or daycare execution rules.",
      source: "pattern:medication",
    });
  }
  if (hasKeyword(haystack, ABNORMAL_KEYWORDS)) {
    risks.push({
      title: "Abnormal or flagged result wording detected",
      severity: "medium",
      detail: "The text hints contain abnormal-result wording that may require review against the original document.",
      source: "pattern:abnormal",
    });
  }
  if (risks.length === 0) {
    risks.push({
      title: "Low-confidence extraction from limited text hints",
      severity: "low",
      detail:
        "The current request does not include enough verified text to infer more specific medical facts safely.",
      source: "fallback:text-hints",
    });
  }
  return dedupeByTitle(risks);
}

function contraindications(haystack: string): HealthFileBridgeContraindication[] {
  const items: HealthFileBridgeContraindication[] = [];
  if (hasKeyword(haystack, ALLERGY_KEYWORDS)) {
    items.push({
      title: "Do not assume allergen exposure is acceptable",
      detail:
        "Allergy-related wording was detected, so meals, activity materials, or medication exposure should not be inferred as safe from this file alone.",
      source: "pattern:allergy",
    });
  }
  if (hasKeyword(haystack, MEDICATION_KEYWORDS)) {
    items.push({
      title: "Do not infer a daycare medication plan from the file alone",
      detail:
        "Medication wording was detected, but dosage and administration authority were not verified by binary OCR or writeback flows.",
      source: "pattern:medication",
    });
  }
  const temperature = extractTemperature(haystack);
  if (temperature && Number(temperature) >= 38) {
    items.push({
      title: "Avoid treating the file as a diagnosis clearance",
      detail:
        "A fever-range value was detected. The upload should not be used as proof that normal activity is already cleared.",
      source: "pattern:temperature",
    });
  }
  return dedupeByTitle(items);
}

function followUpHints(haystack: string, fileType: HealthFileBridgeFileType): HealthFileBridgeFollowUpHint[] {
  const hints: HealthFileBridgeFollowUpHint[] = [];
  if (fileType === "recheck-slip" || hasKeyword(haystack, FOLLOW_UP_HINT_KEYWORDS)) {
    hints.push({
      title: "Keep the original follow-up timing visible",
      detail:
        "The upload appears to contain recheck or follow-up wording. Preserve the original timeline from the source document for later T9/T10 mapping.",
      source: "pattern:follow-up",
    });
  }
  if (hasKeyword(haystack, MEDICATION_KEYWORDS)) {
    hints.push({
      title: "Capture the exact medication wording for later review",
      detail:
        "If this file is reused downstream, keep the original medication phrasing rather than paraphrasing it into an action prematurely.",
      source: "pattern:medication",
    });
  }
  if (hints.length === 0) {
    hints.push({
      title: "Preserve the original file for manual walkthrough",
      detail:
        "T8 extracted only structured hints. A later walkthrough should compare these hints against the original screenshot or PDF before mapping actions.",
      source: "fallback:text-hints",
    });
  }
  return dedupeByTitle(hints);
}

function dedupeByTitle<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
}

function dedupeByLabel<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.label)) return false;
    seen.add(item.label);
    return true;
  });
}

function uniqueStrings(items: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = safeText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function summarizeActionItem(item?: HealthFileBridgeActionItem) {
  if (!item) return undefined;
  return `${item.title}: ${item.detail}`;
}

function buildActionItem(
  title: string,
  detail: string,
  source: string,
  basedOn: Array<string | undefined>
): HealthFileBridgeActionItem {
  return {
    title,
    detail,
    source,
    basedOn: uniqueStrings(basedOn),
  };
}

function dedupeActionItems(items: HealthFileBridgeActionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
}

function hasFactLabel(facts: HealthFileBridgeFact[], label: string) {
  return facts.some((fact) => fact.label === label);
}

function hasRiskTitle(risks: HealthFileBridgeRiskItem[], pattern: string) {
  return risks.some((risk) => risk.title.toLowerCase().includes(pattern.toLowerCase()));
}

function hasContraindicationText(
  contraindications: HealthFileBridgeContraindication[],
  pattern: string
) {
  return contraindications.some((item) =>
    `${item.title} ${item.detail}`.toLowerCase().includes(pattern.toLowerCase())
  );
}

function hasFollowUpTitle(hints: HealthFileBridgeFollowUpHint[], pattern: string) {
  return hints.some((hint) => hint.title.toLowerCase().includes(pattern.toLowerCase()));
}

function filterUnsafeActionItems(
  items: HealthFileBridgeActionItem[],
  contraindications: HealthFileBridgeContraindication[]
) {
  const hasAllergyContra = hasContraindicationText(contraindications, "allergy");
  const hasMedicationContra = hasContraindicationText(contraindications, "medication");
  const hasClearanceContra =
    hasContraindicationText(contraindications, "clearance") ||
    hasContraindicationText(contraindications, "normal activity");

  return items.filter((item) => {
    const text = `${item.title} ${item.detail}`.toLowerCase();
    if (hasAllergyContra && DANGEROUS_ACTION_PATTERNS.allergy.some((pattern) => text.includes(pattern))) {
      return false;
    }
    if (
      hasMedicationContra &&
      DANGEROUS_ACTION_PATTERNS.medication.some((pattern) => text.includes(pattern))
    ) {
      return false;
    }
    if (
      hasClearanceContra &&
      DANGEROUS_ACTION_PATTERNS.clearance.some((pattern) => text.includes(pattern))
    ) {
      return false;
    }
    return true;
  });
}

function buildHealthFileActionMapping(input: {
  fileType: HealthFileBridgeFileType;
  extractedFacts: HealthFileBridgeFact[];
  riskItems: HealthFileBridgeRiskItem[];
  contraindications: HealthFileBridgeContraindication[];
  followUpHints: HealthFileBridgeFollowUpHint[];
  confidence: number;
}): HealthFileBridgeActionMapping {
  const { fileType, extractedFacts, riskItems, contraindications, followUpHints, confidence } = input;
  const schoolTodayActions: HealthFileBridgeActionItem[] = [];
  const familyTonightActions: HealthFileBridgeActionItem[] = [];
  const followUpPlan: HealthFileBridgeActionItem[] = [];

  const hasTemperature = hasFactLabel(extractedFacts, "Temperature mention");
  const hasAllergy = hasFactLabel(extractedFacts, "Allergy mention");
  const hasMedication = hasFactLabel(extractedFacts, "Medication mention");
  const hasFollowUp =
    fileType === "recheck-slip" ||
    hasFactLabel(extractedFacts, "Follow-up wording") ||
    hasFollowUpTitle(followUpHints, "follow-up") ||
    hasFollowUpTitle(followUpHints, "timing");
  const hasAbnormal = hasFactLabel(extractedFacts, "Abnormal result wording");
  const hasHighRisk = riskItems.some((item) => item.severity === "high");
  const hasMediumRisk = riskItems.some((item) => item.severity === "medium");
  const lowConfidence =
    confidence < 0.45 ||
    hasRiskTitle(riskItems, "low-confidence extraction") ||
    (!hasTemperature && !hasAllergy && !hasMedication && !hasFollowUp && !hasAbnormal);

  if (lowConfidence) {
    schoolTodayActions.push(
      buildActionItem(
        "Verify the original file and log today's observation window",
        "Before using the upload operationally, compare it with the original file and log today's temperature, energy, eating, and comfort observations.",
        "rule:low-confidence-review",
        ["Low-confidence extraction from limited text hints", "File type", "Extraction mode"]
      )
    );
    familyTonightActions.push(
      buildActionItem(
        "Send a clearer file or wording tonight and share the child's current status",
        "Ask the family to resend the clearest available file or wording tonight and add a short update on temperature, energy, sleep, and appetite.",
        "rule:low-confidence-review",
        ["Low-confidence extraction from limited text hints", "Preserve the original file for manual walkthrough"]
      )
    );
  }

  if (hasTemperature) {
    schoolTodayActions.push(
      buildActionItem(
        "Recheck today and keep activity calm",
        "Recheck the child's temperature and comfort today, reduce strenuous activity, offer fluids, and keep an observation note for the next handoff.",
        "rule:temperature",
        ["Temperature mention", "Temperature-related signal needs manual confirmation"]
      )
    );
    familyTonightActions.push(
      buildActionItem(
        "Watch temperature, energy, and sleep tonight",
        "Ask the family to watch temperature, energy, breathing comfort, sleep, and appetite tonight and send an update before the next attendance.",
        "rule:temperature",
        ["Temperature mention", "Temperature-related signal needs manual confirmation"]
      )
    );
    followUpPlan.push(
      buildActionItem(
        "Confirm the latest temperature before next arrival",
        "Keep the next check-in anchored to the most recent temperature and whether the child settled overnight.",
        "rule:temperature-follow-up",
        ["Temperature mention", "Temperature-related signal needs manual confirmation"]
      )
    );
  }

  if (hasAllergy) {
    schoolTodayActions.push(
      buildActionItem(
        "Temporarily avoid unverified allergen exposure today",
        "Until the original allergen wording is confirmed, avoid introducing suspect foods, materials, or other trigger exposure in school.",
        "rule:allergy",
        ["Allergy mention", "Potential allergy-related instruction detected", "Do not assume allergen exposure is acceptable"]
      )
    );
    familyTonightActions.push(
      buildActionItem(
        "Confirm the exact allergen wording with the family",
        "Ask the family to send the exact allergen, trigger, and source wording from the original file tonight.",
        "rule:allergy",
        ["Allergy mention", "Potential allergy-related instruction detected"]
      )
    );
  }

  if (hasMedication) {
    schoolTodayActions.push(
      buildActionItem(
        "Do not administer medicine from the file alone",
        "Do not turn the upload into a school medication plan until written authorization and the exact original wording are confirmed.",
        "rule:medication",
        ["Medication mention", "Medication wording should not be treated as verified administration guidance", "Do not infer a daycare medication plan from the file alone"]
      )
    );
    familyTonightActions.push(
      buildActionItem(
        "If school coordination is needed, provide authorization and label wording",
        "Ask the family to provide the written authorization path and the original label or prescription wording before any next-day school coordination.",
        "rule:medication",
        ["Medication mention", "Medication wording should not be treated as verified administration guidance"]
      )
    );
  }

  if (hasFollowUp) {
    followUpPlan.push(
      buildActionItem(
        "Keep the original follow-up timing visible",
        "Carry forward the follow-up or recheck timing exactly as written and use it as the next observation deadline.",
        "rule:follow-up",
        ["Follow-up wording", "Keep the original follow-up timing visible"]
      )
    );
  }

  if (followUpPlan.length === 0) {
    followUpPlan.push(
      buildActionItem(
        "Do a manual review before tomorrow check-in",
        "Before the next arrival, confirm the original file wording and whether any new symptoms or follow-up instructions appeared overnight.",
        "rule:next-day-review",
        ["Preserve the original file for manual walkthrough", "Extraction mode"]
      )
    );
  }

  const filteredSchoolTodayActions = filterUnsafeActionItems(
    dedupeActionItems(schoolTodayActions),
    contraindications
  );
  const filteredFamilyTonightActions = filterUnsafeActionItems(
    dedupeActionItems(familyTonightActions),
    contraindications
  );
  const filteredFollowUpPlan = filterUnsafeActionItems(dedupeActionItems(followUpPlan), contraindications);

  const schoolActions =
    filteredSchoolTodayActions.length > 0
      ? filteredSchoolTodayActions
      : [
          buildActionItem(
            "Verify the original file and keep today's observation brief",
            "Use the file only as a prompt to verify the original wording and keep a brief observation note today.",
            "rule:fallback-review",
            ["File type", "Extraction mode"]
          ),
        ];
  const familyActions =
    filteredFamilyTonightActions.length > 0
      ? filteredFamilyTonightActions
      : [
          buildActionItem(
            "Share a factual status update tonight",
            "Ask the family for a factual update tonight so tomorrow's school handoff does not depend on guesswork.",
            "rule:fallback-review",
            ["Extraction mode"]
          ),
        ];
  const reviewActions =
    filteredFollowUpPlan.length > 0
      ? filteredFollowUpPlan
      : [
          buildActionItem(
            "Keep the next check-in manual",
            "Before the next attendance, manually confirm the file wording and any change in the child's status.",
            "rule:fallback-review",
            ["Extraction mode"]
          ),
        ];

  let escalationSuggestion: HealthFileBridgeActionMapping["escalationSuggestion"] = {
    shouldUpgradeAttention: false,
    level: "routine",
    reason: "Current extraction supports conservative observation and document verification without triggering a same-day escalation flow.",
  };

  if (hasHighRisk) {
    escalationSuggestion = {
      shouldUpgradeAttention: true,
      level: "same-day-review",
      reason:
        "A high-risk extraction signal needs same-day teacher-family review before normal routine decisions are treated as safe.",
    };
  } else if (hasMedication || hasAllergy || (hasFollowUp && (hasMediumRisk || hasHighRisk)) || hasMediumRisk) {
    escalationSuggestion = {
      shouldUpgradeAttention: true,
      level: "heightened",
      reason:
        "The file contains medium-risk or coordination-sensitive signals that need tighter observation and a clearer handoff.",
    };
  }

  const teacherDraftHint = `Teacher handoff hint: ${schoolActions[0]?.title ?? "Verify the original file"} Follow ${reviewActions[0]?.title ?? "keep the next check-in manual"}, keep the wording operational, and avoid diagnosis or medication promises.`;
  const parentCommunicationDraftHint = `Parent communication hint: ${familyActions[0]?.title ?? "Share a factual status update tonight"} Please keep the update factual and support ${reviewActions[0]?.title?.toLowerCase() ?? "the next manual check-in"}.`;

  return {
    schoolTodayActions: schoolActions,
    familyTonightActions: familyActions,
    followUpPlan: reviewActions,
    escalationSuggestion,
    teacherDraftHint,
    parentCommunicationDraftHint,
  };
}

function buildFollowUpSeed(response: HealthFileBridgeResponse): HealthFileBridgeFollowUpSeed {
  const schoolActions = response.actionMapping?.schoolTodayActions ?? [];
  const familyActions = response.actionMapping?.familyTonightActions ?? [];
  const followUpPlan = response.actionMapping?.followUpPlan ?? [];
  const primaryFamilyAction = familyActions[0];
  const primarySchoolAction = schoolActions[0];
  const primaryFollowUpAction = followUpPlan[0];
  const observationPoints = uniqueStrings([
    ...schoolActions.map((item) => item.title),
    ...followUpPlan.map((item) => item.title),
    ...response.riskItems.map((item) => item.title),
  ]).slice(0, 3);

  return {
    suggestionTitle: primaryFollowUpAction?.title ?? "Manual health file follow-up",
    suggestionDescription: response.summary,
    tonightHomeAction:
      primaryFamilyAction?.detail ??
      primaryFamilyAction?.title ??
      "Share a factual status update tonight and confirm the latest status.",
    observationPoints:
      observationPoints.length > 0
        ? observationPoints
        : ["Verify the original file wording", "Observe the child's current status today"],
    tomorrowObservationPoint:
      primarySchoolAction?.title ??
      primaryFollowUpAction?.title ??
      "Review the original file before the next attendance.",
    reviewIn48h:
      primaryFollowUpAction?.detail ??
      "Review the bridge hints against the original file within 48 hours.",
    teacherSuggestionSummary: response.actionMapping?.teacherDraftHint ?? response.summary,
    familyTask: {
      title: primaryFamilyAction?.title ?? "Share a factual status update tonight",
      description: primaryFamilyAction?.detail ?? response.summary,
    },
  };
}

function buildMemoryCandidate(
  request: HealthFileBridgeRequest,
  response: HealthFileBridgeResponse,
  followUpSeed: HealthFileBridgeFollowUpSeed
): HealthFileBridgeMemoryCandidate {
  return {
    title: followUpSeed.suggestionTitle,
    summary: response.summary,
    continuitySignals: uniqueStrings([
      response.summary,
      response.actionMapping?.teacherDraftHint,
      response.actionMapping?.parentCommunicationDraftHint,
      ...response.extractedFacts.map((item) => `${item.label}: ${item.detail}`),
    ]).slice(0, 4),
    openLoops: uniqueStrings([
      followUpSeed.reviewIn48h,
      followUpSeed.tomorrowObservationPoint,
      ...(response.actionMapping?.followUpPlan.map(summarizeActionItem) ?? []),
    ]).slice(0, 4),
    sourceRefs: uniqueStrings([
      request.requestSource,
      `bridge-source:${response.source}`,
      `file-type:${response.fileType}`,
      response.provider ? `provider:${response.provider}` : undefined,
      request.traceId ? `trace:${request.traceId}` : undefined,
    ]),
  };
}

export function buildHealthFileBridgeWriteback(
  request: HealthFileBridgeRequest,
  response: HealthFileBridgeResponse
): HealthFileBridgeWriteback {
  const followUpSeed = buildFollowUpSeed(response);
  const memoryCandidate = buildMemoryCandidate(request, response, followUpSeed);

  return {
    childScopedArtifacts: [
      {
        artifactType: "health-file-bridge",
        childId: request.childId,
        fileKind: response.fileKind ?? request.fileKind,
        fileType: response.fileType,
        summary: response.summary,
        extractedFacts: response.extractedFacts,
        riskItems: response.riskItems,
        contraindications: response.contraindications,
        followUpHints: response.followUpHints,
        actionMapping: response.actionMapping,
        generatedAt: response.generatedAt,
      },
    ],
    memoryCandidate,
    followUpSeed,
    weeklyReportSeed: null,
    provenance: {
      bridgeOrigin: "health-file-bridge",
      sourceRole: response.sourceRole,
      requestSource: request.requestSource,
      traceId: request.traceId,
      fileKind: response.fileKind ?? request.fileKind,
      fileType: response.fileType,
      source: response.source,
      fallback: response.fallback,
      mock: response.mock,
      liveReadyButNotVerified: response.liveReadyButNotVerified,
      provider: response.provider,
      model: response.model,
      generatedAt: response.generatedAt,
    },
  };
}

function computeConfidence(
  signals: ReturnType<typeof collectSignals>,
  facts: HealthFileBridgeFact[],
  fileType: HealthFileBridgeFileType
) {
  let score = 0.18;
  if (signals.previewTexts.length > 0) score += 0.34;
  if (signals.notes) score += 0.14;
  if (signals.fileUrls.length > 0) score += 0.08;
  if (fileType !== "unknown") score += 0.12;
  score += Math.min(facts.length, 5) * 0.04;
  if (!signals.providerText) score -= 0.06;
  return Math.max(0.1, Math.min(Number(score.toFixed(2)), 0.92));
}

export function buildHealthFileBridgeResponse(
  request: HealthFileBridgeRequest,
  options: {
    source: HealthFileBridgeSource;
    fallback: boolean;
    mock: boolean;
    liveReadyButNotVerified: boolean;
  }
): HealthFileBridgeResponse {
  const signals = collectSignals(request);
  const fileType = detectFileType(request, signals);
  const extractedFacts = dedupeByLabel([...baseFacts(request, signals, fileType), ...signalFacts(signals.haystack)]);
  const extractedRiskItems = riskItems(signals.haystack);
  const extractedContraindications = contraindications(signals.haystack);
  const extractedFollowUpHints = followUpHints(signals.haystack, fileType);
  const confidence = computeConfidence(signals, extractedFacts, fileType);
  const actionMapping = buildHealthFileActionMapping({
    fileType,
    extractedFacts,
    riskItems: extractedRiskItems,
    contraindications: extractedContraindications,
    followUpHints: extractedFollowUpHints,
    confidence,
  });
  return {
    childId: request.childId,
    sourceRole: request.sourceRole,
    fileKind: request.fileKind,
    fileType,
    summary:
      "T9 mapped extracted health-file hints into conservative childcare actions. Medical diagnosis, medication authorization, and writeback remain out of scope.",
    extractedFacts,
    riskItems: extractedRiskItems,
    contraindications: extractedContraindications,
    followUpHints: extractedFollowUpHints,
    actionMapping,
    confidence,
    disclaimer: HEALTH_FILE_BRIDGE_DISCLAIMER,
    source: options.source,
    fallback: options.fallback,
    mock: options.mock,
    liveReadyButNotVerified: options.liveReadyButNotVerified,
    generatedAt: new Date().toISOString(),
    provider: "next-local-health-file-extractor",
    model: "t8-health-file-bridge-local",
  };
}
