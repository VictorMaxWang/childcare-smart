import assert from "node:assert/strict";
import test from "node:test";

import { formatMealFoodSummary } from "@/lib/meals/display";

test("formatMealFoodSummary keeps valid names and amounts", () => {
  assert.equal(
    formatMealFoodSummary([
      { name: "\u7c73\u996d", amount: "80g" },
      { name: "\u897f\u5170\u82b1", amount: "" },
    ]),
    "\u7c73\u996d(80g)\u3001\u897f\u5170\u82b1"
  );
});

test("formatMealFoodSummary replaces malformed legacy names with stable labels", () => {
  const summary = formatMealFoodSummary([
    { amount: "50g" },
    { name: undefined },
    "\u7389\u7c73",
    { name: "\u725b\u5976", amount: 120 },
  ]);

  assert.equal(
    summary,
    "\u98df\u7269 1(50g)\u3001\u98df\u7269 2\u3001\u7389\u7c73\u3001\u725b\u5976(120)"
  );
  assert.equal(summary.includes("undefined"), false);
});
