import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHealthFileBridgeResponse,
  buildHealthFileBridgeWriteback,
  isValidHealthFileBridgeRequest,
} from "./health-file-bridge.ts";

test("health-file-bridge helper returns extraction-only output for metadata-heavy files", () => {
  const request = {
    childId: "child-1",
    sourceRole: "teacher",
    files: [
      {
        fileId: "file-1",
        name: "external-health-note.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      },
    ],
    requestSource: "unit-test",
  } as const;

  assert.equal(isValidHealthFileBridgeRequest(request), true);

  const result = buildHealthFileBridgeResponse(request, {
    source: "next-local-extractor",
    fallback: true,
    mock: true,
    liveReadyButNotVerified: true,
  });

  assert.equal(result.source, "next-local-extractor");
  assert.equal(result.fileType, "pdf");
  assert.equal(result.fallback, true);
  assert.equal(result.mock, true);
  assert.equal(result.liveReadyButNotVerified, true);
  assert.ok(result.disclaimer.includes("T9 bridge"));
  assert.ok(result.extractedFacts.length >= 3);
  assert.ok(result.riskItems.length > 0);
  assert.ok(result.followUpHints.length > 0);
  assert.ok(result.actionMapping);
  assert.ok(result.actionMapping?.schoolTodayActions.length);
  assert.equal(result.actionMapping?.escalationSuggestion.level, "routine");
  assert.equal(typeof result.confidence, "number");
});

test("health-file-bridge helper promotes fever and medication cues into extraction fields only", () => {
  const request = {
    childId: "child-2",
    sourceRole: "parent",
    fileKind: "prescription",
    files: [
      {
        fileId: "file-2",
        name: "recheck-slip.png",
        mimeType: "image/png",
        sizeBytes: 4096,
        previewText: "发热 38.1，明早复查，继续雾化",
      },
    ],
    requestSource: "unit-test",
    optionalNotes: "家长补充：有过敏史，今天仍在用药。",
  } as const;

  const result = buildHealthFileBridgeResponse(request, {
    source: "next-local-extractor",
    fallback: true,
    mock: true,
    liveReadyButNotVerified: true,
  });

  const riskTitles = result.riskItems.map((item) => item.title);
  const factLabels = result.extractedFacts.map((item) => item.label);
  const contraindicationTitles = result.contraindications.map((item) => item.title);

  assert.equal(result.fileType, "mixed");
  assert.ok(riskTitles.includes("Potential allergy-related instruction detected"));
  assert.ok(riskTitles.includes("Temperature-related signal needs manual confirmation"));
  assert.ok(factLabels.includes("Allergy mention"));
  assert.ok(factLabels.includes("Temperature mention"));
  assert.ok(
    contraindicationTitles.includes("Do not infer a daycare medication plan from the file alone")
  );
  assert.ok(result.followUpHints.length > 0);
  assert.ok(result.actionMapping);
  assert.equal(result.actionMapping?.escalationSuggestion.level, "same-day-review");
  assert.ok(
    result.actionMapping?.schoolTodayActions.some((item) =>
      item.title.includes("Temporarily avoid unverified allergen exposure today")
    )
  );
  assert.ok(
    result.actionMapping?.schoolTodayActions.some((item) =>
      item.title.includes("Do not administer medicine from the file alone")
    )
  );
  assert.ok(result.confidence >= 0.6);
});

test("health-file-bridge helper keeps contraindications from turning into risky actions", () => {
  const request = {
    childId: "child-3",
    sourceRole: "teacher",
    files: [
      {
        fileId: "file-3",
        name: "allergy-note.png",
        mimeType: "image/png",
        previewText: "allergy medication fever 38.2 follow-up tomorrow",
      },
    ],
    requestSource: "unit-test",
  } as const;

  const result = buildHealthFileBridgeResponse(request, {
    source: "next-local-extractor",
    fallback: true,
    mock: true,
    liveReadyButNotVerified: true,
  });

  const flattenedActionText = [
    ...(result.actionMapping?.schoolTodayActions ?? []),
    ...(result.actionMapping?.familyTonightActions ?? []),
    ...(result.actionMapping?.followUpPlan ?? []),
  ]
    .map((item) => `${item.title} ${item.detail}`.toLowerCase())
    .join(" ");

  assert.ok(!flattenedActionText.includes("resume normal activity"));
  assert.ok(!flattenedActionText.includes("allergen exposure is acceptable"));
  assert.ok(!flattenedActionText.includes("administer medicine based on the file"));
});

test("health-file-bridge helper builds writeback contract with provenance and follow-up seed", () => {
  const request = {
    childId: "child-4",
    sourceRole: "parent",
    fileKind: "health-note",
    files: [
      {
        fileId: "file-4",
        name: "health-note.png",
        mimeType: "image/png",
        previewText: "follow-up tomorrow and watch temperature tonight",
      },
    ],
    requestSource: "unit-test",
    traceId: "trace-health-4",
  } as const;

  const response = buildHealthFileBridgeResponse(request, {
    source: "next-local-extractor",
    fallback: true,
    mock: true,
    liveReadyButNotVerified: true,
  });
  const writeback = buildHealthFileBridgeWriteback(request, response);

  assert.equal(writeback.provenance.bridgeOrigin, "health-file-bridge");
  assert.equal(writeback.provenance.source, "next-local-extractor");
  assert.equal(writeback.provenance.fallback, true);
  assert.equal(writeback.provenance.liveReadyButNotVerified, true);
  assert.equal(writeback.provenance.traceId, "trace-health-4");
  assert.equal(writeback.childScopedArtifacts[0]?.childId, "child-4");
  assert.equal(writeback.childScopedArtifacts[0]?.artifactType, "health-file-bridge");
  assert.equal(writeback.followUpSeed.familyTask.title.length > 0, true);
  assert.equal(writeback.followUpSeed.reviewIn48h.length > 0, true);
  assert.equal(writeback.memoryCandidate.summary, response.summary);
  assert.equal(writeback.weeklyReportSeed, null);
});
