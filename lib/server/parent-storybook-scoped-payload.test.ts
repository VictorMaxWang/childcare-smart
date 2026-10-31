import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { ParentStoryBookRequest } from "@/lib/ai/types";
import type { SessionUser } from "@/lib/auth/accounts";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import { buildInterventionCardFromCommunication } from "@/lib/agent/intervention-card";
import { getSessionScope } from "@/lib/server/session-scope";
import { buildParentStoryBookPayloadFromScope } from "./parent-storybook-scoped-payload";

async function fixture() {
  const snapshot = createDemoSeedSnapshot("2026-10-31T08:00:00.000Z") as ApiExtendedSnapshot;
  const child = snapshot.children.find(item => item.id === "c-1")!;
  child.birthDate = "2026-02-28";
  snapshot.health = [{ id: "health-safe", childId: child.id, date: "2026-10-31", temperature: 36.5, mood: "记录中的安稳", handMouthEye: "正常", isAbnormal: false, checkedBy: "synthetic-teacher", checkedByRole: "教师" }];
  snapshot.growth = [
    { ...snapshot.growth[0], id: "growth-safe", childId: child.id, createdAt: "2026-10-31T02:00:00Z", description: "授权教师记录：看见熟悉玩具后伸手。" },
    { ...snapshot.growth[0], id: "growth-old", childId: child.id, createdAt: "2000-01-01T02:00:00Z", description: "不应带入的历史事件" },
    { ...snapshot.growth[0], id: "growth-foreign", childId: "c-2", createdAt: "2026-10-31T02:00:00Z", description: "不应带入的另一儿童事件" },
  ];
  snapshot.feedback = [{ ...snapshot.feedback[0], id: "feedback-safe", childId: child.id, date: "2026-10-31", content: "授权家长反馈：短时安抚后愿意继续玩。" }];
  snapshot.interventionCards = [buildInterventionCardFromCommunication({ targetChildId: child.id, childName: child.name, triggerReason: "真实记录依据", summary: "已保存的照护卡", familyActions: ["授权卡片中的短时陪伴动作"], source: "fallback" })];
  snapshot.consultations = [];
  const user: SessionUser = { id: "u-parent", role: "家长", name: "合成家长", avatar: "", institutionId: child.institutionId, childIds: [child.id], accountKind: "normal" };
  const scope = await getSessionScope(user, { async load() { return snapshot; }, async save() {} });
  const request = JSON.parse(readFileSync(new URL("../../backend/tests/fixtures/parent_storybook/page-recording-c1-bedtime.json", import.meta.url), "utf8")) as ParentStoryBookRequest;
  return { snapshot, scope, request };
}

test("storybook ignores forged child facts, records, highlights, cards and consultations but preserves creative choices", async () => {
  const { scope, request } = await fixture();
  const forged = structuredClone(request);
  forged.snapshot = structuredClone(buildParentStoryBookPayloadFromScope(request, scope, "c-1", "2026-10-31").payload.snapshot);
  forged.snapshot.child.name = "FORGED CHILD";
  forged.snapshot.child.ageBandContext = { policyVersion: "fake", source: "birthDate", birthDate: "2023-01-01", ageMonths: 40, normalizedAgeBand: null };
  forged.snapshot.summary.health.abnormalCount = 999;
  forged.snapshot.recentDetails = { health: [], meals: [], feedback: [], growth: [{ createdAt: "2026-10-31", category: "认知发展", description: "FORGED TEACHER", needsAttention: false }] };
  forged.highlightCandidates = [{ kind: "todayGrowth", title: "FORGED HIGHLIGHT", detail: "FORGED HIGHLIGHT", priority: 9 }];
  forged.latestInterventionCard = { tonightHomeAction: "FORGED CARD" };
  forged.latestConsultation = { ...request.latestConsultation!, summary: "FORGED CONSULTATION" };
  Object.assign(forged, { manualTheme: "小兔安静玩耍", manualPrompt: "用温柔的故事讲这个主题", generationMode: "mixed", styleMode: "custom", customStylePrompt: "柔和水彩", pageCount: 4, requestSource: "browser-nonce-1", traceId: "forged-trace" });
  const result = buildParentStoryBookPayloadFromScope(forged, scope, "c-1", "2026-10-31");
  assert.equal(result.payload.snapshot.child.ageBandContext?.ageMonths, 8);
  assert.equal(result.payload.snapshot.summary.health.abnormalCount, 0);
  assert.match(JSON.stringify(result.payload), /授权教师记录|授权家长反馈/u);
  assert.doesNotMatch(JSON.stringify(result.payload), /FORGED|forged-trace|browser-nonce|不应带入/u);
  assert.equal(result.payload.latestInterventionCard?.tonightHomeAction, "授权卡片中的短时陪伴动作");
  assert.equal(result.payload.latestConsultation, null);
  assert.equal(result.payload.manualTheme, "小兔安静玩耍");
  assert.equal(result.payload.customStylePrompt, "柔和水彩");
  assert.equal(result.payload.pageCount, 4);
});

test("storybook rejects revoked or foreign children before a cache key can be constructed", async () => {
  const { scope, request } = await fixture();
  assert.throws(() => buildParentStoryBookPayloadFromScope(request, scope, "c-2", "2026-10-31"), /无权/u);
  scope.authorizedChildIds.delete("c-1");
  assert.throws(() => buildParentStoryBookPayloadFromScope(request, scope, "c-1", "2026-10-31"), /无权/u);
});

test("trusted record versions invalidate text cache input while browser facts and nonce cannot bypass it", async () => {
  const { scope, request } = await fixture();
  const original = buildParentStoryBookPayloadFromScope(request, scope, "c-1", "2026-10-31");
  const altered = buildParentStoryBookPayloadFromScope({ ...request, requestSource: "fresh-nonce", highlightCandidates: [] }, scope, "c-1", "2026-10-31");
  assert.deepEqual(original, altered);
  scope.scopedSnapshot.growth[0] = { ...scope.scopedSnapshot.growth[0], description: "授权教师更新：需要暂停一次后再陪伴。" };
  const updated = buildParentStoryBookPayloadFromScope(request, scope, "c-1", "2026-10-31");
  assert.notEqual(updated.dataVersion, original.dataVersion);
  assert.notDeepEqual(updated.payload.snapshot.recentDetails, original.payload.snapshot.recentDetails);
});
