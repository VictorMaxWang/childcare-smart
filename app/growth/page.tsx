"use client";

import { useMemo, useState } from "react";
import { BookHeart, CalendarClock, CheckCircle2, Clock3, PlusCircle, Workflow } from "lucide-react";
import {
  BEHAVIOR_CATEGORIES,
  type AgeBand,
  getAgeBandFromBirthDate,
  getAgeText,
  type BehaviorCategory,
  useApp,
} from "../../lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";  
import { OBSERVATION_INDICATOR_MAP, type ObservationIndicatorOption } from "@/lib/mock/observation";

export default function GrowthPage() {
  const { currentUser, visibleChildren, growthRecords, addGrowthRecord } = useApp();
  const [selectedChildId, setSelectedChildId] = useState<string>(visibleChildren[0]?.id ?? "");
  const [category, setCategory] = useState<BehaviorCategory>("情绪表现");
  const [tags, setTags] = useState("午睡前, 课堂观察");
  const [description, setDescription] = useState("");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);
  const [filterValue, setFilterValue] = useState("全部");
  const [reviewFilter, setReviewFilter] = useState("全部");
  const [followUpAction, setFollowUpAction] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const visibleIds = visibleChildren.map((child) => child.id);
  const filteredRecords = useMemo(() => {
    return growthRecords.filter((record) => {
      const withinScope = visibleIds.includes(record.childId);
      const categoryMatched = filterValue === "全部" || record.category === filterValue;
      const reviewMatched = reviewFilter === "全部" || (record.reviewStatus ?? "已完成") === reviewFilter;
      return withinScope && categoryMatched && reviewMatched;
    });
  }, [filterValue, growthRecords, reviewFilter, visibleIds]);

  const pendingRecords = useMemo(
    () => filteredRecords.filter((record) => record.reviewStatus === "待复查"),
    [filteredRecords]
  );

  const completedRecords = useMemo(
    () => filteredRecords.filter((record) => record.reviewStatus === "已完成"),
    [filteredRecords]
  );

  const availableIndicators = useMemo(() => {
    if (!selectedChildId) return [];
    const child = visibleChildren.find(c => c.id === selectedChildId);
    if (!child) return [];
    const ageBand = getAgeBandFromBirthDate(child.birthDate);
    const indicatorsByCategory = OBSERVATION_INDICATOR_MAP as Partial<
      Record<BehaviorCategory, Partial<Record<AgeBand, ObservationIndicatorOption[]>>>
    >;
    return indicatorsByCategory[category]?.[ageBand] ?? [];
  }, [selectedChildId, category, visibleChildren]);

  // Helper to resolve indicator labels
  const getIndicatorLabel = (indicatorId: string) => {
    const indicatorsByCategory = OBSERVATION_INDICATOR_MAP as Partial<
      Record<BehaviorCategory, Partial<Record<AgeBand, ObservationIndicatorOption[]>>>
    >;
    for (const cat in OBSERVATION_INDICATOR_MAP) {
      const ageBands = indicatorsByCategory[cat as BehaviorCategory];
      if (!ageBands) continue;
      for (const band in ageBands) {
        const indicators = ageBands[band as AgeBand];
        if (!indicators) continue;
        const found = indicators.find((ind) => ind.id === indicatorId);
        if (found) return found.label;
      }
    }
    return indicatorId;
  };

  const timelineRecords = useMemo(
    () => [...filteredRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filteredRecords]
  );

  function submitRecord() {
    if (!selectedChildId || !description.trim()) return;
    addGrowthRecord({
      childId: selectedChildId,
      category,
      tags: tags.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      description: description.trim(),
      needsAttention,
      followUpAction: followUpAction.trim() || undefined,
      reviewDate: reviewDate || undefined,
      selectedIndicators: selectedIndicators.length > 0 ? selectedIndicators : undefined,
    });
    setDescription("");
    setTags("");
    setNeedsAttention(false);
    setFollowUpAction("");
    setReviewDate("");
    setSelectedIndicators([]);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 page-enter">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-800">
          <BookHeart className="h-8 w-8 text-rose-500" />
          成长与行为记录
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          支持记录握笔、独立进食、语言表达、社交互动、情绪表现、精细动作、大动作、睡眠情况、如厕情况。
          每条记录都包含时间、记录人角色、观察标签、描述和是否需要关注。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">新增观察记录</CardTitle>
            <CardDescription>家长和教师均可补充观察，机构管理员可做复盘。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>记录对象</Label>
              <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择幼儿" />
                </SelectTrigger>
                <SelectContent>
                  {visibleChildren.map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {child.name} · {child.className}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>观察维度</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as BehaviorCategory)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择维度" />
                </SelectTrigger>
                <SelectContent>
                  {BEHAVIOR_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {availableIndicators.length > 0 && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 border border-slate-100">
                <Label className="text-indigo-700">结构化观察指标</Label>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {availableIndicators.map((indicator) => {
                    const isSelected = selectedIndicators.includes(indicator.id);
                    return (
                      <div 
                        key={indicator.id} 
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-100'}`}
                        onClick={() => {
                          setSelectedIndicators(prev => 
                            isSelected 
                              ? prev.filter(id => id !== indicator.id) 
                              : [...prev, indicator.id]
                          );
                        }}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300'}`}>
                          {isSelected && <CheckCircle2 className="w-3 h-3" />}
                        </div>
                        <span className={`text-sm ${isSelected ? 'text-indigo-900 font-medium' : 'text-slate-600'}`}>
                          {indicator.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>观察标签</Label>
              <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="如：午睡前, 自主进食" />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="请记录具体表现、触发场景和处理方式。" />
            </div>
            <div className="space-y-2">
              <Label>跟进行动</Label>
              <Input value={followUpAction} onChange={(event) => setFollowUpAction(event.target.value)} placeholder="如：午睡前增加绘本安抚、明早复查入园情绪" />
            </div>
            <div className="space-y-2">
              <Label>复查日期</Label>
              <Input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="text-sm font-medium text-slate-700">是否需要关注</p>
                <p className="text-xs text-slate-400">用于触发后续提醒和家园协同任务。</p>
              </div>
              <Button variant={needsAttention ? "destructive" : "outline"} onClick={() => setNeedsAttention((prev) => !prev)}>
                {needsAttention ? "需要关注" : "正常观察"}
              </Button>
            </div>
            <Button className="w-full gap-2" onClick={submitRecord}>
              <PlusCircle className="h-4 w-4" />
              保存记录
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InfoStat title="待复查" value={`${pendingRecords.length}条`} icon={<CalendarClock className="h-4 w-4 text-amber-500" />} />
            <InfoStat title="已完成复查" value={`${completedRecords.length}条`} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} />
            <InfoStat title="当前身份" value={`${currentUser.role}`} />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-lg">观察台账</CardTitle>
                <CardDescription>可按维度与复查状态过滤，便于教师与家长共同追踪变化。</CardDescription>
              </div>
              <div className="grid w-full gap-3 md:w-auto md:grid-cols-2">
                <Select value={filterValue} onValueChange={setFilterValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="筛选维度" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="全部">全部维度</SelectItem>
                    {BEHAVIOR_CATEGORIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={reviewFilter} onValueChange={setReviewFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="筛选复查状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="全部">全部状态</SelectItem>
                    <SelectItem value="待复查">待复查</SelectItem>
                    <SelectItem value="已完成">已完成</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {timelineRecords.map((record) => {
                const child = visibleChildren.find((item) => item.id === record.childId);
                if (!child) return null;
                return (
                  <div key={record.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={record.needsAttention ? "warning" : "secondary"}>
                            {record.category}
                          </Badge>
                          <Badge variant="info">{child.name}</Badge>
                          <Badge variant="secondary">{child.className}</Badge>
                          <Badge variant={record.reviewStatus === "待复查" ? "warning" : "success"}>
                            {record.reviewStatus ?? "已完成"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-700">{record.description}</p>
                        
                        {record.selectedIndicators && record.selectedIndicators.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1.5">
                            <span className="text-xs text-slate-500 font-medium">结构化指标达成：</span>
                            <div className="flex flex-wrap gap-2">
                              {record.selectedIndicators.map(ind => (
                                <Badge key={ind} variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-100 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {getIndicatorLabel(ind)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {record.followUpAction ? (
                          <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            跟进行动：{record.followUpAction}
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="min-w-[180px] rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-3.5 w-3.5" />
                          {record.createdAt}
                        </div>
                        <p className="mt-2">记录人：{record.recorder}</p>
                        <p className="mt-1">角色：{record.recorderRole}</p>
                        <p className="mt-1">复查日期：{record.reviewDate ?? "未设置"}</p>
                        <p className="mt-1">年龄段：{getAgeBandFromBirthDate(child.birthDate)}</p>
                        <p className="mt-1">年龄：{getAgeText(child.birthDate)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {timelineRecords.length === 0 ? <p className="text-sm text-slate-400">当前筛选条件下暂无观察记录。</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Workflow className="h-5 w-5 text-indigo-500" />
                历史时间线
              </CardTitle>
              <CardDescription>将家庭观察、教师记录与复查动作放在同一条时间线中查看。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {timelineRecords.slice(0, 8).map((record) => {
                const child = visibleChildren.find((item) => item.id === record.childId);
                if (!child) return null;
                return (
                  <div key={`timeline-${record.id}`} className="relative rounded-2xl border border-slate-100 bg-white p-4 pl-6 shadow-sm">
                    <span className="absolute left-3 top-6 h-2.5 w-2.5 rounded-full bg-indigo-400" />
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{child.name} · {record.category}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{record.description}</p>
                      </div>
                      <div className="text-xs text-slate-400">
                        <p>{record.createdAt}</p>
                        <p className="mt-1">{record.recorderRole} · {record.recorder}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoStat({ title, value, icon }: { title: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{title}</p>
          {icon}
        </div>
        <p className="mt-2 text-lg font-semibold text-slate-800">{value}</p>
      </CardContent>
    </Card>
  );
}
