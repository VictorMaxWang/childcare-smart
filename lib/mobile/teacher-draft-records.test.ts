import assert from "node:assert/strict";
import test from "node:test";

import type { MobileDraft } from "@/lib/ai/types";
import { createTeacherDraftPersistAdapter } from "@/lib/mobile/teacher-draft-records";

function sourceDraft(): MobileDraft {
  return {
    draftId: "voice-draft-retry",
    childId: "c-1",
    draftType: "voice",
    targetRole: "teacher",
    content: "林小雨体温 38.1 度",
    persistenceScope: "remote",
    syncStatus: "synced",
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
    structuredPayload: {
      kind: "teacher-voice-understanding",
      t5Seed: {
        transcript: "林小雨体温 38.1 度",
        router_result: null,
        draft_items: [
          {
            child_ref: "c-1",
            child_name: "林小雨",
            category: "HEALTH",
            summary: "体温 38.1 度",
            structured_fields: { temperature_c: 38.1 },
            confidence: 0.96,
            suggested_actions: ["立即复查"],
            raw_excerpt: "林小雨体温 38.1 度",
            source: "voice",
          },
        ],
        warnings: [],
      },
    },
  };
}

test("failed teacher draft confirmation returns to pending and can be retried", async () => {
  const draft = sourceDraft();
  let attempts = 0;
  let savedDraft = draft;
  const adapter = createTeacherDraftPersistAdapter({
    drafts: [draft],
    saveDraft: (next) => {
      savedDraft = next;
    },
    persistRecordAction: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary records outage");
      return {
        status: "saved",
        message: "saved",
        persistedAt: "2026-07-25T08:02:00.000Z",
      };
    },
  });

  const first = await adapter.confirmDraft({
    sourceDraftId: draft.draftId,
    recordId: `${draft.draftId}-record-1`,
  });
  assert.equal(first.record?.status, "pending");
  assert.equal(first.record?.persistStatus, "failed");

  const second = await adapter.confirmDraft({
    sourceDraftId: draft.draftId,
    recordId: `${draft.draftId}-record-1`,
  });
  assert.equal(second.record?.status, "confirmed");
  assert.equal(second.record?.persistStatus, "saved");
  assert.equal(attempts, 2);
  assert.equal(
    (savedDraft.structuredPayload?.t5State as { records?: Array<{ status?: string }> })
      .records?.[0]?.status,
    "confirmed"
  );
});

test("concurrent teacher draft confirmations share one persistence request", async () => {
  const draft = sourceDraft();
  let attempts = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter = createTeacherDraftPersistAdapter({
    drafts: [draft],
    saveDraft: () => undefined,
    persistRecordAction: async () => {
      attempts += 1;
      await waiting;
      return {
        status: "saved",
        message: "saved",
        persistedAt: "2026-07-25T08:02:00.000Z",
      };
    },
  });
  const request = {
    sourceDraftId: draft.draftId,
    recordId: `${draft.draftId}-record-1`,
  };

  const first = adapter.confirmDraft(request);
  const second = adapter.confirmDraft(request);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 1);
  release();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.record?.persistStatus, "saved");
  assert.equal(secondResult.record?.persistStatus, "saved");
});
