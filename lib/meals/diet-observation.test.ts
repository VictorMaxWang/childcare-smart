import assert from "node:assert/strict";
import test from "node:test";
import { buildDietObservationInsights } from "./diet-observation";

test("no meal observations means missing data instead of low fruit or hydration intake", () => {
  const result = buildDietObservationInsights({ id: "child", name: "合成儿童" }, []);
  assert.ok(result.some(item => /缺少饮食记录/.test(item.title)));
  assert.equal(result.filter(item => item.level === "warning").length, 0);
  assert.doesNotMatch(result.map(item => item.title).join(""), /摄入偏低|饮食偏单一|补水偏少/);
});

test("actual meal observations retain low-vegetable and repeated-monotony thresholds", () => {
  const meals = Array.from({ length: 3 }, (_, index) => ({ date: `2026-10-${29 + index}`, foods: [{ id: `food-${index}`, name: "米饭", category: "主食" as const, amount: "少量" }] }));
  const result = buildDietObservationInsights({ id: "child", name: "合成儿童" }, meals);
  assert.ok(result.some(item => item.id === "ins-veg-child" && item.level === "warning"));
  assert.ok(result.some(item => item.id === "ins-monotony-child" && item.level === "warning"));
  const varied = meals.map(meal => ({ ...meal, foods: [...meal.foods, { id: "veg", name: "青菜", category: "蔬果" as const, amount: "少量" }] }));
  assert.equal(buildDietObservationInsights({ id: "child", name: "合成儿童" }, varied).some(item => item.id === "ins-veg-child"), false);
});
