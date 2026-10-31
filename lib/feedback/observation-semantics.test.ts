import assert from "node:assert/strict";
import test from "node:test";
import { classifyFeedbackObservationTags, formatLegacyFeedbackObservationMessage, projectFeedbackObservationSemantics } from "./observation-semantics";

test("new observation selections become notes and support needs while genuine barriers remain distinct", () => {
  const result = projectFeedbackObservationSemantics({ barriers: ["今晚没时间"], observations: ["情绪稳定", "主动参与", "需要提醒"], notes: "真实家庭备注", attachments: { voice: [{ name: "voice.wav" }] }, feedbackId: "feedback-a" });
  assert.deepEqual(result.barriers, ["今晚没时间"]);
  assert.equal(result.notes, "真实家庭备注\n观察到：情绪稳定、主动参与\n支持需求：需要提醒");
  assert.equal(result.feedbackId, "feedback-a");
  assert.deepEqual(result.attachments, { voice: [{ name: "voice.wav" }] });
  assert.deepEqual(projectFeedbackObservationSemantics(result), result);
});

test("legacy exact labels are split without reinterpreting free-text barriers or dropping notes", () => {
  const original = { barriers: ["情绪稳定", "需要提醒", "孩子情绪稳定但无法完成动作", "孩子抗拒", "情绪稳定"], notes: "原有备注", content: "原始自由文本", freeNote: "自由补充" };
  const before = structuredClone(original);
  const projected = projectFeedbackObservationSemantics(original);
  assert.deepEqual(projected.barriers, ["孩子情绪稳定但无法完成动作", "孩子抗拒"]);
  assert.match(projected.notes, /观察到：情绪稳定/u);
  assert.match(projected.notes, /支持需求：需要提醒/u);
  assert.equal(projected.content, "原始自由文本");
  assert.equal(projected.freeNote, "自由补充");
  assert.deepEqual(original, before, "兼容读取不改写原记录");
});

test("only controlled generated message fields are relabeled, retaining genuine obstacles and rest of message", () => {
  const original = "合成儿童今晚反馈：已完成执行。孩子反应：孩子愿意配合。改善情况：已经有明确改善。主要阻碍：情绪稳定、需要提醒、今晚没时间。补充说明：真实备注";
  const display = formatLegacyFeedbackObservationMessage(original);
  assert.match(display, /主要阻碍：今晚没时间。/u);
  assert.match(display, /观察到：情绪稳定。支持需求：需要提醒。/u);
  assert.match(display, /补充说明：真实备注$/u);
  assert.equal(formatLegacyFeedbackObservationMessage(display), display);
  assert.equal(formatLegacyFeedbackObservationMessage("家长原话：主要阻碍：情绪稳定。这个词标错了。"), "家长原话：主要阻碍：情绪稳定。这个词标错了。");
});

test("old generated English mirrors preserve observation meaning without retaining a false barrier field", () => {
  const value = { barriers: ["情绪稳定"], freeNote: "实际备注 | Barriers: 情绪稳定", content: "实际备注 | Barriers: 情绪稳定 | Execution: completed" };
  const projected = projectFeedbackObservationSemantics(value);
  assert.deepEqual(projected.barriers, []);
  assert.doesNotMatch(projected.content ?? "", /Barriers:/u);
  assert.match(projected.content ?? "", /观察到：情绪稳定/u);
  assert.match(projected.notes, /实际备注/u);
});

test("unknown labels stay as barriers and malformed arrays do not inject non-text values", () => {
  assert.deepEqual(classifyFeedbackObservationTags([null, 1, " 真实困难 ", "需要提醒"]), { barriers: ["真实困难"], observations: [], supportNeeds: ["需要提醒"] });
});
