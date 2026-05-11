"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bell,
  BookOpenText,
  Building2,
  ChevronRight,
  HeartPulse,
  MessageCircleMore,
  MoonStar,
  Repeat2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Utensils,
} from "lucide-react";
import CareModeToggle from "@/components/parent/CareModeToggle";
import ParentSpeakButton from "@/components/parent/ParentSpeakButton";
import {
  ReplicaComboChart,
  ReplicaLineChart,
  replicaChartColors,
  type ReplicaChartDatum,
} from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ParentPixelTone = "blue" | "green" | "orange" | "violet" | "sky";
type ParentPixelBadgeVariant = "success" | "warning" | "info" | "secondary" | "outline";

export interface ParentPixelStatusItem {
  id: string;
  label: string;
  value: ReactNode;
  helper: string;
  tone: ParentPixelTone;
}

export interface ParentPixelReminderItem {
  id: string;
  time: string;
  author: string;
  content: string;
  unread?: boolean;
}

export interface ParentPixelGrowthImage {
  id: string;
  title: string;
  src: string;
}

export interface ParentPixelTrendPoint {
  day: string;
  temp: number | null;
  mood: number | null;
  mealScore: number | null;
  growthCount: number;
  feedbackCount: number;
  reminderCount: number;
}

export interface PixelParentHomeReplicaProps {
  todayText: string;
  currentUserName: string;
  childName: string;
  childMeta: string;
  allergies: string[];
  statusLabel: string;
  statusVariant: ParentPixelBadgeVariant;
  careMode: boolean;
  onCareModeChange: (nextValue: boolean) => void;
  agentHref: string;
  storybookHref: string;
  switchChildHref: string;
  reminderSpeechText: string;
  statusItems: ParentPixelStatusItem[];
  reminders: ParentPixelReminderItem[];
  aiTitle: string;
  aiDescription: string;
  tonightTitle: string;
  tonightDescription: string;
  whyRecommended: string;
  teacherFocus: string;
  growthImages: ParentPixelGrowthImage[];
  trendPoints: ParentPixelTrendPoint[];
  hasPendingFeedback: boolean;
}

const statusIconMap: Record<string, ReactNode> = {
  arrival: <Building2 className="h-7 w-7" />,
  temp: <HeartPulse className="h-7 w-7" />,
  meal: <Utensils className="h-7 w-7" />,
  nap: <MoonStar className="h-7 w-7" />,
  activity: <TrendingUp className="h-7 w-7" />,
};

const toneClassMap: Record<ParentPixelTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-500",
  violet: "bg-violet-50 text-violet-600",
  sky: "bg-sky-50 text-sky-600",
};

export default function PixelParentHomeReplica({
  todayText,
  currentUserName,
  childName,
  childMeta,
  allergies,
  statusLabel,
  statusVariant,
  careMode,
  onCareModeChange,
  agentHref,
  storybookHref,
  switchChildHref,
  reminderSpeechText,
  statusItems,
  reminders,
  aiTitle,
  aiDescription,
  tonightTitle,
  tonightDescription,
  whyRecommended,
  teacherFocus,
  growthImages,
  trendPoints,
  hasPendingFeedback,
}: PixelParentHomeReplicaProps) {
  const displayImages = growthImages.slice(0, 4);
  const temperaturePoints = trendPoints.filter((point) => typeof point.temp === "number");
  const moodPoints = trendPoints.filter((point) => typeof point.mood === "number");
  const healthTrendRows: ReplicaChartDatum[] = trendPoints.map((point) => ({
    label: point.day,
    temp: point.temp,
    mood: point.mood,
  }));
  const dietGrowthTrendRows: ReplicaChartDatum[] = trendPoints.map((point) => ({
    label: point.day,
    meal: point.mealScore,
    growth: point.growthCount,
    feedback: point.feedbackCount,
    reminders: point.reminderCount,
  }));

  return (
    <div className="mx-auto max-w-[72rem] min-w-0 pb-24">
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section className="relative min-h-[150px] overflow-hidden rounded-[24px] border border-violet-100 bg-[linear-gradient(135deg,#f7f4ff_0%,#fffefe_58%,#eef8ff_100%)] p-4 shadow-[0_22px_70px_rgb(111_96_255_/_0.13)] sm:min-h-0 sm:rounded-[28px] sm:p-7">
            <div className="absolute -right-4 bottom-0 h-24 w-40 overflow-hidden rounded-[28px] sm:right-4 sm:top-2 sm:h-36 sm:w-64 sm:rounded-[32px]">
              <Image
                src="/pixel-replica/parent/parent-mobile-hero-family.png"
                alt=""
                fill
                unoptimized
                className="object-contain object-right-top"
                sizes="260px"
              />
            </div>
            <div className="relative min-w-0 max-w-[11rem] sm:max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-600">
                <ShieldCheck className="h-5 w-5" />
                智慧托育平台 · 家长端
              </div>
              <h1 className="mt-3 text-[22px] font-black leading-tight tracking-normal text-slate-950 sm:mt-5 sm:text-4xl">
                {currentUserName}，晚上好！
              </h1>
              <p className="mt-2 break-words text-sm leading-6 text-slate-600 sm:mt-3 sm:text-lg sm:leading-8">
                {todayText}，{childName} 今天状态良好，快来看看今晚建议吧～
              </p>
            </div>
          </section>

          <section className="rounded-[24px] border border-violet-100 bg-white p-3.5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:rounded-[28px] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 shadow-inner sm:h-[88px] sm:w-[88px]">
                  <Image
                    src="/pixel-replica/parent/parent-feedback-avatar.png"
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="88px"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="min-w-0 break-words text-2xl font-black tracking-normal text-slate-950 sm:text-3xl">{childName}</h2>
                    <Badge variant="info" className="rounded-full px-2.5 py-0.5 text-sm sm:px-3 sm:py-1 sm:text-base">
                      3岁2个月
                    </Badge>
                  </div>
                  <p className="mt-1 break-words text-sm leading-5 text-slate-500 sm:mt-2 sm:text-base sm:leading-7">{childMeta}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                    {allergies.length > 0 ? (
                      allergies.slice(0, 2).map((item) => (
                        <Badge key={item} variant="warning" className="rounded-full">
                          过敏：{item}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="success" className="rounded-full">
                        暂无过敏重点
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <CareModeToggle careMode={careMode} onChange={onCareModeChange} variant="compact" />
                <Button asChild variant="outline" className="h-10 rounded-full px-4 text-sm sm:h-12 sm:px-5 sm:text-base">
                  <Link href={switchChildHref}>
                    <Repeat2 className="mr-2 h-5 w-5" />
                    切换孩子
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:rounded-[28px] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-4">
                <h2 className="text-xl font-black tracking-normal text-slate-950 sm:text-2xl">今日状态</h2>
                <span className="h-5 w-px bg-slate-200" />
                <span className="text-xs text-slate-400 sm:text-sm">更新于 18:30</span>
              </div>
              <Badge variant={statusVariant} className="rounded-full px-3 py-1.5 text-sm sm:px-4 sm:py-2 sm:text-base">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {statusLabel}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2 sm:mt-7 sm:gap-3">
              {statusItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[18px] border border-slate-100 bg-white px-1.5 py-3 text-center shadow-[0_10px_28px_rgb(15_23_42_/_0.06)] sm:rounded-[22px] sm:px-3 sm:py-4"
                >
                  <div
                    className={cn(
                      "mx-auto flex h-11 w-11 items-center justify-center rounded-full sm:h-16 sm:w-16",
                      toneClassMap[item.tone]
                    )}
                  >
                    {statusIconMap[item.id] ?? <Sparkles className="h-7 w-7" />}
                  </div>
                  <p className="mt-2 text-xs text-slate-500 sm:mt-3 sm:text-base">{item.label}</p>
                  <div className="mt-1 text-[13px] font-semibold leading-tight text-slate-950 sm:text-xl">{item.value}</div>
                  <Badge variant={item.tone === "orange" ? "warning" : "info"} className="mt-2 rounded-full px-1.5 text-[10px] sm:mt-3 sm:px-2.5 sm:text-xs">
                    {item.helper}
                  </Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Bell className="h-6 w-6 text-violet-500" />
                <h2 className="text-2xl font-black tracking-normal text-slate-950">今日重点提醒</h2>
              </div>
              <Link href={agentHref} className="flex items-center gap-1 text-sm font-semibold text-violet-600">
                查看全部
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {reminders.length > 0 ? reminders.map((item, index) => (
                <div
                  key={item.id}
                  className="relative flex items-center gap-3 rounded-[22px] bg-slate-50/80 px-4 py-4"
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full border-4",
                      index === 0 ? "border-slate-200 bg-slate-300" : "border-slate-200 bg-white"
                    )}
                  />
                  <span className="w-14 shrink-0 text-base text-slate-400">{item.time}</span>
                  <span className="font-semibold text-slate-950">{item.author}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{item.content}</span>
                  {item.unread ? <span className="h-3 w-3 rounded-full bg-red-500" /> : null}
                </div>
              )) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-500">
                  当前孩子暂无老师反馈或日常提醒。
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-[linear-gradient(135deg,#ffffff_0%,#f7f4ff_52%,#f2fbff_100%)] p-5 shadow-[0_18px_56px_rgb(111_96_255_/_0.12)] sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <MoonStar className="h-7 w-7 text-violet-600" />
                  <h2 className="text-2xl font-black tracking-normal text-slate-950">今晚建议怎么做</h2>
                  <Badge variant="info" className="rounded-full">AI</Badge>
                </div>
                <p className="mt-3 font-semibold text-violet-600">根据{childName}近7天数据分析</p>
                <p className="mt-2 text-lg leading-8 text-slate-700">{aiTitle}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    [tonightTitle, tonightDescription],
                    ["为什么推荐", whyRecommended],
                    ["温和陪伴", aiDescription],
                    ["营养加分", teacherFocus],
                  ].map(([title, helper]) => (
                    <div key={title} className="rounded-[18px] border border-white bg-white/80 px-4 py-3">
                      <p className="font-semibold text-slate-950">{title}</p>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{helper}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild variant="premium" className="h-12 rounded-full px-6 text-base">
                    <Link href={agentHref}>查看完整建议</Link>
                  </Button>
                  <ParentSpeakButton text={reminderSpeechText} label="播报" />
                </div>
              </div>
              <div className="relative hidden min-h-[190px] lg:block">
                <Image
                  src="/pixel-replica/parent/parent-home-ai-robot.png"
                  alt=""
                  fill
                  unoptimized
                  className="object-contain object-right-bottom"
                  sizes="270px"
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <BookOpenText className="h-7 w-7 text-emerald-500" />
                  <h2 className="text-2xl font-black tracking-normal text-slate-950">成长瞬间</h2>
                </div>
                <p className="mt-2 text-base text-slate-500">记录每一个小美好</p>
              </div>
              <Link href={storybookHref} className="flex items-center gap-1 text-sm font-semibold text-slate-500">
                查看全部
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {displayImages.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {displayImages.map((item) => (
                  <Link
                    key={item.id}
                    href={storybookHref}
                    className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-slate-100 shadow-sm"
                  >
                    <Image
                      src={item.src}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="220px"
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                当前孩子还没有带图片的成长记录，生成绘本前不会用固定示例图覆盖空状态。
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Bell className="h-6 w-6 text-violet-500" />
                <h3 className="text-xl font-black text-slate-950">近7天状态趋势</h3>
              </div>
              <Link href={`${agentHref}&intent=query_trend`} className="text-sm font-semibold text-slate-500">
                查看更多
              </Link>
            </div>
            <div className="mt-5 rounded-[22px] bg-slate-50 px-4 py-5">
              <div className="space-y-5">
                <ReplicaLineChart
                  data={healthTrendRows}
                  testId="r03-parent-health-trend"
                  series={[
                    { key: "temp", label: "体温", color: replicaChartColors.green, unit: "°C" },
                    { key: "mood", label: "情绪", color: replicaChartColors.primary },
                  ]}
                  height={180}
                />
                <ReplicaComboChart
                  data={dietGrowthTrendRows}
                  testId="r03-parent-diet-growth-trend"
                  series={[
                    { key: "meal", label: "饮食趋势", color: replicaChartColors.amber, kind: "line", unit: "分" },
                    { key: "growth", label: "成长行为", color: replicaChartColors.green, unit: "条" },
                    { key: "feedback", label: "反馈状态", color: replicaChartColors.sky, unit: "条" },
                    { key: "reminders", label: "提醒状态", color: replicaChartColors.primary, unit: "条" },
                  ]}
                  height={180}
                />
              </div>
              <div className="mb-3 flex items-center gap-5 text-xs text-slate-500">
                <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-500" />体温(°C)</span>
                <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-violet-500" />情绪</span>
              </div>
              {temperaturePoints.length > 0 || moodPoints.length > 0 ? (
                <svg viewBox="0 0 320 150" className="h-40 w-full overflow-visible">
                  {[35, 36, 37, 38].map((value, index) => (
                    <g key={value}>
                      <line x1="28" x2="310" y1={130 - index * 30} y2={130 - index * 30} stroke="#e5e7eb" />
                      <text x="0" y={134 - index * 30} className="fill-slate-400 text-[11px]">{value}.0</text>
                    </g>
                  ))}
                  {temperaturePoints.length > 0 ? (
                    <polyline
                      points={trendPoints
                        .map((point, index) =>
                          typeof point.temp === "number" ? `${40 + index * 43},${130 - (point.temp - 35) * 30}` : null
                        )
                        .filter(Boolean)
                        .join(" ")}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  ) : null}
                  {moodPoints.length > 0 ? (
                    <polyline
                      points={trendPoints
                        .map((point, index) =>
                          typeof point.mood === "number" ? `${40 + index * 43},${130 - (point.mood - 2.6) * 24}` : null
                        )
                        .filter(Boolean)
                        .join(" ")}
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  ) : null}
                  {trendPoints.map((point, index) => (
                    <g key={point.day}>
                      {typeof point.temp === "number" ? (
                        <circle cx={40 + index * 43} cy={130 - (point.temp - 35) * 30} r="4" fill="#fff" stroke="#10b981" strokeWidth="3" />
                      ) : null}
                      {typeof point.mood === "number" ? (
                        <circle cx={40 + index * 43} cy={130 - (point.mood - 2.6) * 24} r="4" fill="#fff" stroke="#8b5cf6" strokeWidth="3" />
                      ) : null}
                      <text x={31 + index * 43} y="153" className="fill-slate-500 text-[10px]">{point.day}</text>
                    </g>
                  ))}
                </svg>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
                  近 7 天还没有晨检或情绪记录。
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,#fffaf0_0%,#fff_58%,#f4fbff_100%)] p-5 shadow-[0_18px_56px_rgb(251_191_36_/_0.12)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-slate-950">明天老师将重点关注</h3>
                <p className="mt-2 text-base leading-7 text-slate-600">{teacherFocus}</p>
              </div>
              <Badge variant="warning" className="rounded-full">明日重点</Badge>
            </div>
            <div className="mt-5 rounded-[22px] bg-white/80 px-4 py-3 text-sm leading-6 text-slate-600">
              情绪稳定与同伴互动，鼓励主动表达与分享。
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Link
              href={agentHref}
              className="rounded-[24px] border border-violet-100 bg-[linear-gradient(135deg,#f4f0ff,#fff)] p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-black text-violet-600">通知消息</h3>
                  <p className="mt-2 text-base text-slate-500">重要信息及时知晓</p>
                </div>
                <MessageCircleMore className="h-12 w-12 text-violet-400" />
              </div>
            </Link>
            <Link
              href={storybookHref}
              className="rounded-[24px] border border-emerald-100 bg-[linear-gradient(135deg,#effdf6,#fff)] p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-black text-emerald-600">育儿知识</h3>
                  <p className="mt-2 text-base text-slate-500">科学育儿，轻松陪伴</p>
                </div>
                <BookOpenText className="h-12 w-12 text-emerald-400" />
              </div>
            </Link>
          </section>

          <section className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">反馈今天的情况</h3>
                <p className="mt-2 text-sm text-slate-500">帮助老师更好地了解宝贝</p>
              </div>
              <Button asChild variant="premium" className="h-12 rounded-full px-6 text-base">
                <Link href={`${agentHref}#feedback`}>{hasPendingFeedback ? "提交反馈" : "更新反馈"}</Link>
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
