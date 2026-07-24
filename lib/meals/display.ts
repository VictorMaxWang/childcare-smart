interface MealFoodDisplayRecord {
  name?: unknown;
  amount?: unknown;
}

function asDisplayRecord(value: unknown): MealFoodDisplayRecord {
  return value && typeof value === "object" ? (value as MealFoodDisplayRecord) : {};
}

/**
 * 将膳食明细格式化为家长可读摘要。存量快照可能缺少 name，
 * 此处使用稳定序号兜底，避免把 JavaScript 的 undefined 暴露给用户。
 */
export function formatMealFoodSummary(foods: unknown): string {
  if (!Array.isArray(foods)) return "";

  return foods
    .map((value, index) => {
      const food = asDisplayRecord(value);
      const rawName =
        typeof value === "string"
          ? value.trim()
          : typeof food.name === "string"
            ? food.name.trim()
            : "";
      const rawAmount =
        typeof food.amount === "string"
          ? food.amount.trim()
          : typeof food.amount === "number" && Number.isFinite(food.amount)
            ? String(food.amount)
            : "";
      const name = rawName || `食物 ${index + 1}`;
      return rawAmount ? `${name}(${rawAmount})` : name;
    })
    .join("、");
}
