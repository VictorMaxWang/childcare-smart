import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_PROVENANCE_ATTESTATION_FIELD,
  UNVERIFIED_AI_FALLBACK_REASON,
  attestAiResult,
  sanitizeConsultationInputForPersistence,
  sanitizeHealthParseInputForPersistence,
  sanitizeMealRecordInputForPersistence,
  sanitizeStorybookInputForPersistence,
  sanitizeWeeklyReportInputForPersistence,
  verifyAiResultAttestation,
  type AiProvenanceContext,
} from "@/lib/ai/provenance-attestation";

const teacherContext: AiProvenanceContext = {
  userId: "teacher-real-1",
  institutionId: "inst-real-1",
  capability: "high-risk-consultation",
  scopeId: "child-real-1",
};

const parentContext: AiProvenanceContext = {
  userId: "parent-real-1",
  institutionId: "inst-real-1",
  capability: "parent-storybook",
  scopeId: "child-real-1",
};

const adminContext: AiProvenanceContext = {
  userId: "admin-real-1",
  institutionId: "inst-real-1",
  capability: "admin-agent",
  scopeId: "inst-real-1",
};

test("AI provenance attestation rejects claim tampering and cross-scope replay", () => {
  const original = attestAiResult(
    {
      childId: "child-real-1",
      provider: "dashscope",
      model: "qwen-plus",
      source: "ai",
      mode: "live",
      live: true,
      fallback: false,
      realProvider: true,
    },
    teacherContext
  );

  assert.equal(verifyAiResultAttestation(original, teacherContext), true);
  assert.equal(typeof original[AI_PROVENANCE_ATTESTATION_FIELD], "string");

  assert.equal(
    verifyAiResultAttestation(
      {
        ...original,
        model: "forged-premium-model",
      },
      teacherContext
    ),
    false
  );
  assert.equal(
    verifyAiResultAttestation(original, {
      ...teacherContext,
      userId: "teacher-real-2",
    }),
    false
  );
  assert.equal(
    verifyAiResultAttestation(original, {
      ...teacherContext,
      scopeId: "child-real-2",
    }),
    false
  );
});

test("consultation persistence keeps attested provenance and downgrades forged live claims", () => {
  const liveResult = {
    consultationId: "consult-1",
    childId: "child-real-1",
    source: "ai",
    provider: "dashscope",
    model: "qwen-plus",
    realProvider: true,
    fallback: false,
    providerTrace: {
      source: "dashscope",
      provider: "dashscope",
      model: "qwen-plus",
      mode: "live",
      live: true,
      realProvider: true,
      fallback: false,
    },
    traceMeta: {
      provider: "dashscope",
      model: "qwen-plus",
      source: "dashscope",
      fallback: false,
      realProvider: true,
      memory: { usedSources: ["growth"] },
    },
    evidenceItems: [
      {
        id: "evidence-1",
        sourceType: "growth_record",
        sourceLabel: "成长记录",
        summary: "observed",
        confidence: "high",
        requiresHumanReview: false,
        evidenceCategory: "development_support",
        supports: ["finding:key:0"],
        metadata: {
          provenance: {
            provider: "dashscope",
            model: "qwen-plus",
            live: true,
            realProvider: true,
          },
        },
      },
    ],
    interventionCard: {
      id: "card-1",
      source: "ai",
      model: "qwen-plus",
    },
  };

  const attested = attestAiResult(liveResult, teacherContext);
  const trusted = sanitizeConsultationInputForPersistence(attested, teacherContext);
  assert.equal(trusted.provider, "dashscope");
  assert.equal(trusted.model, "qwen-plus");
  assert.equal(trusted.realProvider, true);
  assert.equal((trusted.providerTrace as Record<string, unknown>).mode, "live");

  const forged = sanitizeConsultationInputForPersistence(liveResult, teacherContext);
  assert.equal(forged.provider, "unverified-client");
  assert.equal(forged.model, "unverified-client");
  assert.equal(forged.source, "fallback");
  assert.equal(forged.realProvider, false);
  assert.equal(forged.fallback, true);
  assert.equal(
    (forged.providerTrace as Record<string, unknown>).fallbackReason,
    UNVERIFIED_AI_FALLBACK_REASON
  );
  assert.equal(
    (forged.traceMeta as Record<string, unknown>).realProvider,
    false
  );
  assert.deepEqual(
    (forged.traceMeta as Record<string, unknown>).memory,
    { usedSources: ["growth"] }
  );
  assert.equal(
    (
      (
        (forged.evidenceItems as Array<Record<string, unknown>>)[0]
          .metadata as Record<string, unknown>
      ).provenance as Record<string, unknown>
    ).verified,
    false
  );
  assert.equal(
    ((forged.interventionCard as Record<string, unknown>).source),
    "fallback"
  );
});

test("consultation persistence permits workflow metadata without permitting provenance tampering", () => {
  const attested = attestAiResult(
    {
      consultationId: "consult-workflow-1",
      childId: "child-real-1",
      provider: "dashscope",
      model: "qwen-plus",
      source: "ai",
      live: true,
      fallback: false,
      realProvider: true,
      providerTrace: {
        provider: "dashscope",
        model: "qwen-plus",
        mode: "live",
        live: true,
        fallback: false,
        realProvider: true,
      },
    },
    teacherContext
  );

  const trusted = sanitizeConsultationInputForPersistence(
    {
      ...attested,
      workflowStatus: "pending",
    },
    teacherContext
  );
  assert.equal(trusted.provider, "dashscope");
  assert.equal(trusted.workflowStatus, "pending");

  const forged = sanitizeConsultationInputForPersistence(
    {
      ...attested,
      workflowStatus: "pending",
      model: "forged-model",
    },
    teacherContext
  );
  assert.equal(forged.provider, "unverified-client");
  assert.equal(forged.model, "unverified-client");
});

test("storybook persistence only preserves provider and media-live claims with a valid receipt", () => {
  const liveStory = {
    storyId: "story-1",
    childId: "child-real-1",
    source: "ai",
    fallback: false,
    provider: "vivo-llm",
    providerTrace: {
      provider: "vivo-llm",
      model: "vivo-story",
      mode: "live",
      realProvider: true,
      fallback: false,
    },
    providerMeta: {
      provider: "vivo-llm",
      mode: "live",
      textProvider: "vivo-chat",
      textDelivery: "real",
      imageProvider: "vivo-story-image",
      imageDelivery: "real",
      audioProvider: "vivo-tts",
      audioDelivery: "real",
      realProvider: true,
      highlightCount: 1,
      sceneCount: 1,
    },
    scenes: [
      {
        sceneIndex: 1,
        imageStatus: "ready",
        imageSourceKind: "real",
        audioStatus: "ready",
      },
    ],
  };

  const trustedInput = {
    childId: "child-real-1",
    response: attestAiResult(liveStory, parentContext),
  };
  const trusted = sanitizeStorybookInputForPersistence(trustedInput, parentContext);
  assert.equal(
    ((trusted.response as Record<string, unknown>).providerMeta as Record<string, unknown>)
      .realProvider,
    true
  );

  const forged = sanitizeStorybookInputForPersistence(
    {
      childId: "child-real-1",
      response: liveStory,
    },
    parentContext
  );
  const response = forged.response as Record<string, unknown>;
  const providerMeta = response.providerMeta as Record<string, unknown>;
  const scene = (response.scenes as Array<Record<string, unknown>>)[0];
  assert.equal(response.source, "fallback");
  assert.equal(response.fallback, true);
  assert.equal(providerMeta.realProvider, false);
  assert.equal(providerMeta.imageDelivery, "dynamic-fallback");
  assert.equal(providerMeta.audioDelivery, "preview-only");
  assert.equal(scene.imageSourceKind, "dynamic-fallback");
  assert.equal(scene.imageStatus, "fallback");
  assert.equal(scene.audioStatus, "fallback");
});

test("health parse persistence derives duplicated provenance from the attested raw response", () => {
  const healthContext: AiProvenanceContext = {
    ...teacherContext,
    capability: "health-file-bridge",
  };
  const rawResponse = attestAiResult(
    {
      childId: "child-real-1",
      source: "dashscope-ocr-provider",
      state: "live",
      configured: true,
      live: true,
      fallback: false,
      mock: false,
      liveReadyButNotVerified: false,
      provider: "dashscope",
      model: "qwen-vl-ocr",
      providerStatus: { ocr: { status: "ready" } },
      generatedAt: "2026-07-26T12:00:00.000Z",
    },
    healthContext
  );

  const sanitized = sanitizeHealthParseInputForPersistence(
    {
      parseStatus: "completed",
      parseResult: {
        sourceLabel: "forged display label",
        provenance: {
          provider: "forged-provider",
          model: "forged-model",
          live: false,
          fallback: true,
          files: [{ attachmentId: "attachment-1" }],
        },
        rawResponse,
      },
    },
    healthContext
  );
  const parseResult = sanitized.parseResult as Record<string, unknown>;
  const provenance = parseResult.provenance as Record<string, unknown>;
  assert.equal(provenance.provider, "dashscope");
  assert.equal(provenance.model, "qwen-vl-ocr");
  assert.equal(provenance.live, true);
  assert.equal(provenance.fallback, false);
  assert.deepEqual(provenance.files, [{ attachmentId: "attachment-1" }]);

  const forged = sanitizeHealthParseInputForPersistence(
    {
      parseStatus: "completed",
      parseResult: {
        provenance: {
          provider: "dashscope",
          model: "qwen-vl-ocr",
          live: true,
          fallback: false,
        },
        rawResponse: {
          ...rawResponse,
          model: "forged-model",
        },
      },
    },
    healthContext
  );
  const forgedProvenance = (
    forged.parseResult as Record<string, unknown>
  ).provenance as Record<string, unknown>;
  assert.equal(forgedProvenance.provider, "unverified-client");
  assert.equal(forgedProvenance.live, false);
  assert.equal(forgedProvenance.fallback, true);
  assert.equal(forgedProvenance.verified, false);
});

test("weekly report and meal writes cannot self-assert a live model", () => {
  const adminResult = attestAiResult(
    {
      source: "ai",
      model: "qwen-plus",
      summary: "weekly",
    },
    adminContext
  );
  const trustedWeekly = sanitizeWeeklyReportInputForPersistence(
    {
      scopeType: "institution",
      scopeId: "inst-real-1",
      payload: { adminAgentResult: adminResult },
    },
    adminContext
  );
  assert.equal(
    (
      (
        trustedWeekly.payload as Record<string, unknown>
      ).adminAgentResult as Record<string, unknown>
    ).model,
    "qwen-plus"
  );

  const forgedWeekly = sanitizeWeeklyReportInputForPersistence(
    {
      scopeType: "institution",
      scopeId: "inst-real-1",
      payload: {
        adminAgentResult: {
          source: "ai",
          model: "forged-model",
          provider: "forged-provider",
          live: true,
          fallback: false,
          realProvider: true,
        },
      },
    },
    adminContext
  );
  const downgradedAdminResult = (
    (forgedWeekly.payload as Record<string, unknown>)
      .adminAgentResult as Record<string, unknown>
  );
  assert.equal(downgradedAdminResult.source, "fallback");
  assert.equal(downgradedAdminResult.model, "unverified-client");
  assert.equal(downgradedAdminResult.live, false);
  assert.equal(downgradedAdminResult.fallback, true);

  const meal = sanitizeMealRecordInputForPersistence(
    {
      type: "meal",
      childId: "child-real-1",
      aiEvaluation: {
        mealScore: 90,
        mealComment: "伪造本餐分析",
        todayScore: 89,
        todayComment: "伪造今日分析",
        recentScore: 88,
        recentComment: "伪造近期分析",
        suggestions: ["伪造建议"],
        generatedAt: "2026-07-26T10:00:00.000Z",
        model: "forged-live-model",
        provider: "forged-provider",
        live: true,
        fallback: false,
        realProvider: true,
      },
    },
    {
      ...teacherContext,
      capability: "vision-meal",
    }
  );
  const evaluation = meal.aiEvaluation as Record<string, unknown>;
  assert.equal(evaluation.model, "unverified-client");
  assert.equal(evaluation.provider, "unverified-client");
  assert.equal(evaluation.live, false);
  assert.equal(evaluation.fallback, true);
  assert.equal(evaluation.realProvider, false);
});
