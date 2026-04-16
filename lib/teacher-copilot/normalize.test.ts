import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTeacherCopilotPayload } from "./normalize.ts";

test("normalizeTeacherCopilotPayload accepts teacher voice snake_case copilot fields", () => {
  const result = normalizeTeacherCopilotPayload({
    record_completion_hints: [
      {
        label: "补充是哪一餐",
        reason: "不区分早餐、午餐还是点心，后续饮食判断会失真。",
        suggested_prompt: "可以最短补一句：是早餐、午餐，还是点心时段。",
      },
    ],
    micro_training_sop: [
      {
        title: "饮食观察 30 秒 SOP",
        steps: ["先确认是哪一餐", "再补一句食量和补水情况"],
        duration_text: "30 秒",
      },
    ],
    parent_communication_script: {
      short_message: "今天这条饮食观察我们已经先记录。",
      calm_explanation: "目前主要想先和您对齐餐次、食量和补水表现。",
      follow_up_reminder: "今晚请简单反馈晚餐和饮水情况，便于明早衔接。",
    },
  });

  assert.ok(result);
  assert.equal(result?.recordCompletionHints?.[0]?.title, "补充是哪一餐");
  assert.match(result?.recordCompletionHints?.[0]?.detail ?? "", /饮食判断会失真/);
  assert.equal(result?.microTrainingSOP?.title, "饮食观察 30 秒 SOP");
  assert.equal(result?.microTrainingSOP?.durationLabel, "30 秒");
  assert.deepEqual(
    result?.microTrainingSOP?.steps.map((step) => step.title),
    ["先确认是哪一餐", "再补一句食量和补水情况"]
  );
  assert.equal(
    result?.parentCommunicationScript?.opening,
    "今天这条饮食观察我们已经先记录。"
  );
  assert.equal(
    result?.parentCommunicationScript?.situation,
    "目前主要想先和您对齐餐次、食量和补水表现。"
  );
  assert.equal(
    result?.parentCommunicationScript?.closing,
    "今晚请简单反馈晚餐和饮水情况，便于明早衔接。"
  );
});
