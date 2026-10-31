import assert from "node:assert/strict";
import test from "node:test";
import { CARE_COURSES, safeBilibiliUrl } from "./catalog";
import { evaluateCombination, normalizedCosine, optimizeRecommendations, pairKey, reuseRecommendations, type OptimizationInput, type RecommendationCandidate } from "./optimizer";

const candidate = (id: string, overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate => ({ id, durationSeconds: 120, goals: ["feeding"], purpose: "explain", relevance: 0.8, complementarity: 0.6, preference: 0.5, eligible: true, duplicateGroup: "", ...overrides });
const input = (candidates: RecommendationCandidate[], overrides: Partial<OptimizationInput> = {}): OptimizationInput => ({ candidates, targetGoals: ["feeding"], budgetSeconds: 300, preferenceAvailable: false, pairSimilarities: {}, ...overrides });

test("catalog provides nine original micro-lessons across the three domains", () => {
  assert.equal(CARE_COURSES.length, 9);
  for (const category of ["nutrition", "psychology", "movement"]) assert.equal(CARE_COURSES.filter(course => course.module === category).length, 3);
  for (const course of CARE_COURSES) {
    assert(safeBilibiliUrl(course.video.url));
    assert(course.video.durationSeconds && course.video.durationSeconds > 0);
    assert.equal(course.video.verificationStatus, "verified");
    assert(course.cards.length >= 2 && course.question.choices.length >= 2 && course.practice);
    assert(course.question.answer >= 0 && course.question.answer < course.question.choices.length);
  }
});
test("Bilibili URL whitelist rejects arbitrary hosts, credentials and invalid parts", () => {
  assert.equal(safeBilibiliUrl("https://www.bilibili.com/video/BV13X4y1u7VE/?p=2"), "https://www.bilibili.com/video/BV13X4y1u7VE/?p=2");
  for (const value of ["http://www.bilibili.com/video/BV13X4y1u7VE/", "https://evil.test/video/BV13X4y1u7VE/", "https://www.bilibili.com.evil.test/video/BV13X4y1u7VE/", "https://www.bilibili.com/video/BV13X4y1u7VE/?p=0", "javascript:alert(1)"]) assert.equal(safeBilibiliUrl(value), null);
});
test("hard video budget rejects excess duration and unknown/zero duration", () => {
  const data = input([candidate("long", { durationSeconds: 301 }), candidate("unknown", { durationSeconds: 0 }), candidate("short")]);
  assert.deepEqual(optimizeRecommendations(data).ids, ["short"]);
  assert.equal(evaluateCombination(data, ["long"]), null);
  assert.equal(evaluateCombination(data, ["unknown"]), null);
});
test("duplicate video groups cannot be recommended twice", () => {
  const data = input([candidate("a", { duplicateGroup: "same-video" }), candidate("b", { duplicateGroup: "same-video" })]);
  assert.equal(evaluateCombination(data, ["a", "b"]), null);
  assert.equal(optimizeRecommendations(data).ids.length, 1);
});
test("combined goal coverage can beat a single highly relevant resource", () => {
  const data = input([candidate("nutrition", { goals: ["feeding"], relevance: 1 }), candidate("emotion", { goals: ["emotion"], purpose: "practice", relevance: 0.8, complementarity: 1 })], { targetGoals: ["feeding", "emotion"] });
  assert.deepEqual(optimizeRecommendations(data).ids, ["emotion", "nutrition"]);
});
test("irrelevant and ineligible content is never selected", () => {
  const data = input([candidate("excluded", { eligible: false }), candidate("valid")]);
  assert.deepEqual(optimizeRecommendations(data).ids, ["valid"]);
  assert.deepEqual(optimizeRecommendations(input([candidate("a")], { targetGoals: [] })).ids, []);
});
test("optimizer enumerates the complete finite 1-to-3 combination space", () => {
  const data = input(Array.from({ length: 20 }, (_, index) => candidate(`id-${String(index).padStart(2, "0")}`, { durationSeconds: 1 })));
  const result = optimizeRecommendations(data);
  assert.equal(result.evaluatedCombinations, 1350);
  assert(result.ids.length <= 3);
  assert.throws(() => optimizeRecommendations(input([...data.candidates, candidate("extra")])), /Invalid recommendation input/);
});
test("selection is deterministic across input order and chooses shorter ties", () => {
  const data = input([candidate("z", { durationSeconds: 110 }), candidate("a", { durationSeconds: 100 })]);
  assert.deepEqual(optimizeRecommendations(data).ids, ["a"]);
  assert.deepEqual(optimizeRecommendations({ ...data, candidates: [...data.candidates].reverse() }).ids, ["a"]);
});
test("independent evaluation rejects tampered ids and duplicated resources", () => {
  const data = input([candidate("a")]);
  assert.equal(evaluateCombination(data, ["missing"]), null);
  assert.equal(evaluateCombination(data, ["a", "a"]), null);
});
test("semantic redundancy is penalized for same-purpose pairs", () => {
  const resources = [candidate("a"), candidate("b")];
  const duplicate = evaluateCombination(input(resources, { pairSimilarities: { [pairKey("a", "b")]: 1 } }), ["a", "b"])!;
  const diverse = evaluateCombination(input([resources[0], { ...resources[1], purpose: "practice" }], { pairSimilarities: { [pairKey("a", "b")]: 1 } }), ["a", "b"])!;
  assert.equal(duplicate.redundancy, 1);
  assert.equal(diverse.redundancy, 0);
  assert(diverse.total > duplicate.total);
});
test("reuse requires current feasibility and the explicit 0.02 score gap", () => {
  const data = input([candidate("best", { relevance: 1 }), candidate("near", { relevance: 0.99 }), candidate("poor", { relevance: 0.1 })]);
  assert.equal(reuseRecommendations(data, ["near"]).reused, true);
  assert.equal(reuseRecommendations(data, ["poor"]).reused, false);
  assert.equal(reuseRecommendations(data, ["missing"]).reused, false);
});
test("embedding validation rejects invalid spaces and zero vectors", () => {
  assert.equal(normalizedCosine([1, 0], [1, 0]), 1);
  assert.equal(normalizedCosine([1, 0], [-1, 0]), 0);
  assert.throws(() => normalizedCosine([1], [1, 2]), /dimension/);
  assert.throws(() => normalizedCosine([0, 0], [1, 0]), /Zero/);
  assert.throws(() => normalizedCosine([NaN], [1]), /value/);
});
test("invalid model features are rejected instead of appearing as empty recommendations", () => {
  assert.throws(() => optimizeRecommendations(input([candidate("a", { relevance: NaN })])), /features/);
  assert.throws(() => optimizeRecommendations(input([candidate("a"), candidate("a")])), /candidate/);
});
