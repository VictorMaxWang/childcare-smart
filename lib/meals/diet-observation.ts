import type { MealRecord, SmartInsight } from "@/lib/store";

/** 从实际餐食记录派生原有饮食提示，保持既有蔬果/单一阈值。 */
export function buildDietObservationInsights(child: { id: string; name: string }, records: ReadonlyArray<Pick<MealRecord, "date" | "foods">>): SmartInsight[] {
  // 空数组表示没有观测，不是零摄入；先补记录，再使用原有阈值评估。
  if (!records.length) return [{ id: `ins-diet-missing-${child.id}`, childId: child.id, level: "info", title: `${child.name} 缺少饮食记录`, description: "近 7 天暂无饮食记录，暂不评估蔬果摄入或补水情况。请先补充实际餐食和饮水记录。", tags: ["饮食", "记录待补", "规则提示"] }];
  const byDay = new Map<string, typeof records>();
  for (const record of records) byDay.set(record.date, [...(byDay.get(record.date) ?? []), record]);
  let vegetableDays = 0, monotonyDays = 0;
  for (const meals of byDay.values()) {
    if (meals.some(meal => meal.foods.some(food => food.category === "蔬果"))) vegetableDays++;
    if (new Set(meals.flatMap(meal => meal.foods.map(food => food.name))).size <= 3) monotonyDays++;
  }
  const insights: SmartInsight[] = [];
  if (monotonyDays >= 3) insights.push({ id: `ins-monotony-${child.id}`, childId: child.id, level: "warning", title: `${child.name} 最近饮食偏单一`, description: "连续多天食物种类较少，建议在加餐加入不同颜色蔬果和优质蛋白。", tags: ["饮食", "单一"] });
  if (vegetableDays <= 2) insights.push({ id: `ins-veg-${child.id}`, childId: child.id, level: "warning", title: `${child.name} 蔬果摄入偏低`, description: "建议在午餐和加餐中增加深色蔬菜与水果切块。", tags: ["饮食", "蔬果不足"] });
  return insights;
}
