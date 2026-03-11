"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChefHat, Plus, Salad, ShieldAlert, X } from "lucide-react";
import {
  calcNutritionScore,
  FOOD_CATEGORY_OPTIONS,
  formatDisplayDate,
  getAgeBandFromBirthDate,
  getAgeText,
  MEAL_TYPES,
  type FoodCategory,
  type FoodItem,
  type IntakeLevel,
  type MealRecord,
  type MealType,
  type PreferenceStatus,
  useApp,
} from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/EmptyState";
import { toast } from "sonner";

const TODAY = new Date().toISOString().split("T")[0];

const QUICK_FOODS: Record<MealType, { name: string; category: FoodCategory; amount: string }[]> = {
  早餐: [
    { name: "牛奶", category: "奶制品", amount: "180ml" },
    { name: "鸡蛋", category: "蛋白", amount: "1个" },
    { name: "全麦面包", category: "主食", amount: "2片" },
  ],
  午餐: [
    { name: "米饭", category: "主食", amount: "1碗" },
    { name: "鸡肉", category: "蛋白", amount: "80g" },
    { name: "西兰花", category: "蔬果", amount: "60g" },
  ],
  晚餐: [
    { name: "面条", category: "主食", amount: "1碗" },
    { name: "豆腐", category: "蛋白", amount: "70g" },
    { name: "青菜", category: "蔬果", amount: "50g" },
  ],
  加餐: [
    { name: "香蕉", category: "蔬果", amount: "半根" },
    { name: "酸奶", category: "奶制品", amount: "100ml" },
    { name: "坚果碎", category: "其他", amount: "1小份" },
  ],
};

const INTAKE_OPTIONS: IntakeLevel[] = ["少量", "适中", "充足"];
const PREFERENCE_OPTIONS: PreferenceStatus[] = ["偏好", "正常", "拒食"];

export default function DietPage() {
  const {
    currentUser,
    visibleChildren,
    presentChildren,
    mealRecords,
    upsertMealRecord,
    bulkApplyMealTemplate,
    previewBulkMealTemplate,
    getWeeklyDietTrend,
    getSmartInsights,
    getTodayAttendance,
  } = useApp();

  const [selectedChildId, setSelectedChildId] = useState<string>(visibleChildren[0]?.id ?? "");

  const [bulkMeal, setBulkMeal] = useState<MealType>("午餐");
  const [bulkFoodName, setBulkFoodName] = useState("");
  const [bulkFoodAmount, setBulkFoodAmount] = useState("1份");
  const [bulkFoodCategory, setBulkFoodCategory] = useState<FoodCategory>("主食");
  const [bulkFoods, setBulkFoods] = useState<FoodItem[]>([]);
  const [bulkIntake, setBulkIntake] = useState<IntakeLevel>("适中");
  const [bulkPreference, setBulkPreference] = useState<PreferenceStatus>("正常");
  const [bulkWaterMl, setBulkWaterMl] = useState("150");
  const [bulkAllergyReaction, setBulkAllergyReaction] = useState("");
  const [bulkExcludedChildIds, setBulkExcludedChildIds] = useState<string[]>([]);

  const resolvedSelectedChildId =
    visibleChildren.some((child) => child.id === selectedChildId) ? selectedChildId : (visibleChildren[0]?.id ?? "");

  const selectedChild = visibleChildren.find((child) => child.id === resolvedSelectedChildId) ?? null;
  const todayAttendance = getTodayAttendance();
  const attendanceMap = new Map(todayAttendance.map((item) => [item.childId, item]));

  const selectedChildMeals = useMemo(() => {
    if (!selectedChild) return {} as Partial<Record<MealType, MealRecord>>;
    return MEAL_TYPES.reduce<Partial<Record<MealType, MealRecord>>>((acc, meal) => {
      const record = mealRecords.find(
        (item) => item.childId === selectedChild.id && item.date === TODAY && item.meal === meal
      );
      if (record) acc[meal] = record;
      return acc;
    }, {});
  }, [mealRecords, selectedChild]);

  const overallScore = useMemo(() => {
    const scores = Object.values(selectedChildMeals).map((record) => record.nutritionScore);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }, [selectedChildMeals]);

  const weeklyTrend = getWeeklyDietTrend(selectedChild?.id);
  const childInsights = selectedChild
    ? getSmartInsights().filter((item) => !item.childId || item.childId === selectedChild.id)
    : [];

  const bulkPreview = useMemo(
    () =>
      previewBulkMealTemplate({
        foods: bulkFoods,
        excludedChildIds: bulkExcludedChildIds,
      }),
    [bulkExcludedChildIds, bulkFoods, previewBulkMealTemplate]
  );

  function saveMealRecord(meal: MealType, patch: Partial<MealRecord>) {
    if (!selectedChild) return;
    const existing = selectedChildMeals[meal];
    upsertMealRecord({
      childId: selectedChild.id,
      date: TODAY,
      meal,
      foods: patch.foods ?? existing?.foods ?? [],
      intakeLevel: patch.intakeLevel ?? existing?.intakeLevel ?? "适中",
      preference: patch.preference ?? existing?.preference ?? "正常",
      allergyReaction: patch.allergyReaction ?? existing?.allergyReaction ?? "",
      waterMl: patch.waterMl ?? existing?.waterMl ?? 120,
      recordedBy: currentUser.name,
      recordedByRole: currentUser.role,
    });
  }

  function addBulkFood() {
    if (!bulkFoodName.trim()) return;
    setBulkFoods((prev) => [
      ...prev,
      {
        id: `bulk-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        name: bulkFoodName.trim(),
        category: bulkFoodCategory,
        amount: bulkFoodAmount.trim() || "1份",
      },
    ]);
    setBulkFoodName("");
  }

  function applyBulkTemplate() {
    if (bulkFoods.length === 0 || presentChildren.length === 0) {
      toast.warning("请先添加至少一种食物，并确保有已出勤幼儿。", {
        description: "批量录入前需要先准备餐单并确认出勤名单。",
      });
      return;
    }

    const result = bulkApplyMealTemplate({
      date: TODAY,
      meal: bulkMeal,
      foods: bulkFoods,
      intakeLevel: bulkIntake,
      preference: bulkPreference,
      allergyReaction: bulkAllergyReaction,
      waterMl: Number(bulkWaterMl) || 0,
      excludedChildIds: bulkExcludedChildIds,
      recordedBy: currentUser.name,
      recordedByRole: currentUser.role,
    });

    toast.success("批量录入已完成", {
      description: `成功 ${result.applied.length} 人，拦截/排除 ${result.blocked.length} 人。`,
    });
  }

  function toggleExcludeChild(id: string) {
    setBulkExcludedChildIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-800">
          <Salad className="h-8 w-8 text-emerald-500" />
          饮食记录
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          流程已升级为：先批量录入出勤幼儿，再做例外排除与过敏拦截，最后对个别幼儿进行单独调整。
        </p>
        <div className="section-divider mt-5" />
      </div>

      <Card className="mb-6 border-emerald-100 bg-gradient-to-r from-emerald-50 to-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ChefHat className="h-5 w-5 text-emerald-600" />
            批量录入（含例外处理）
          </CardTitle>
          <CardDescription>
            当前有 {presentChildren.length} 位已出勤幼儿；可手动排除个别幼儿，并自动拦截与过敏词冲突的餐食。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-6">
            <Select value={bulkMeal} onValueChange={(value) => setBulkMeal(value as MealType)}>
              <SelectTrigger>
                <SelectValue placeholder="选择餐次" />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPES.map((meal) => (
                  <SelectItem key={meal} value={meal}>
                    {meal}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={bulkFoodName} onChange={(event) => setBulkFoodName(event.target.value)} placeholder="食物名称" />
            <Select value={bulkFoodCategory} onValueChange={(value) => setBulkFoodCategory(value as FoodCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="食物分类" />
              </SelectTrigger>
              <SelectContent>
                {FOOD_CATEGORY_OPTIONS.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={bulkFoodAmount} onChange={(event) => setBulkFoodAmount(event.target.value)} placeholder="摄入量" />
            <Button variant="outline" onClick={addBulkFood}>
              添加食物
            </Button>
            <Button onClick={applyBulkTemplate}>执行批量录入</Button>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Select value={bulkIntake} onValueChange={(value) => setBulkIntake(value as IntakeLevel)}>
              <SelectTrigger>
                <SelectValue placeholder="摄入量级别" />
              </SelectTrigger>
              <SelectContent>
                {INTAKE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={bulkPreference} onValueChange={(value) => setBulkPreference(value as PreferenceStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="偏好状态" />
              </SelectTrigger>
              <SelectContent>
                {PREFERENCE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={bulkWaterMl} onChange={(event) => setBulkWaterMl(event.target.value)} placeholder="饮水量 ml" />
            <Input value={bulkAllergyReaction} onChange={(event) => setBulkAllergyReaction(event.target.value)} placeholder="过敏反应（可留空）" />
          </div>

          <div className="flex flex-wrap gap-2">
            {bulkFoods.map((food, index) => (
              <span key={food.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
                {food.name} · {food.amount} · {food.category}
                <button onClick={() => setBulkFoods((prev) => prev.filter((_, i) => i !== index))}>
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_FOODS[bulkMeal].map((food) => (
              <button
                key={`${bulkMeal}-${food.name}`}
                onClick={() =>
                  setBulkFoods((prev) => [
                    ...prev,
                    {
                      id: `quick-${Date.now()}-${food.name}`,
                      name: food.name,
                      category: food.category,
                      amount: food.amount,
                    },
                  ])
                }
                className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50"
              >
                + {food.name}
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">例外处理（手动排除）</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {presentChildren.map((child) => {
                  const excluded = bulkExcludedChildIds.includes(child.id);
                  return (
                    <button
                      key={child.id}
                      onClick={() => toggleExcludeChild(child.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition",
                        excluded
                          ? "border-rose-200 bg-rose-50 text-rose-600"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      )}
                    >
                      {excluded ? "已排除" : "排除"} · {child.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">过敏自动拦截预览</p>
              <div className="mt-3 space-y-2 text-xs">
                {bulkPreview.map((item) => (
                  <div key={item.childId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-slate-600">{item.childName}</span>
                    {item.excluded ? (
                      <Badge variant="secondary">手动排除</Badge>
                    ) : item.blockedByAllergy ? (
                      <Badge variant="warning" className="gap-1">
                        <ShieldAlert className="h-3 w-3" />
                        过敏拦截
                      </Badge>
                    ) : (
                      <Badge variant="success">可录入</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 xl:flex-row">
        <aside className="w-full xl:w-80">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">选择幼儿（个别调整）</CardTitle>
              <CardDescription>批量后可在此对单个孩子做精细调整。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibleChildren.map((child) => {
                const attendance = attendanceMap.get(child.id);
                const isSelected = child.id === resolvedSelectedChildId;
                const score = mealRecords
                  .filter((record) => record.childId === child.id && record.date === TODAY)
                  .map((record) => record.nutritionScore);
                const avg = score.length > 0 ? Math.round(score.reduce((sum, item) => sum + item, 0) / score.length) : 0;
                return (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition",
                      isSelected ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-white hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{child.avatar}</span>
                        <div>
                          <p className="font-semibold text-slate-700">{child.name}</p>
                          <p className="text-xs text-slate-400">{getAgeText(child.birthDate)} · {child.className}</p>
                        </div>
                      </div>
                      <Badge variant={attendance?.isPresent ? "success" : "secondary"}>{attendance?.isPresent ? "出勤" : "缺勤"}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{getAgeBandFromBirthDate(child.birthDate)}</span>
                      <span>今日评分 {avg || "--"}</span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        <section className="flex-1 space-y-6">
          {selectedChild ? (
            <>
              <Card>
                <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-4xl">
                      {selectedChild.avatar}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedChild.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        出生于 {formatDisplayDate(selectedChild.birthDate)} · {getAgeText(selectedChild.birthDate)} · {getAgeBandFromBirthDate(selectedChild.birthDate)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">班级：{selectedChild.className}</Badge>
                        {selectedChild.allergies.length > 0 ? (
                          <Badge variant="warning">过敏：{selectedChild.allergies.join("、")}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-[220px] rounded-3xl bg-slate-50 p-4 text-right">
                    <p className="text-xs text-slate-400">今日综合营养评分</p>
                    <p className="mt-2 text-4xl font-bold text-slate-800">{overallScore || "--"}</p>
                    <Progress
                      value={overallScore}
                      className="mt-3 h-2"
                      indicatorClassName={overallScore >= 85 ? "bg-emerald-400" : overallScore >= 70 ? "bg-amber-400" : "bg-rose-400"}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-4">
                {MEAL_TYPES.map((meal) => (
                  <MealEditorCard
                    key={`${selectedChild.id}-${meal}`}
                    meal={meal}
                    record={selectedChildMeals[meal]}
                    onSave={(patch) => saveMealRecord(meal, patch)}
                  />
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>最近一周饮食趋势</CardTitle>
                    <CardDescription>可用于识别饮食单一、营养失衡与低饮水风险。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "均衡天数占比", value: `${weeklyTrend.balancedRate}%`, progress: weeklyTrend.balancedRate },
                      { label: "含蔬果天数", value: `${weeklyTrend.vegetableDays}天`, progress: Math.min(weeklyTrend.vegetableDays * 14, 100) },
                      { label: "含蛋白天数", value: `${weeklyTrend.proteinDays}天`, progress: Math.min(weeklyTrend.proteinDays * 14, 100) },
                      { label: "平均饮水量", value: `${weeklyTrend.hydrationAvg}ml`, progress: Math.min(Math.round(weeklyTrend.hydrationAvg / 3), 100) },
                      { label: "饮食单一天数", value: `${weeklyTrend.monotonyDays}天`, progress: Math.min(weeklyTrend.monotonyDays * 14, 100) },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="text-slate-500">{item.label}</span>
                          <span className="font-semibold text-slate-700">{item.value}</span>
                        </div>
                        <Progress value={item.progress} className="h-3" />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>系统建议</CardTitle>
                    <CardDescription>规则引擎先判定，再生成可解释建议。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {childInsights.slice(0, 4).map((insight) => (
                      <div key={insight.id} className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-700">{insight.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{insight.description}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Salad className="h-6 w-6" />}
              title="当前角色暂无可见幼儿"
              description="请切换到有数据的角色，或先补充幼儿档案后再录入饮食。"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function MealEditorCard({ meal, record, onSave }: { meal: MealType; record?: MealRecord; onSave: (patch: Partial<MealRecord>) => void }) {
  const [foodName, setFoodName] = useState("");
  const [foodAmount, setFoodAmount] = useState("1份");
  const [foodCategory, setFoodCategory] = useState<FoodCategory>("主食");
  const [intakeLevel, setIntakeLevel] = useState<IntakeLevel>(record?.intakeLevel ?? "适中");
  const [preference, setPreference] = useState<PreferenceStatus>(record?.preference ?? "正常");
  const [waterMl, setWaterMl] = useState(String(record?.waterMl ?? 120));
  const [allergyReaction, setAllergyReaction] = useState(record?.allergyReaction ?? "");

  const foods = record?.foods ?? [];
  const mealScore = calcNutritionScore(foods, Number(waterMl) || 0, preference);

  function addFood(item?: { name: string; category: FoodCategory; amount: string }) {
    const nextName = item?.name ?? foodName.trim();
    if (!nextName) return;

    const nextFoods = [
      ...foods,
      {
        id: `${meal}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        name: nextName,
        category: item?.category ?? foodCategory,
        amount: item?.amount ?? (foodAmount.trim() || "1份"),
      },
    ];

    onSave({ foods: nextFoods, intakeLevel, preference, allergyReaction, waterMl: Number(waterMl) || 0 });
    setFoodName("");
  }

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{meal}</CardTitle>
            <CardDescription>{foods.length > 0 ? `已记录 ${foods.length} 种食物` : "尚未录入"}</CardDescription>
          </div>
          <Badge variant={mealScore >= 85 ? "success" : mealScore >= 70 ? "warning" : "secondary"}>{mealScore || "--"}分</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {foods.length > 0 ? (
            foods.map((food, index) => (
              <span key={food.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {food.name} · {food.amount}
                <button
                  onClick={() =>
                    onSave({
                      foods: foods.filter((_, currentIndex) => currentIndex !== index),
                      intakeLevel,
                      preference,
                      allergyReaction,
                      waterMl: Number(waterMl) || 0,
                    })
                  }
                >
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              </span>
            ))
          ) : (
            <p className="text-xs text-slate-400">先添加食物后再保存。</p>
          )}
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <Input value={foodName} onChange={(event) => setFoodName(event.target.value)} placeholder="食物名称" />
          <Select value={foodCategory} onValueChange={(value) => setFoodCategory(value as FoodCategory)}>
            <SelectTrigger>
              <SelectValue placeholder="类别" />
            </SelectTrigger>
            <SelectContent>
              {FOOD_CATEGORY_OPTIONS.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input value={foodAmount} onChange={(event) => setFoodAmount(event.target.value)} placeholder="摄入量" />
            <Button size="icon" variant="outline" onClick={() => addFood()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_FOODS[meal].map((food) => (
            <button
              key={`${meal}-${food.name}`}
              onClick={() => addFood(food)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
            >
              + {food.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Select
            value={intakeLevel}
            onValueChange={(value) => {
              const next = value as IntakeLevel;
              setIntakeLevel(next);
              onSave({ foods, intakeLevel: next, preference, allergyReaction, waterMl: Number(waterMl) || 0 });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="摄入量级别" />
            </SelectTrigger>
            <SelectContent>
              {INTAKE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={preference}
            onValueChange={(value) => {
              const next = value as PreferenceStatus;
              setPreference(next);
              onSave({ foods, intakeLevel, preference: next, allergyReaction, waterMl: Number(waterMl) || 0 });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="偏好 / 拒食" />
            </SelectTrigger>
            <SelectContent>
              {PREFERENCE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={waterMl}
            onChange={(event) => {
              const next = event.target.value;
              setWaterMl(next);
              onSave({ foods, intakeLevel, preference, allergyReaction, waterMl: Number(next) || 0 });
            }}
            placeholder="饮水量 ml"
          />
          <Input
            value={allergyReaction}
            onChange={(event) => {
              const next = event.target.value;
              setAllergyReaction(next);
              onSave({ foods, intakeLevel, preference, allergyReaction: next, waterMl: Number(waterMl) || 0 });
            }}
            placeholder="过敏反应 / 特殊说明"
          />
        </div>

        {allergyReaction ? (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <p className="flex items-center gap-1 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              过敏观察已记录
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
