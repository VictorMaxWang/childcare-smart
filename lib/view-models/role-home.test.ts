import assert from "node:assert/strict";
import test from "node:test";
import { buildParentHomeViewModel } from "./role-home";
import type { ParentFeed } from "@/lib/store";

test("a 26-month child with growth only gets missing diet copy and an age care rule", () => {
  const today = new Date(); today.setMonth(today.getMonth() - 26); today.setDate(Math.min(today.getDate(), 28));
  const feed = { child: { id: "growth-only", name: "合成儿童", birthDate: today.toISOString().slice(0, 10) }, todayMeals: [], todayGrowth: [{ id: "growth" }], weeklyGrowth: [], weeklyMealCount: 0, weeklyTrend: { hydrationAvg: 0, vegetableDays: 0, proteinDays: 0, stapleDays: 0, balancedRate: 0, monotonyDays: 0 }, suggestions: [], feedbacks: [], hasFeedbackToday: false, mediaGallery: [] } as unknown as ParentFeed;
  const result = buildParentHomeViewModel(feed)!;
  assert.match(result.aiReminder.title, /缺少饮食记录/);
  assert.equal(result.tonightTask.tag, "月龄照护提示（规则）");
  assert.match(result.tonightTask.description, /命名情绪|下一步动作/);
  assert.equal(result.todaySummary.find(item => item.label === "近 7 天补水状态")?.value, "待补饮食记录");
  assert.ok(result.weeklyTrend.every(item => /待补|不评估/.test(item.value)));
  assert.doesNotMatch(JSON.stringify(result), /补水偏少|主动性偏弱|摄入偏低|红色彩蛋/);
  // 有实际记录的零值仍按既有阈值展示，不能把“记录了0”也隐藏成缺数据。
  const observed = buildParentHomeViewModel({ ...feed, weeklyMealCount: 1 })!;
  assert.equal(observed.todaySummary.find(item => item.label === "近 7 天补水状态")?.value, "补水偏少");
  assert.equal(observed.weeklyTrend.find(item => item.label === "蔬菜摄入天数")?.value, "0 天");
});
