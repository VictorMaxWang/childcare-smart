"use client";

import { toPng } from "html-to-image";
import ReactMarkdown from "react-markdown";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, HeartHandshake, LineChart as LineChartIcon, MessageCircleHeart, CheckCircle, Goal } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDisplayDate, getAgeText, getAgeBandFromBirthDate, type CollaborationStatus, useApp } from "@/lib/store";
import type {
  AiFollowUpMessage,
  AiFollowUpResponse,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  RuleFallbackItem,
} from "@/lib/ai/types";
import { buildFallbackSuggestion } from "@/lib/ai/fallback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import EmptyState from "@/components/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getWeeklyTaskForChild } from "@/lib/mock/coparenting";
import { toast } from "sonner";

const FEEDBACK_STATUSES: CollaborationStatus[] = ["已知晓", "在家已配合", "今晚反馈"];
const FOLLOW_UP_HISTORY_LIMIT = 3;

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
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestionResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const [aiRefreshNonce, setAiRefreshNonce] = useState(0);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState("");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpTurnsMap, setFollowUpTurnsMap] = useState<Record<string, FollowUpTurn[]>>({});
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const aiSuggestionCacheRef = useRef<Map<string, AiSuggestionResponse>>(new Map());
  const followUpCacheRef = useRef<Map<string, AiFollowUpResponse>>(new Map());

  const followUpTurns = useMemo(() => {
    return selectedSuggestionId ? (followUpTurnsMap[selectedSuggestionId] ?? []) : [];
  }, [followUpTurnsMap, selectedSuggestionId]);

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

  const weeklyTrendChartData = useMemo(() => {
    if (!selectedFeed) return [];

    const dateList = buildRecentDateRange(7);
    return dateList.map((date) => {
      const records = mealRecords.filter(
        (record) => record.childId === selectedFeed.child.id && record.date === date
      );
      const nutritionScore =
        records.length > 0
          ? Math.round(records.reduce((sum, item) => sum + item.nutritionScore, 0) / records.length)
          : 0;
      const waterMl = records.reduce((sum, item) => sum + item.waterMl, 0);
      const balancedMeals = records.filter((item) => item.nutritionScore >= 75).length;
      const balancedRate = records.length > 0 ? Math.round((balancedMeals / records.length) * 100) : 0;

      return {
        date,
        label: formatShortDate(date),
        nutritionScore,
        waterMl,
        balancedRate,
      };
    });
  }, [mealRecords, selectedFeed]);

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

    const recentHealth = childHealth
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
      .map((record) => ({
        date: record.date,
        temperature: record.temperature,
        mood: record.mood,
        handMouthEye: record.handMouthEye,
        isAbnormal: record.isAbnormal,
        remark: record.remark,
      }));

    const recentMeals = childMeals
      .slice()
      .sort((a, b) => `${b.date}-${b.meal}`.localeCompare(`${a.date}-${a.meal}`))
      .slice(0, 5)
      .map((record) => ({
        date: record.date,
        meal: record.meal,
        foods: record.foods.map((food) => `${food.name}(${food.amount})`),
        waterMl: record.waterMl,
        preference: record.preference,
        allergyReaction: record.allergyReaction,
      }));

    const recentGrowth = childGrowth
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((record) => ({
        createdAt: record.createdAt,
        category: record.category,
        description: record.description,
        needsAttention: record.needsAttention,
        followUpAction: record.followUpAction,
        reviewStatus: record.reviewStatus,
      }));

    const recentFeedback = childFeedbacks
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
      .map((record) => ({
        date: record.date,
        status: record.status,
        content: record.content,
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
      recentDetails: {
        health: recentHealth,
        meals: recentMeals,
        growth: recentGrowth,
        feedback: recentFeedback,
      },
      ruleFallback,
    } satisfies ChildSuggestionSnapshot;
  }, [selectedFeed, healthCheckRecords, mealRecords, growthRecords, guardianFeedbacks]);

  const aiSnapshotKey = useMemo(() => {
    return aiSnapshot ? `${JSON.stringify(aiSnapshot)}::${aiRefreshNonce}` : "";
  }, [aiSnapshot, aiRefreshNonce]);

  const suggestionCards = useMemo(
    () => buildSuggestionCards(aiSuggestion, selectedFeed?.suggestions ?? []),
    [aiSuggestion, selectedFeed]
  );

  const selectedSuggestion = useMemo(
    () => suggestionCards.find((item) => item.id === selectedSuggestionId) ?? null,
    [selectedSuggestionId, suggestionCards]
  );

  const followUpHistoryMessages = useMemo(
    () =>
      followUpTurns.flatMap<AiFollowUpMessage>((turn) => [
        { role: "user", content: turn.question },
        { role: "assistant", content: turn.response.answer },
      ]),
    [followUpTurns]
  );

  const latestFollowUpAnswer = followUpTurns.at(-1)?.response ?? null;

  useEffect(() => {
    if (!aiSnapshotKey || !aiSnapshot) {
      setAiSuggestion(null);
      setAiLoading(false);
      return;
    }

    const cached = aiSuggestionCacheRef.current.get(aiSnapshotKey);
    if (cached) {
      setAiSuggestion(cached);
      setAiLoading(false);
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
          if (!cancelled) {
            aiSuggestionCacheRef.current.set(aiSnapshotKey, fallback);
            setAiSuggestion(fallback);
            toast.warning("AI 建议暂时不可用", {
              description: "已切换为规则引擎建议，当前业务展示不受影响。",
            });
          }
          return;
        }

        const data = (await response.json()) as AiSuggestionResponse;
        if (!cancelled) {
          aiSuggestionCacheRef.current.set(aiSnapshotKey, data);
          setAiSuggestion(data);
          if (data.source === "fallback") {
            toast.warning("AI 建议已回退为规则模式", {
              description: "当前显示的是规则引擎生成的建议，可稍后手动刷新重试。",
            });
          }
        }
      } catch {
        if (!cancelled) {
          aiSuggestionCacheRef.current.set(aiSnapshotKey, fallback);
          setAiSuggestion(fallback);
          toast.warning("AI 建议请求失败", {
            description: "已自动回退为规则建议，请检查网络后稍后重试。",
          });
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
  }, [aiSnapshotKey, aiSnapshot]);

  function refreshAiSuggestion() {
    if (!aiSnapshot) return;
    aiSuggestionCacheRef.current.delete(aiSnapshotKey);
    setAiSuggestion(null);
    setAiRefreshNonce((prev) => prev + 1);
    setFollowUpTurnsMap({});
  }

  useEffect(() => {
    const firstActionableSuggestion = suggestionCards.find((item) => item.followUpEnabled);
    if (!firstActionableSuggestion) {
        setSelectedSuggestionId("");
        setFollowUpQuestion("");
        return;
      }

    const hasCurrent = suggestionCards.some((item) => item.id === selectedSuggestionId && item.followUpEnabled);
    if (!hasCurrent) {
        setSelectedSuggestionId(firstActionableSuggestion.id);
        const existing = followUpTurnsMap[firstActionableSuggestion.id] || [];
        setFollowUpQuestion(existing.length === 0 ? buildDefaultFollowUpQuestion(firstActionableSuggestion.title) : "");
      }
  }, [followUpTurnsMap, selectedSuggestionId, suggestionCards]);

  function selectSuggestionForFollowUp(card: SuggestionCard) {
      if (!card.followUpEnabled) return;
      setSelectedSuggestionId(card.id);
      const existing = followUpTurnsMap[card.id] || [];
      if (existing.length === 0) {
        setFollowUpQuestion(buildDefaultFollowUpQuestion(card.title));
      } else {
        setFollowUpQuestion("");
      }
    }

  async function submitFollowUp() {
    if (!aiSnapshot || !selectedSuggestion || !followUpQuestion.trim()) {
      toast.warning("请先选择建议并填写追问问题。", {
        description: "例如：这条建议今天园内应该怎么执行，家里晚上怎么配合？",
      });
      return;
    }

    const historyKey = followUpTurns.map((turn) => `${turn.question}::${turn.response.answer}`).join("||");
    const cacheKey = `${aiSnapshotKey}::${selectedSuggestion.id}::${historyKey}::${followUpQuestion.trim()}`;
    const cached = followUpCacheRef.current.get(cacheKey);
    if (cached) {
      setFollowUpTurnsMap((prevMap) => {
          const prevList = prevMap[selectedSuggestion.id] || [];
          return {
            ...prevMap,
            [selectedSuggestion.id]: [...prevList, { id: `${selectedSuggestion.id}-${Date.now()}`, question: followUpQuestion.trim(), response: cached }].slice(-FOLLOW_UP_HISTORY_LIMIT)
          };
        });
      setFollowUpQuestion("");
      return;
    }

    const currentQuestion = followUpQuestion.trim();
    setFollowUpLoading(true);
    try {
      const response = await fetch("/api/ai/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: aiSnapshot,
          suggestionTitle: selectedSuggestion.title,
          suggestionDescription: selectedSuggestion.description,
          question: currentQuestion,
          history: followUpHistoryMessages,
        }),
      });

      if (!response.ok) {
        throw new Error("follow-up request failed");
      }

      const data = (await response.json()) as AiFollowUpResponse;
      followUpCacheRef.current.set(cacheKey, data);
      setFollowUpTurnsMap((prevMap) => {
          const prevList = prevMap[selectedSuggestion.id] || [];
          return {
            ...prevMap,
            [selectedSuggestion.id]: [...prevList, { id: `${selectedSuggestion.id}-${Date.now()}`, question: currentQuestion, response: data }].slice(-FOLLOW_UP_HISTORY_LIMIT)
          };
        });
      setFollowUpQuestion("");
    } catch {
      toast.error("AI 追问失败", {
        description: "请稍后重试，系统会继续保留当前建议内容。",
      });
    } finally {
      setFollowUpLoading(false);
    }
  }



  async function exportReport() {
    if (exportingReport) return;
    const el = document.getElementById("ai-report-card");
    if (!el) {
      toast.error("导出失败", { description: "找不到报告内容，请先生成 AI 建议" });
      return;
    }
    setExportingReport(true);
    try {
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `${selectedFeed?.child.name ?? "child"}-AI健康报告.png`;
      link.href = dataUrl;
      link.click();
      toast.success("导出成功", { description: "周报长图已下载到本地" });
    } catch (err) {
      console.error("[ExportReport]", err);
      toast.error("导出失败", { description: "生成图片时发生错误, 请稍后重试" });
    } finally {
      setExportingReport(false);
    }
  }

  function submitFeedback() {
    if (!selectedFeed || !feedbackContent.trim()) {
      toast.warning("请先填写反馈内容。", {
        description: "家园反馈需要补充具体执行情况后再提交。",
      });
      return;
    }

    addGuardianFeedback({
      childId: selectedFeed.child.id,
      date: new Date().toISOString().split("T")[0],
      status: feedbackStatus,
      content: feedbackContent.trim(),
    });

    toast.success("反馈已提交", {
      description: "教师和机构管理员已可实时查看这条家园反馈。",
    });
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
          <div className="section-divider mt-5" />
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
        <EmptyState
          icon={<HeartHandshake className="h-6 w-6" />}
          title="当前没有可展示的家长端数据"
          description="请先给当前家长账号绑定幼儿，或补充家园共育记录后再查看。"
        />
      ) : (
        <div className="space-y-6">
          <Card className="border-rose-100 bg-linear-to-r from-rose-50 to-white">
            <CardContent className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-4xl shadow-sm" role="img" aria-label={`${selectedFeed.child.name} 的头像`}>
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
                <fieldset className="mt-3 grid gap-2 md:grid-cols-3">
                  <legend className="sr-only">反馈状态选择</legend>
                  {FEEDBACK_STATUSES.map((status) => (
                    <Button
                      key={status}
                      variant={feedbackStatus === status ? "default" : "outline"}
                      onClick={() => setFeedbackStatus(status)}
                      className="text-xs"
                      aria-pressed={feedbackStatus === status}
                    >
                      {status}
                    </Button>
                  ))}
                </fieldset>
                <label htmlFor="parent-feedback-content" className="sr-only">家长反馈内容</label>
                <Textarea
                  id="parent-feedback-content"
                  className="mt-3 min-h-22.5"
                  value={feedbackContent}
                  onChange={(event) => setFeedbackContent(event.target.value)}
                  placeholder="补充家庭执行情况，例如：今晚提前半小时睡前流程、已按建议加蔬菜加餐等。"
                />
                <Button className="mt-3 w-full" onClick={submitFeedback}>
                  提交反馈
                </Button>
              </div>
            </CardContent>
          </Card>

          {currentTask && (
            <Card className="border-indigo-100 bg-linear-to-r from-indigo-50/50 to-white overflow-hidden relative">
              <div className="absolute right-0 top-0 h-full w-1/3 bg-linear-to-l from-indigo-50/80 to-transparent pointer-events-none" />
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
                  <EmptyState
                    icon={<MessageCircleHeart className="h-5 w-5" />}
                    title="今日暂无成长记录"
                    description="教师与家长今日还没有新增成长观察，后续会自动同步到这里。"
                  />
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
                  <EmptyState
                    icon={<BellRing className="h-5 w-5" />}
                    title="今日暂无饮食记录"
                    description="园内尚未同步今天的用餐数据，稍后刷新即可查看。"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <LineChartIcon className="h-5 w-5 text-amber-500" />
                  本周变化趋势
                </CardTitle>
                <CardDescription>帮助家长快速理解是否存在饮食单一或饮水偏低问题。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-600">
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyTrendChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
                      <YAxis yAxisId="score" tick={{ fill: "#64748b", fontSize: 12 }} domain={[0, 100]} />
                      <YAxis yAxisId="water" orientation="right" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                      <Legend />
                      <Line
                        yAxisId="score"
                        type="monotone"
                        dataKey="nutritionScore"
                        name="营养评分"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        yAxisId="score"
                        type="monotone"
                        dataKey="balancedRate"
                        name="均衡率"
                        stroke="#6366f1"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3 }}
                      />
                      <Line
                        yAxisId="water"
                        type="monotone"
                        dataKey="waterMl"
                        name="饮水量"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <TrendItem label="均衡天数占比" value={`${selectedFeed.weeklyTrend.balancedRate}%`} />
                  <TrendItem label="含蔬果天数" value={`${selectedFeed.weeklyTrend.vegetableDays}天`} />
                  <TrendItem label="含蛋白天数" value={`${selectedFeed.weeklyTrend.proteinDays}天`} />
                  <TrendItem label="平均饮水量" value={`${selectedFeed.weeklyTrend.hydrationAvg}ml`} />
                  <TrendItem label="饮食单一天数" value={`${selectedFeed.weeklyTrend.monotonyDays}天`} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card id="ai-report-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                系统建议
                {aiSuggestion?.source === "ai" ? <Badge variant="success">AI 建议</Badge> : null}
                {aiSuggestion?.source === "fallback" ? <Badge variant="info">规则兜底</Badge> : null}
                {aiSuggestion?.model ? <Badge variant="secondary">模型：{aiSuggestion.model}</Badge> : null}
                {aiSuggestion?.trendPrediction ? (
                  <Badge variant="secondary">趋势：{getTrendLabel(aiSuggestion.trendPrediction)}</Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                AI 建议输出结构化建议；若 AI 不可用将自动回退到规则建议。当前会缓存同一份结果，避免重复请求。
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="mb-4 flex items-center justify-end gap-3">
                  <Button variant="outline" size="sm" className="hidden lg:flex" onClick={exportReport} disabled={aiLoading || !aiSuggestion || exportingReport}>
                    {exportingReport ? "导出中..." : "导出长图(推荐)"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={refreshAiSuggestion} disabled={aiLoading || !aiSnapshot}>
                    {aiLoading ? "刷新中..." : "刷新 AI 建议"}
                  </Button>
                </div>
              {!aiLoading && aiSuggestion?.summary ? (
                <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-7 text-slate-700">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-indigo-500">AI 总结</p>
                  <p>{aiSuggestion.summary}</p>
                </div>
              ) : null}
              {!aiLoading && (aiSuggestion?.actionPlan || aiSuggestion?.actions?.length) ? (
                <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">详细个性化方案</p>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <PlanSection
                      title="今天园内"
                      accentClassName="bg-emerald-100 text-emerald-700"
                      items={
                        aiSuggestion.actionPlan?.schoolActions?.length
                          ? aiSuggestion.actionPlan.schoolActions
                          : aiSuggestion.actions.slice(0, 2)
                      }
                    />
                    <PlanSection
                      title="今晚家庭"
                      accentClassName="bg-amber-100 text-amber-700"
                      items={
                        aiSuggestion.actionPlan?.familyActions?.length
                          ? aiSuggestion.actionPlan.familyActions
                          : aiSuggestion.actions.slice(2, 4)
                      }
                    />
                    <PlanSection
                      title="48小时内复查"
                      accentClassName="bg-indigo-100 text-indigo-700"
                      items={
                        aiSuggestion.actionPlan?.reviewActions?.length
                          ? aiSuggestion.actionPlan.reviewActions
                          : aiSuggestion.actions.slice(4, 5)
                      }
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
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
                <button
                  key={insight.id}
                  type="button"
                  onClick={() => selectSuggestionForFollowUp(insight)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    selectedSuggestionId === insight.id && insight.followUpEnabled
                      ? "border-indigo-300 ring-2 ring-indigo-100"
                      : "border-slate-100"
                  } ${insight.followUpEnabled ? "cursor-pointer" : "cursor-default"}`}
                  disabled={!insight.followUpEnabled}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={insight.level === "warning" ? "warning" : insight.level === "success" ? "success" : "info"}>
                      {insight.level === "warning" ? "需关注" : insight.level === "success" ? "已准备好" : "建议"}
                    </Badge>
                    {insight.followUpEnabled ? <Badge variant="secondary">可追问</Badge> : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{insight.title}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{insight.description}</p>
                </button>
              ))
              )}
            </CardContent>
            {selectedSuggestion?.followUpEnabled ? (
              <CardContent className="pt-0">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="lg:max-w-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-500">AI 继续追问</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">当前建议：{selectedSuggestion.title}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{selectedSuggestion.description}</p>
                      <p className="mt-3 text-xs text-slate-400">将保留最近 3 轮问答，便于连续追问。</p>
                    </div>
                    <div className="w-full lg:max-w-2xl">
                      {followUpTurns.length > 0 ? (
                        <div className="mb-3 space-y-3 rounded-2xl border border-white/80 bg-white p-3 shadow-sm">
                          {followUpTurns.map((turn, index) => (
                            <div key={turn.id} className="space-y-2">
                              <div className="flex justify-end">
                                <div className="max-w-[85%] rounded-2xl bg-indigo-600 px-4 py-3 text-sm leading-6 text-white">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-100">第 {index + 1} 轮提问</p>
                                  <p className="mt-1">{turn.question}</p>
                                </div>
                              </div>
                              <div className="flex justify-start">
                                <div className="max-w-[90%] rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">AI 回答</p>
                                  <div className="mt-1 prose prose-sm prose-slate max-w-none"><ReactMarkdown>{turn.response.answer}</ReactMarkdown></div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <label htmlFor="parent-follow-up-question" className="sr-only">继续追问输入框</label>
                      <Textarea
                        id="parent-follow-up-question"
                        value={followUpQuestion}
                        onChange={(event) => setFollowUpQuestion(event.target.value)}
                        className="min-h-24 bg-white"
                        placeholder={
                          followUpTurns.length > 0
                            ? "继续追问，例如：如果今晚还是不配合，明天园内要怎么调整？"
                            : "例如：这条建议今天园内怎么做，今晚家庭怎么配合，多久复查看变化？"
                        }
                      />
                      <div className="mt-3 flex justify-end">
                        <Button onClick={submitFollowUp} disabled={followUpLoading || !followUpQuestion.trim()}>
                          {followUpLoading ? "追问中..." : "发送追问"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {latestFollowUpAnswer ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
                      <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-500">详细解释</p>
                        <div className="mt-3 prose prose-sm prose-slate max-w-none"><ReactMarkdown>{latestFollowUpAnswer.answer}</ReactMarkdown></div>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
                        <p className="text-sm font-semibold text-slate-800">观察重点</p>
                        <div className="mt-3 space-y-3">
                          {latestFollowUpAnswer.keyPoints.map((item, index) => (
                            <div key={`key-point-${index}`} className="flex items-start gap-3">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                                {index + 1}
                              </div>
                              <p className="text-sm leading-6 text-slate-600">{item}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white p-4 shadow-sm">
                        <p className="text-sm font-semibold text-slate-800">建议动作</p>
                        <div className="mt-3 space-y-3">
                          {latestFollowUpAnswer.nextSteps.map((item, index) => (
                            <div key={`next-step-${index}`} className="flex items-start gap-3">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                                {index + 1}
                              </div>
                              <p className="text-sm leading-6 text-slate-600">{item}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-4 text-xs leading-5 text-slate-400">{latestFollowUpAnswer.disclaimer}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            ) : null}
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

function PlanSection({
  title,
  items,
  accentClassName,
}: {
  title: string;
  items: string[];
  accentClassName: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${accentClassName}`}>
        {title}
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${title}-${item}-${index}`} className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {index + 1}
            </div>
            <p className="text-sm leading-6 text-slate-600">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type SuggestionCard = {
  id: string;
  title: string;
  description: string;
  level: "success" | "warning" | "info";
  followUpEnabled?: boolean;
};

type FollowUpTurn = {
  id: string;
  question: string;
  response: AiFollowUpResponse;
};

function buildSuggestionCards(
  aiSuggestion: AiSuggestionResponse | null,
  fallbackInsights: Array<{ id: string; title: string; description: string; level: "success" | "warning" | "info" }>
) {
  if (!aiSuggestion) {
    return fallbackInsights.map((item) => ({ ...item, followUpEnabled: true }));
  }

  const cards: SuggestionCard[] = [];

  for (const [index, item] of aiSuggestion.concerns.entries()) {
    cards.push({
      id: `ai-concern-${item}`,
      title: item,
      description: aiSuggestion.actions[index] || aiSuggestion.disclaimer,
      level: "warning",
      followUpEnabled: true,
    });
  }

  for (const [index, item] of aiSuggestion.highlights.entries()) {
    cards.push({
      id: `ai-highlight-${item}`,
      title: item,
      description: aiSuggestion.actions[aiSuggestion.concerns.length + index] || aiSuggestion.disclaimer,
      level: "info",
      followUpEnabled: true,
    });
  }

  if (cards.length === 0) {
    return fallbackInsights.map((item) => ({ ...item, followUpEnabled: true }));
  }

  cards.push({
    id: "ai-disclaimer",
    title: `风险等级：${aiSuggestion.riskLevel}`,
    description: aiSuggestion.disclaimer,
    level: "success",
    followUpEnabled: false,
  });

  return cards.slice(0, 6);
}

function buildDefaultFollowUpQuestion(title: string) {
  return `关于“${title}”，今天园内具体怎么做，今晚家庭怎么配合，48小时内重点观察什么？`;
}

function getTrendLabel(value: "up" | "stable" | "down") {
  if (value === "up") return "风险上升";
  if (value === "down") return "风险下降";
  return "基本稳定";
}

function buildRecentDateRange(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));
    return date.toISOString().split("T")[0];
  });
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}
