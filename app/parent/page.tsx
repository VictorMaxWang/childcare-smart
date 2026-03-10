"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, HeartHandshake, LineChart, MessageCircleHeart, CheckCircle, Goal } from "lucide-react";
import { formatDisplayDate, getAgeText, getAgeBandFromBirthDate, type CollaborationStatus, useApp } from "@/lib/store";
import type { AiSuggestionResponse, ChildSuggestionSnapshot, RuleFallbackItem } from "@/lib/ai/types";
import { buildFallbackSuggestion } from "@/lib/ai/fallback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getWeeklyTaskForChild } from "@/lib/mock/coparenting";

const FEEDBACK_STATUSES: CollaborationStatus[] = ["已知晓", "在家已配合", "今晚反馈"];

export default function ParentPage() {
  const {
    currentUser,
    getParentFeed,
    addGuardianFeedback,
    checkInTask,
    getTaskCheckIns,
    healthCheckRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
  } = useApp();
  const parentFeed = getParentFeed();

  const [selectedChildId, setSelectedChildId] = useState(parentFeed[0]?.child.id ?? "");
  const [feedbackStatus, setFeedbackStatus] = useState<CollaborationStatus>("已知晓");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestionResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const selectedFeed = useMemo(
    () => parentFeed.find((item) => item.child.id === selectedChildId) ?? parentFeed[0],
    [parentFeed, selectedChildId]
  );
  
  const todayStr = new Date().toISOString().split("T")[0];

  const currentTask = useMemo(() => {
    if (!selectedFeed) return null;
    const ageBand = getAgeBandFromBirthDate(selectedFeed.child.birthDate);
    return getWeeklyTaskForChild(selectedFeed.child.id, ageBand);
  }, [selectedFeed]);

  const taskCheckIns = getTaskCheckIns(selectedFeed?.child.id ?? "");
  const isTaskCheckedInToday = Boolean(currentTask && taskCheckIns.some(t => t.taskId === currentTask.id && t.date === todayStr));
  const weeklyCheckInCount = taskCheckIns.filter(t => t.taskId === currentTask?.id).length;

  const aiSnapshot = useMemo(() => {
    if (!selectedFeed) return null;

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const inLastSevenDays = (dateText?: string) => {
      if (!dateText) return false;
      const ts = Date.parse(dateText.split(" ")[0]);
      return !Number.isNaN(ts) && ts >= sevenDaysAgo.getTime() && ts <= now.getTime();
    };

    const childHealth = healthCheckRecords.filter((record) => {
      if (record.childId !== selectedFeed.child.id) return false;
      return inLastSevenDays(record.date);
    });

    const childMeals = mealRecords.filter((record) => {
      if (record.childId !== selectedFeed.child.id) return false;
      return inLastSevenDays(record.date);
    });

    const childGrowth = growthRecords.filter((record) => {
      if (record.childId !== selectedFeed.child.id) return false;
      return inLastSevenDays(record.createdAt);
    });

    const childFeedbacks = guardianFeedbacks.filter((record) => {
      if (record.childId !== selectedFeed.child.id) return false;
      return inLastSevenDays(record.date);
    });

    const avgTemp =
      childHealth.length > 0
        ? Math.round((childHealth.reduce((sum, item) => sum + item.temperature, 0) / childHealth.length) * 10) / 10
        : undefined;

    const categoryCounter = new Map<string, number>();
    childGrowth.forEach((record) => {
      categoryCounter.set(record.category, (categoryCounter.get(record.category) ?? 0) + 1);
    });

    const topCategories = Array.from(categoryCounter.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const statusCounts = childFeedbacks.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    const ruleFallback: RuleFallbackItem[] = selectedFeed.suggestions.map((item) => ({
      title: item.title,
      description: item.description,
      level: item.level,
      tags: item.tags,
    }));

    return {
      child: {
        id: selectedFeed.child.id,
        name: selectedFeed.child.name,
        ageBand: getAgeBandFromBirthDate(selectedFeed.child.birthDate),
        className: selectedFeed.child.className,
        allergies: selectedFeed.child.allergies,
        specialNotes: selectedFeed.child.specialNotes,
      },
      summary: {
        health: {
          abnormalCount: childHealth.filter((item) => item.isAbnormal).length,
          handMouthEyeAbnormalCount: childHealth.filter((item) => item.handMouthEye === "异常").length,
          avgTemperature: avgTemp,
          moodKeywords: Array.from(new Set(childHealth.map((item) => item.mood))).slice(0, 5),
        },
        meals: {
          recordCount: childMeals.length,
          hydrationAvg:
            childMeals.length > 0
              ? Math.round(childMeals.reduce((sum, item) => sum + (item.waterMl || 0), 0) / childMeals.length)
              : 0,
          balancedRate:
            childMeals.length > 0
              ? Math.round(
                  (childMeals.filter((item) => item.nutritionScore >= 75).length / childMeals.length) * 100
                )
              : 0,
          monotonyDays: Math.max(0, 7 - new Set(childMeals.map((item) => item.date)).size),
          allergyRiskCount: childMeals.filter((record) => Boolean(record.allergyReaction)).length,
        },
        growth: {
          recordCount: childGrowth.length,
          attentionCount: childGrowth.filter((record) => record.needsAttention).length,
          pendingReviewCount: childGrowth.filter((record) => record.reviewStatus === "待复查").length,
          topCategories,
        },
        feedback: {
          count: childFeedbacks.length,
          statusCounts,
          keywords: childFeedbacks.map((item) => item.content).filter(Boolean).slice(0, 5),
        },
      },
      ruleFallback,
    } satisfies ChildSuggestionSnapshot;
  }, [selectedFeed, healthCheckRecords, mealRecords, growthRecords, guardianFeedbacks]);

  useEffect(() => {
    if (!aiSnapshot) {
      setAiSuggestion(null);
      return;
    }

    const fallback = buildFallbackSuggestion(aiSnapshot.ruleFallback);
    const controller = new AbortController();
    let cancelled = false;

    async function fetchAiSuggestion() {
      setAiLoading(true);
      try {
        const response = await fetch("/api/ai/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: aiSnapshot }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setAiSuggestion(fallback);
          return;
        }

        const data = (await response.json()) as AiSuggestionResponse;
        if (!cancelled) {
          setAiSuggestion(data);
        }
      } catch {
        if (!cancelled) {
          setAiSuggestion(fallback);
        }
      } finally {
        if (!cancelled) {
          setAiLoading(false);
        }
      }
    }

    fetchAiSuggestion();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [aiSnapshot]);

  function submitFeedback() {
    if (!selectedFeed || !feedbackContent.trim()) return;

    addGuardianFeedback({
      childId: selectedFeed.child.id,
      date: new Date().toISOString().split("T")[0],
      status: feedbackStatus,
      content: feedbackContent.trim(),
    });

    setFeedbackMessage("反馈已提交，教师和机构管理员可实时查看。");
    setFeedbackContent("");
    setFeedbackStatus("已知晓");
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-800">
            <HeartHandshake className="h-8 w-8 text-rose-500" />
            家长端同步查看
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            家长端已从“只看”升级为“可反馈”：可提交已知晓、在家已配合、今晚反馈，形成家园闭环。
            当前为 {currentUser.role} 视角预览。
          </p>
        </div>

        {parentFeed.length > 0 ? (
          <div className="w-full lg:w-72">
            <Select value={selectedFeed?.child.id ?? ""} onValueChange={setSelectedChildId}>
              <SelectTrigger>
                <SelectValue placeholder="选择孩子" />
              </SelectTrigger>
              <SelectContent>
                {parentFeed.map((feed) => (
                  <SelectItem key={feed.child.id} value={feed.child.id}>
                    {feed.child.name} · {getAgeText(feed.child.birthDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {!selectedFeed ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 py-20 text-center text-slate-500">
          当前没有可展示的家长端数据。
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="border-rose-100 bg-gradient-to-r from-rose-50 to-white">
            <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-4xl shadow-sm">
                  {selectedFeed.child.avatar}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">{selectedFeed.child.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    出生日期：{formatDisplayDate(selectedFeed.child.birthDate)} · {getAgeText(selectedFeed.child.birthDate)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="secondary">班级：{selectedFeed.child.className}</Badge>
                    <Badge variant="info">今日饮食 {selectedFeed.todayMeals.length} 条</Badge>
                    <Badge
                      variant={selectedFeed.todayGrowth.some((record) => record.needsAttention) ? "warning" : "success"}
                    >
                      今日成长记录 {selectedFeed.todayGrowth.length} 条
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white/80 p-4 text-sm text-slate-600 shadow-sm lg:w-96">
                <p className="font-semibold text-slate-700">家长反馈动作</p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {FEEDBACK_STATUSES.map((status) => (
                    <Button
                      key={status}
                      variant={feedbackStatus === status ? "default" : "outline"}
                      onClick={() => setFeedbackStatus(status)}
                      className="text-xs"
                    >
                      {status}
                    </Button>
                  ))}
                </div>
                <Textarea
                  className="mt-3 min-h-[90px]"
                  value={feedbackContent}
                  onChange={(event) => setFeedbackContent(event.target.value)}
                  placeholder="补充家庭执行情况，例如：今晚提前半小时睡前流程、已按建议加蔬菜加餐等。"
                />
                <Button className="mt-3 w-full" onClick={submitFeedback}>
                  提交反馈
                </Button>
                {feedbackMessage ? <p className="mt-2 text-xs text-emerald-600">{feedbackMessage}</p> : null}
              </div>
            </CardContent>
          </Card>

          {currentTask && (
            <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-white overflow-hidden relative">
              <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-indigo-50/80 to-transparent pointer-events-none" />
              <CardHeader className="relative z-10 pb-2">
                <CardTitle className="flex items-center justify-between text-lg text-indigo-900">
                  <div className="flex items-center gap-2">
                    <Goal className="h-5 w-5 text-indigo-500" />
                    本周家园共育任务
                  </div>
                  {isTaskCheckedInToday && (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none font-medium text-xs">
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      今日已打卡
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-indigo-700/70">每周更新适合相应月龄段的亲子互动，陪伴成长每一天。</CardDescription>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="flex flex-col md:flex-row gap-5 items-start">
                  <div className="flex-1 bg-white rounded-2xl p-5 border border-indigo-50 shadow-sm">
                    <h3 className="font-bold text-lg text-slate-800 tracking-tight">{currentTask.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{currentTask.description}</p>
                    <div className="mt-4 flex gap-2">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none">
                        领域：{currentTask.tag}
                      </Badge>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none">
                        时长：{currentTask.durationText}
                      </Badge>
                    </div>
                  </div>
                  <div className="w-full md:w-64 bg-white rounded-2xl p-5 border border-indigo-50 shadow-sm flex flex-col justify-center items-center h-full text-center">
                    <div className="text-3xl font-black text-indigo-600 mb-1">{weeklyCheckInCount}<span className="text-sm font-normal text-slate-400 ml-1">天</span></div>
                    <p className="text-xs font-medium text-slate-500 mb-4">本周已坚持打卡</p>
                    <Button 
                      className={`w-full rounded-xl font-medium transition-all ${isTaskCheckedInToday ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'}`}
                      disabled={isTaskCheckedInToday}
                      onClick={() => checkInTask(selectedFeed.child.id, currentTask.id, todayStr)}
                    >
                      {isTaskCheckedInToday ? "已完成今日打卡" : "完成今日任务打卡"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageCircleHeart className="h-5 w-5 text-indigo-500" />
                  今日成长记录
                </CardTitle>
                <CardDescription>同步教师 / 家长双方观察，避免信息断层。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedFeed.todayGrowth.length > 0 ? (
                  selectedFeed.todayGrowth.map((record) => (
                    <div key={record.id} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant={record.needsAttention ? "warning" : "secondary"}>{record.category}</Badge>
                        <span className="text-xs text-slate-400">{record.recorderRole}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{record.description}</p>
                      <p className="mt-2 text-xs text-slate-400">{record.createdAt}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">今日暂无成长记录。</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BellRing className="h-5 w-5 text-emerald-500" />
                  今日饮食记录
                </CardTitle>
                <CardDescription>早餐 / 午餐 / 晚餐 / 加餐均可同步给家长查看。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedFeed.todayMeals.length > 0 ? (
                  selectedFeed.todayMeals.map((record) => (
                    <div key={record.id} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-700">{record.meal}</p>
                        <Badge
                          variant={
                            record.nutritionScore >= 85
                              ? "success"
                              : record.nutritionScore >= 70
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {record.nutritionScore}分
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {record.foods.map((food) => `${food.name}(${food.amount})`).join("、")}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        摄入：{record.intakeLevel} · 偏好：{record.preference} · 饮水：{record.waterMl}ml
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">今日暂无饮食记录。</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <LineChart className="h-5 w-5 text-amber-500" />
                  本周变化趋势
                </CardTitle>
                <CardDescription>帮助家长快速理解是否存在饮食单一或饮水偏低问题。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-600">
                <TrendItem label="均衡天数占比" value={`${selectedFeed.weeklyTrend.balancedRate}%`} />
                <TrendItem label="含蔬果天数" value={`${selectedFeed.weeklyTrend.vegetableDays}天`} />
                <TrendItem label="含蛋白天数" value={`${selectedFeed.weeklyTrend.proteinDays}天`} />
                <TrendItem label="平均饮水量" value={`${selectedFeed.weeklyTrend.hydrationAvg}ml`} />
                <TrendItem label="饮食单一天数" value={`${selectedFeed.weeklyTrend.monotonyDays}天`} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>系统建议</CardTitle>
              <CardDescription>
                AI 建议骨架版输出结构化建议，若 AI 不可用将自动回退到规则建议。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {aiLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={`skeleton-${i}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm skeleton-pulse">
                    <div className="mb-3 h-5 w-20 rounded-full bg-slate-100" />
                    <div className="h-4 w-3/4 rounded bg-slate-100" />
                    <div className="mt-3 space-y-2">
                      <div className="h-3 w-full rounded bg-slate-50" />
                      <div className="h-3 w-5/6 rounded bg-slate-50" />
                    </div>
                  </div>
                ))
              ) : (
              buildSuggestionCards(aiSuggestion, selectedFeed.suggestions).map((insight) => (
                <div key={insight.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={insight.level === "warning" ? "warning" : insight.level === "success" ? "success" : "info"}>
                      {insight.level === "warning" ? "需关注" : insight.level === "success" ? "已准备好" : "建议"}
                    </Badge>
                    {aiSuggestion?.source === "fallback" ? <Badge variant="info">规则兜底</Badge> : null}
                    {aiSuggestion?.source === "ai" ? <Badge variant="success">AI 建议</Badge> : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{insight.title}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{insight.description}</p>
                </div>
              ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>今日反馈时间线</CardTitle>
              <CardDescription>教师、家长、机构管理员可在同一时间线查看反馈闭环进度。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedFeed.feedbacks.length > 0 ? (
                selectedFeed.feedbacks.map((feedback) => (
                  <div key={feedback.id} className="rounded-2xl border border-slate-100 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <Badge variant={feedback.status === "今晚反馈" ? "warning" : "info"}>{feedback.status}</Badge>
                      <span className="text-xs text-slate-400">{feedback.createdByRole} · {feedback.createdBy}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{feedback.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">今日尚无家长反馈，建议先提交“已知晓”。</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function TrendItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function buildSuggestionCards(
  aiSuggestion: AiSuggestionResponse | null,
  fallbackInsights: Array<{ id: string; title: string; description: string; level: "success" | "warning" | "info" }>
) {
  if (!aiSuggestion) {
    return fallbackInsights;
  }

  const cards: Array<{ id: string; title: string; description: string; level: "success" | "warning" | "info" }> = [];

  for (const item of aiSuggestion.concerns) {
    cards.push({
      id: `ai-concern-${item}`,
      title: item,
      description: aiSuggestion.actions[0] || aiSuggestion.disclaimer,
      level: "warning",
    });
  }

  for (const item of aiSuggestion.highlights) {
    cards.push({
      id: `ai-highlight-${item}`,
      title: item,
      description: aiSuggestion.actions[1] || aiSuggestion.disclaimer,
      level: "info",
    });
  }

  if (cards.length === 0) {
    return fallbackInsights;
  }

  cards.push({
    id: "ai-disclaimer",
    title: `风险等级：${aiSuggestion.riskLevel}`,
    description: aiSuggestion.disclaimer,
    level: "success",
  });

  return cards.slice(0, 6);
}
