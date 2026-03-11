"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

export type Role = "家长" | "教师" | "机构管理员";
export type Gender = "男" | "女";
export type AgeBand = "0–6个月" | "6–12个月" | "1–3岁" | "3–6岁" | "6–7岁";
export type BehaviorCategory =
  | "握笔"
  | "独立进食"
  | "语言表达"
  | "社交互动"
  | "情绪表现"
  | "精细动作"
  | "大动作"
  | "睡眠情况"
  | "如厕情况";
export type MealType = "早餐" | "午餐" | "晚餐" | "加餐";
export type FoodCategory = "蔬果" | "蛋白" | "主食" | "奶制品" | "饮品" | "其他";
export type IntakeLevel = "少量" | "适中" | "充足";
export type PreferenceStatus = "偏好" | "正常" | "拒食";
export type InsightLevel = "success" | "warning" | "info";
export type CollaborationStatus = "已知晓" | "在家已配合" | "今晚反馈";

export const AGE_BAND_OPTIONS: AgeBand[] = ["0–6个月", "6–12个月", "1–3岁", "3–6岁", "6–7岁"];
export const BEHAVIOR_CATEGORIES: BehaviorCategory[] = [
  "握笔",
  "独立进食",
  "语言表达",
  "社交互动",
  "情绪表现",
  "精细动作",
  "大动作",
  "睡眠情况",
  "如厕情况",
];
export const MEAL_TYPES: MealType[] = ["早餐", "午餐", "晚餐", "加餐"];
export const FOOD_CATEGORY_OPTIONS: FoodCategory[] = ["蔬果", "蛋白", "主食", "奶制品", "饮品", "其他"];
export const INSTITUTION_NAME = "春芽普惠托育中心";

const TODAY = new Date().toISOString().split("T")[0];

export interface User {
  id: string;
  name: string;
  role: Role;
  avatar: string;
  institutionId: string;
  className?: string;
  childIds?: string[];
}

export interface Guardian {
  name: string;
  relation: string;
  phone: string;
}

export interface Child {
  id: string;
  name: string;
  nickname?: string;
  birthDate: string;
  gender: Gender;
  allergies: string[];
  heightCm: number;
  weightKg: number;
  guardians: Guardian[];
  institutionId: string;
  className: string;
  specialNotes: string;
  avatar: string;
  parentUserId?: string;
}

export interface AttendanceRecord {
  id: string;
  childId: string;
  date: string;
  isPresent: boolean;
  checkInAt?: string;
  checkOutAt?: string;
  absenceReason?: string;
}

export interface HealthCheckRecord {
  id: string;
  childId: string;
  date: string;
  temperature: number;
  mood: string;
  handMouthEye: "正常" | "异常";
  isAbnormal: boolean;
  remark?: string;
  checkedBy: string;
  checkedByRole: Role;
}

export interface FoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  amount: string;
}

export interface MealRecord {
  id: string;
  childId: string;
  date: string;
  meal: MealType;
  foods: FoodItem[];
  intakeLevel: IntakeLevel;
  preference: PreferenceStatus;
  allergyReaction?: string;
  waterMl: number;
  nutritionScore: number;
  recordedBy: string;
  recordedByRole: Role;
}

export interface GrowthRecord {
  id: string;
  childId: string;
  createdAt: string;
  recorder: string;
  recorderRole: Role;
  category: BehaviorCategory;
  tags: string[];
  selectedIndicators?: string[];
  description: string;
  needsAttention: boolean;
  followUpAction?: string;
  reviewDate?: string;
  reviewStatus?: "待复查" | "已完成";
}

export interface TaskCheckInRecord {
  id: string;
  childId: string;
  taskId: string;
  date: string;
}

export interface GuardianFeedback {
  id: string;
  childId: string;
  date: string;
  status: CollaborationStatus;
  content: string;
  createdBy: string;
  createdByRole: Role;
}

export interface SmartInsight {
  id: string;
  title: string;
  description: string;
  level: InsightLevel;
  tags: string[];
  childId?: string;
}

export interface WeeklyDietTrend {
  balancedRate: number;
  vegetableDays: number;
  proteinDays: number;
  stapleDays: number;
  hydrationAvg: number;
  monotonyDays: number;
}

export interface ParentFeed {
  child: Child;
  todayMeals: MealRecord[];
  todayGrowth: GrowthRecord[];
  weeklyTrend: WeeklyDietTrend;
  suggestions: SmartInsight[];
  feedbacks: GuardianFeedback[];
}

export interface AdminBoardData {
  highAttentionChildren: Array<{ childId: string; childName: string; count: number }>;
  lowHydrationChildren: Array<{ childId: string; childName: string; hydrationAvg: number }>;
  lowVegTrendChildren: Array<{ childId: string; childName: string; vegetableDays: number }>;
}

export interface NewChildInput {
  name: string;
  nickname?: string;
  birthDate: string;
  gender: Gender;
  allergies: string[];
  heightCm: number;
  weightKg: number;
  guardians: Guardian[];
  institutionId: string;
  className: string;
  specialNotes: string;
  parentUserId?: string;
}

export interface UpsertMealRecordInput {
  childId: string;
  date: string;
  meal: MealType;
  foods: FoodItem[];
  intakeLevel: IntakeLevel;
  preference: PreferenceStatus;
  allergyReaction?: string;
  waterMl: number;
  recordedBy: string;
  recordedByRole: Role;
}

export interface BulkMealTemplateInput extends Omit<UpsertMealRecordInput, "childId"> {
  excludedChildIds?: string[];
  onlyChildIds?: string[];
}

export interface BulkPreviewItem {
  childId: string;
  childName: string;
  blockedByAllergy: boolean;
  blockedReason?: string;
  excluded: boolean;
}

export interface AddGrowthRecordInput {
  childId: string;
  category: BehaviorCategory;
  tags: string[];
  description: string;
  needsAttention: boolean;
  followUpAction?: string;
  reviewDate?: string;
  reviewStatus?: "待复查" | "已完成";
  selectedIndicators?: string[];
}

interface AppContextType {
  users: User[];
  currentUser: User;
  isAuthenticated: boolean;
  authLoading: boolean;
  login: (userId: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchUser: (userId: string) => void;

  children: Child[];
  visibleChildren: Child[];

  attendanceRecords: AttendanceRecord[];
  getAttendanceByDate: (date: string, childId?: string) => AttendanceRecord[];
  getTodayAttendance: () => AttendanceRecord[];
  markAttendance: (input: Omit<AttendanceRecord, "id">) => void;
  toggleTodayAttendance: (childId: string) => void;

  healthCheckRecords: HealthCheckRecord[];
  upsertHealthCheck: (input: Omit<HealthCheckRecord, "id" | "date" | "checkedBy" | "checkedByRole"> & { date?: string }) => void;
  getTodayHealthCheck: (childId: string) => HealthCheckRecord | undefined;

  taskCheckInRecords: TaskCheckInRecord[];
  checkInTask: (childId: string, taskId: string, date: string) => void;
  getTaskCheckIns: (childId: string, date?: string) => TaskCheckInRecord[];

  presentChildren: Child[];

  addChild: (child: NewChildInput) => void;
  removeChild: (id: string) => void;

  mealRecords: MealRecord[];
  upsertMealRecord: (input: UpsertMealRecordInput) => void;
  bulkApplyMealTemplate: (input: BulkMealTemplateInput) => { applied: string[]; blocked: string[] };
  previewBulkMealTemplate: (input: Pick<BulkMealTemplateInput, "foods" | "excludedChildIds" | "onlyChildIds">) => BulkPreviewItem[];

  growthRecords: GrowthRecord[];
  addGrowthRecord: (input: AddGrowthRecordInput) => void;

  guardianFeedbacks: GuardianFeedback[];
  addGuardianFeedback: (input: Omit<GuardianFeedback, "id" | "createdBy" | "createdByRole">) => void;

  getTodayMealRecords: (childIds?: string[]) => MealRecord[];
  getWeeklyDietTrend: (childId?: string) => WeeklyDietTrend;
  getSmartInsights: () => SmartInsight[];
  getParentFeed: () => ParentFeed[];
  getAdminBoardData: () => AdminBoardData;
  resetDemoData: () => Promise<{ remoteSynced: boolean }>;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  children: "childcare.children.v2",
  attendance: "childcare.attendance.v2",
  meals: "childcare.meals.v2",
  growth: "childcare.growth.v2",
  feedback: "childcare.feedback.v2",
  health: "childcare.health.v2",
  taskCheckIns: "childcare.taskcheckins.v2",
  remoteDemoSeed: "childcare.remote-demo-seed.v2",
} as const;

const REMOTE_DEMO_SEED_VERSION = "2026-03-demo-v2";

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

const GIRL_AVATARS = ["👧", "🧒", "👶"];
const BOY_AVATARS = ["👦", "🧒", "👶"];

function shiftDate(baseDate: string, diff: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + diff);
  return date.toISOString().split("T")[0];
}

type DemoAttendanceSeed = Pick<AttendanceRecord, "isPresent" | "checkInAt" | "checkOutAt" | "absenceReason">;
type DemoMealFoodSeed = [name: string, category: FoodCategory, amount: string];

const DEMO_WEEK_DATES = Array.from({ length: 7 }, (_, index) => shiftDate(TODAY, index - 6));

function createMealRecord(
  id: string,
  childId: string,
  date: string,
  meal: MealType,
  foods: DemoMealFoodSeed[],
  waterMl: number,
  preference: PreferenceStatus,
  recordedBy: string,
  recordedByRole: Role,
  intakeLevel: IntakeLevel = "适中",
  allergyReaction?: string
): MealRecord {
  return {
    id,
    childId,
    date,
    meal,
    foods: foods.map(([name, category, amount], index) => ({
      id: `${id}-f${index + 1}`,
      name,
      category,
      amount,
    })),
    intakeLevel,
    preference,
    allergyReaction,
    waterMl,
    nutritionScore: 0,
    recordedBy,
    recordedByRole,
  };
}

function createHealthRecord(
  id: string,
  childId: string,
  date: string,
  temperature: number,
  mood: string,
  remark: string,
  checkedBy: string,
  checkedByRole: Role,
  handMouthEye: "正常" | "异常" = "正常"
): HealthCheckRecord {
  return {
    id,
    childId,
    date,
    temperature,
    mood,
    handMouthEye,
    isAbnormal: temperature >= 37.3 || handMouthEye === "异常",
    remark,
    checkedBy,
    checkedByRole,
  };
}

const INITIAL_USERS: User[] = [
  { id: "u-admin", name: "陈园长", role: "机构管理员", avatar: "🧑‍💼", institutionId: "inst-1" },
  { id: "u-teacher", name: "李老师", role: "教师", avatar: "👩‍🏫", institutionId: "inst-1", className: "向阳班" },
  { id: "u-teacher2", name: "周老师", role: "教师", avatar: "👩‍🏫", institutionId: "inst-1", className: "晨曦班" },
  { id: "u-parent", name: "林妈妈", role: "家长", avatar: "👩", institutionId: "inst-1", childIds: ["c-1"] },
];

const INITIAL_CHILDREN: Child[] = [
  {
    id: "c-1",
    name: "林小雨",
    nickname: "小雨",
    birthDate: "2023-08-12",
    gender: "女",
    allergies: ["牛奶", "芒果"],
    heightCm: 96,
    weightKg: 14.2,
    guardians: [{ name: "林妈妈", relation: "母亲", phone: "138****1024" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "午睡前容易情绪波动，需要安抚绘本。",
    avatar: "👧",
    parentUserId: "u-parent",
  },
  {
    id: "c-2",
    name: "张浩然",
    nickname: "浩浩",
    birthDate: "2022-05-09",
    gender: "男",
    allergies: [],
    heightCm: 102,
    weightKg: 16.5,
    guardians: [{ name: "张爸爸", relation: "父亲", phone: "139****5678" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "喜欢搭建类活动，可强化精细动作训练。",
    avatar: "👦",
  },
  {
    id: "c-3",
    name: "陈思琪",
    nickname: "琪琪",
    birthDate: "2020-11-19",
    gender: "女",
    allergies: ["芒果"],
    heightCm: 111,
    weightKg: 18.3,
    guardians: [{ name: "陈奶奶", relation: "祖母", phone: "137****9921" }],
    institutionId: "inst-1",
    className: "晨曦班",
    specialNotes: "语言表达能力强，适合担任小组分享。",
    avatar: "👧",
  },
  {
    id: "c-4",
    name: "王小明",
    nickname: "明明",
    birthDate: "2024-06-03",
    gender: "男",
    allergies: [],
    heightCm: 84,
    weightKg: 11.1,
    guardians: [{ name: "王妈妈", relation: "母亲", phone: "136****8899" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "刚入托，需要更多社交适应观察。",
    avatar: "👦",
  },
  {
    id: "c-5",
    name: "赵安安",
    nickname: "安安",
    birthDate: "2019-10-01",
    gender: "女",
    allergies: [],
    heightCm: 116,
    weightKg: 20.4,
    guardians: [{ name: "赵爸爸", relation: "父亲", phone: "135****4512" }],
    institutionId: "inst-1",
    className: "晨曦班",
    specialNotes: "如厕能力良好，可带动同伴。",
    avatar: "👧",
  },
  {
    id: "c-6",
    name: "刘子轩",
    nickname: "轩轩",
    birthDate: "2023-01-20",
    gender: "男",
    allergies: ["鸡蛋"],
    heightCm: 92,
    weightKg: 13.6,
    guardians: [{ name: "刘爸爸", relation: "父亲", phone: "133****2210" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "性格内向，需要多鼓励社交互动。",
    avatar: "👦",
  },
  {
    id: "c-7",
    name: "杨梓涵",
    nickname: "涵涵",
    birthDate: "2022-09-15",
    gender: "女",
    allergies: [],
    heightCm: 100,
    weightKg: 15.8,
    guardians: [{ name: "杨妈妈", relation: "母亲", phone: "158****7763" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "对音乐节奏敏感，喜欢唱歌和跳舞。",
    avatar: "👧",
  },
  {
    id: "c-8",
    name: "黄嘉豪",
    nickname: "豪豪",
    birthDate: "2023-11-08",
    gender: "男",
    allergies: ["花生"],
    heightCm: 82,
    weightKg: 10.8,
    guardians: [{ name: "黄妈妈", relation: "母亲", phone: "137****1156" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "最小月龄，分离焦虑较明显，需一对一过渡。",
    avatar: "👶",
  },
  {
    id: "c-9",
    name: "吴悦彤",
    nickname: "彤彤",
    birthDate: "2021-03-22",
    gender: "女",
    allergies: [],
    heightCm: 107,
    weightKg: 17.2,
    guardians: [{ name: "吴爸爸", relation: "父亲", phone: "139****6632" }],
    institutionId: "inst-1",
    className: "晨曦班",
    specialNotes: "精细动作发展突出，喜欢手工和拼贴。",
    avatar: "👧",
  },
  {
    id: "c-10",
    name: "孙宇航",
    nickname: "航航",
    birthDate: "2021-07-30",
    gender: "男",
    allergies: ["海鲜"],
    heightCm: 105,
    weightKg: 16.9,
    guardians: [{ name: "孙妈妈", relation: "母亲", phone: "136****3348" }, { name: "孙爸爸", relation: "父亲", phone: "138****4401" }],
    institutionId: "inst-1",
    className: "晨曦班",
    specialNotes: "好动，户外运动能力强，注意力持续时间偏短。",
    avatar: "👦",
  },
  {
    id: "c-11",
    name: "周诗雨",
    nickname: "诗诗",
    birthDate: "2022-12-05",
    gender: "女",
    allergies: [],
    heightCm: 95,
    weightKg: 14.0,
    guardians: [{ name: "周妈妈", relation: "母亲", phone: "155****8890" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "偏食明显，蔬菜摄入偏少，需餐食引导。",
    avatar: "👧",
  },
  {
    id: "c-12",
    name: "徐铭泽",
    nickname: "铭铭",
    birthDate: "2024-02-14",
    gender: "男",
    allergies: [],
    heightCm: 80,
    weightKg: 10.5,
    guardians: [{ name: "徐妈妈", relation: "母亲", phone: "132****5501" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "月龄较小，语言发育需持续观察。",
    avatar: "👶",
  },
  {
    id: "c-13",
    name: "何欣怡",
    nickname: "欣欣",
    birthDate: "2020-06-18",
    gender: "女",
    allergies: ["牛奶"],
    heightCm: 114,
    weightKg: 19.5,
    guardians: [{ name: "何妈妈", relation: "母亲", phone: "159****3342" }],
    institutionId: "inst-1",
    className: "晨曦班",
    specialNotes: "社交能力好，常主动帮助低龄同伴。",
    avatar: "👧",
  },
  {
    id: "c-14",
    name: "郑浩宇",
    nickname: "浩宇",
    birthDate: "2021-11-25",
    gender: "男",
    allergies: [],
    heightCm: 103,
    weightKg: 16.1,
    guardians: [{ name: "郑爸爸", relation: "父亲", phone: "186****7728" }],
    institutionId: "inst-1",
    className: "晨曦班",
    specialNotes: "睡眠规律较差，午休困难需引导。",
    avatar: "👦",
  },
  {
    id: "c-15",
    name: "马若曦",
    nickname: "曦曦",
    birthDate: "2023-04-09",
    gender: "女",
    allergies: ["虾"],
    heightCm: 90,
    weightKg: 13.0,
    guardians: [{ name: "马爸爸", relation: "父亲", phone: "150****6695" }],
    institutionId: "inst-1",
    className: "向阳班",
    specialNotes: "连续两周饮水量偏低，需重点关注。",
    avatar: "👧",
  },
  {
    id: "c-16",
    name: "高子墨",
    nickname: "墨墨",
    birthDate: "2022-02-28",
    gender: "男",
    allergies: [],
    heightCm: 99,
    weightKg: 15.3,
    guardians: [{ name: "高妈妈", relation: "母亲", phone: "131****2208" }],
    institutionId: "inst-1",
    className: "晨曦班",
    specialNotes: "情绪较敏感，转换环节需提前预告。",
    avatar: "👦",
  },
];

const ATTENDANCE_DEMO_PLAN: Record<string, DemoAttendanceSeed[]> = {
  "c-1": [
    { isPresent: true, checkInAt: "08:27", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:29", checkOutAt: "17:12" },
    { isPresent: true, checkInAt: "08:24", checkOutAt: "17:05" },
    { isPresent: false, absenceReason: "晨起咳嗽居家观察" },
    { isPresent: true, checkInAt: "08:31", checkOutAt: "17:16" },
    { isPresent: true, checkInAt: "08:20", checkOutAt: "17:15" },
    { isPresent: true, checkInAt: "08:25", checkOutAt: "17:10" },
  ],
  "c-2": [
    { isPresent: true, checkInAt: "08:36", checkOutAt: "17:18" },
    { isPresent: true, checkInAt: "08:34", checkOutAt: "17:20" },
    { isPresent: true, checkInAt: "08:37", checkOutAt: "17:17" },
    { isPresent: true, checkInAt: "08:32", checkOutAt: "17:21" },
    { isPresent: true, checkInAt: "08:30", checkOutAt: "17:20" },
    { isPresent: true, checkInAt: "08:33", checkOutAt: "17:19" },
    { isPresent: true, checkInAt: "08:35", checkOutAt: "17:20" },
  ],
  "c-3": [
    { isPresent: true, checkInAt: "08:43", checkOutAt: "17:11" },
    { isPresent: true, checkInAt: "08:42", checkOutAt: "17:13" },
    { isPresent: false, absenceReason: "家庭体检请假" },
    { isPresent: true, checkInAt: "08:39", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:41", checkOutAt: "17:14" },
    { isPresent: false, absenceReason: "发热请假" },
    { isPresent: true, checkInAt: "08:40", checkOutAt: "17:15" },
  ],
  "c-4": [
    { isPresent: true, checkInAt: "08:48", checkOutAt: "16:52" },
    { isPresent: false, absenceReason: "入托适应休整" },
    { isPresent: true, checkInAt: "08:50", checkOutAt: "16:40" },
    { isPresent: true, checkInAt: "08:46", checkOutAt: "16:45" },
    { isPresent: false, absenceReason: "家庭看护" },
    { isPresent: true, checkInAt: "08:45", checkOutAt: "16:38" },
    { isPresent: false, absenceReason: "居家观察" },
  ],
  "c-5": [
    { isPresent: true, checkInAt: "08:18", checkOutAt: "17:02" },
    { isPresent: true, checkInAt: "08:20", checkOutAt: "17:06" },
    { isPresent: true, checkInAt: "08:16", checkOutAt: "17:05" },
    { isPresent: true, checkInAt: "08:19", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:21", checkOutAt: "17:04" },
    { isPresent: true, checkInAt: "08:23", checkOutAt: "17:05" },
    { isPresent: true, checkInAt: "08:22", checkOutAt: "17:05" },
  ],
  "c-6": [
    { isPresent: true, checkInAt: "08:32", checkOutAt: "17:05" },
    { isPresent: true, checkInAt: "08:30", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:35", checkOutAt: "17:02" },
    { isPresent: true, checkInAt: "08:28", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:33", checkOutAt: "17:06" },
    { isPresent: false, absenceReason: "过敏反应居家观察" },
    { isPresent: true, checkInAt: "08:31", checkOutAt: "17:04" },
  ],
  "c-7": [
    { isPresent: true, checkInAt: "08:22", checkOutAt: "17:12" },
    { isPresent: true, checkInAt: "08:25", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:20", checkOutAt: "17:15" },
    { isPresent: true, checkInAt: "08:23", checkOutAt: "17:11" },
    { isPresent: true, checkInAt: "08:21", checkOutAt: "17:13" },
    { isPresent: true, checkInAt: "08:24", checkOutAt: "17:09" },
    { isPresent: true, checkInAt: "08:22", checkOutAt: "17:14" },
  ],
  "c-8": [
    { isPresent: true, checkInAt: "08:50", checkOutAt: "16:30" },
    { isPresent: false, absenceReason: "分离焦虑居家过渡" },
    { isPresent: true, checkInAt: "08:55", checkOutAt: "16:20" },
    { isPresent: false, absenceReason: "居家适应" },
    { isPresent: true, checkInAt: "08:46", checkOutAt: "16:35" },
    { isPresent: true, checkInAt: "08:48", checkOutAt: "16:28" },
    { isPresent: false, absenceReason: "家庭看护" },
  ],
  "c-9": [
    { isPresent: true, checkInAt: "08:15", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:18", checkOutAt: "17:05" },
    { isPresent: true, checkInAt: "08:16", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:14", checkOutAt: "17:06" },
    { isPresent: true, checkInAt: "08:17", checkOutAt: "17:12" },
    { isPresent: true, checkInAt: "08:19", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:15", checkOutAt: "17:05" },
  ],
  "c-10": [
    { isPresent: true, checkInAt: "08:38", checkOutAt: "17:18" },
    { isPresent: true, checkInAt: "08:40", checkOutAt: "17:15" },
    { isPresent: true, checkInAt: "08:36", checkOutAt: "17:20" },
    { isPresent: true, checkInAt: "08:35", checkOutAt: "17:16" },
    { isPresent: false, absenceReason: "感冒请假" },
    { isPresent: true, checkInAt: "08:42", checkOutAt: "17:14" },
    { isPresent: true, checkInAt: "08:39", checkOutAt: "17:18" },
  ],
  "c-11": [
    { isPresent: true, checkInAt: "08:28", checkOutAt: "17:02" },
    { isPresent: true, checkInAt: "08:26", checkOutAt: "17:05" },
    { isPresent: true, checkInAt: "08:30", checkOutAt: "17:00" },
    { isPresent: true, checkInAt: "08:25", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:27", checkOutAt: "17:03" },
    { isPresent: true, checkInAt: "08:29", checkOutAt: "17:06" },
    { isPresent: true, checkInAt: "08:26", checkOutAt: "17:04" },
  ],
  "c-12": [
    { isPresent: true, checkInAt: "08:45", checkOutAt: "16:40" },
    { isPresent: false, absenceReason: "疫苗接种" },
    { isPresent: true, checkInAt: "08:48", checkOutAt: "16:35" },
    { isPresent: true, checkInAt: "08:44", checkOutAt: "16:42" },
    { isPresent: false, absenceReason: "家庭看护" },
    { isPresent: true, checkInAt: "08:47", checkOutAt: "16:38" },
    { isPresent: true, checkInAt: "08:43", checkOutAt: "16:40" },
  ],
  "c-13": [
    { isPresent: true, checkInAt: "08:20", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:22", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:18", checkOutAt: "17:12" },
    { isPresent: true, checkInAt: "08:21", checkOutAt: "17:06" },
    { isPresent: true, checkInAt: "08:19", checkOutAt: "17:15" },
    { isPresent: true, checkInAt: "08:23", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:20", checkOutAt: "17:08" },
  ],
  "c-14": [
    { isPresent: true, checkInAt: "08:35", checkOutAt: "17:05" },
    { isPresent: true, checkInAt: "08:38", checkOutAt: "17:02" },
    { isPresent: true, checkInAt: "08:33", checkOutAt: "17:08" },
    { isPresent: false, absenceReason: "午睡困难居家调整" },
    { isPresent: true, checkInAt: "08:36", checkOutAt: "17:04" },
    { isPresent: true, checkInAt: "08:34", checkOutAt: "17:06" },
    { isPresent: true, checkInAt: "08:37", checkOutAt: "17:03" },
  ],
  "c-15": [
    { isPresent: true, checkInAt: "08:30", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:28", checkOutAt: "17:12" },
    { isPresent: true, checkInAt: "08:32", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:26", checkOutAt: "17:15" },
    { isPresent: true, checkInAt: "08:29", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:31", checkOutAt: "17:06" },
    { isPresent: true, checkInAt: "08:27", checkOutAt: "17:12" },
  ],
  "c-16": [
    { isPresent: true, checkInAt: "08:40", checkOutAt: "17:08" },
    { isPresent: true, checkInAt: "08:42", checkOutAt: "17:05" },
    { isPresent: false, absenceReason: "情绪不稳居家过渡" },
    { isPresent: true, checkInAt: "08:38", checkOutAt: "17:10" },
    { isPresent: true, checkInAt: "08:41", checkOutAt: "17:06" },
    { isPresent: true, checkInAt: "08:39", checkOutAt: "17:12" },
    { isPresent: true, checkInAt: "08:40", checkOutAt: "17:08" },
  ],
};

const INITIAL_ATTENDANCE: AttendanceRecord[] = Object.entries(ATTENDANCE_DEMO_PLAN).flatMap(([childId, plan]) =>
  plan.map((record, index) => ({
    id: `a-${childId}-${index + 1}`,
    childId,
    date: DEMO_WEEK_DATES[index],
    ...record,
  }))
);

const INITIAL_HEALTH_CHECKS: HealthCheckRecord[] = [
  ...DEMO_WEEK_DATES.map((date, index) =>
    createHealthRecord(
      `hc-c1-${index + 1}`,
      "c-1",
      date,
      [36.6, 36.5, 36.7, 37.4, 36.8, 36.6, 36.5][index],
      ["平稳", "愉快", "平稳", "烦躁", "困倦", "平稳", "积极/开心"][index],
      [
        "晨检状态稳定，能主动问好。",
        "入园后参与晨间拼图，配合度好。",
        "午睡前略黏老师，整体可安抚。",
        "晨检体温偏高，建议半日重点复测。",
        "昨晚入睡偏晚，早晨略困倦。",
        "晨起精神恢复，情绪较平稳。",
        "体温正常，情绪稳定。",
      ][index],
      "李老师",
      "教师"
    )
  ),
  ...DEMO_WEEK_DATES.map((date, index) =>
    createHealthRecord(
      `hc-c2-${index + 1}`,
      "c-2",
      date,
      [36.5, 36.4, 36.5, 36.6, 36.5, 36.4, 36.5][index],
      ["愉快", "愉快", "平稳", "愉快", "平稳", "愉快", "愉快"][index],
      [
        "晨练积极，动作协调。",
        "主动帮助同伴摆放积木。",
        "晨检正常，专注状态好。",
        "入园后迅速融入建构区活动。",
        "午睡后状态佳。",
        "晨检正常，愿意参与分享。",
        "体温正常，活力充足。",
      ][index],
      "李老师",
      "教师"
    )
  ),
  ...DEMO_WEEK_DATES.map((date, index) =>
    createHealthRecord(
      `hc-c3-${index + 1}`,
      "c-3",
      date,
      [36.4, 36.5, 36.3, 36.5, 36.6, 37.2, 36.6][index],
      ["愉快", "平稳", "平稳", "愉快", "愉快", "困倦", "愉快"][index],
      [
        "晨检正常，乐于组织同伴排队。",
        "精神状态良好，表达清晰。",
        "请假未到园，补录家庭晨检。",
        "晨间分享欲望强。",
        "体温正常，情绪积极。",
        "前一日晚睡，今日略困。",
        "体温正常，状态良好。",
      ][index],
      "陈园长",
      "机构管理员"
    )
  ),
  createHealthRecord("hc-c4-1", "c-4", DEMO_WEEK_DATES[3], 36.7, "平稳", "入托适应中，需要熟悉教师陪伴。", "李老师", "教师"),
  createHealthRecord("hc-c4-2", "c-4", DEMO_WEEK_DATES[5], 36.6, "哭闹", "分离焦虑较明显，10分钟后逐渐稳定。", "李老师", "教师"),
  createHealthRecord("hc-c5-1", "c-5", DEMO_WEEK_DATES[4], 36.5, "愉快", "自理表现良好。", "陈园长", "机构管理员"),
  createHealthRecord("hc-c5-2", "c-5", DEMO_WEEK_DATES[6], 36.5, "愉快", "晨检正常，能协助提醒同伴洗手。", "陈园长", "机构管理员"),
  // --- c-6 刘子轩：鸡蛋过敏，性格内向 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createHealthRecord(`hc-c6-${i + 1}`, "c-6", date,
      [36.5, 36.6, 36.4, 37.5, 36.7, 36.5, 36.6][i],
      ["平稳", "平稳", "愉快", "烦躁", "困倦", "平稳", "平稳"][i],
      ["性格内向但配合晨检，体温正常。", "状态稳定，安静参加晨间活动。", "今日情绪较好，主动和老师打招呼。", "午后体温升高，疑似过敏反应，已通知家长。", "体温回落，精神略困倦。", "恢复正常，情绪平稳。", "晨检正常，状态良好。"][i],
      "李老师", "教师")
  ),
  // --- c-7 杨梓涵：音乐敏感，适应良好 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createHealthRecord(`hc-c7-${i + 1}`, "c-7", date,
      [36.4, 36.5, 36.3, 36.5, 36.4, 36.5, 36.4][i],
      ["愉快", "愉快", "平稳", "愉快", "愉快", "愉快", "愉快"][i],
      ["入园哼唱歌曲，情绪积极。", "晨检配合度好，喜欢和同伴互动。", "精神状态好，安静参与美术活动。", "晨间表现活跃，积极回应老师提问。", "自主洗手后配合检查。", "情绪稳定，全天表现佳。", "体温正常，愉快入园。"][i],
      "李老师", "教师")
  ),
  // --- c-8 黄嘉豪：花生过敏，最小月龄，分离焦虑（5 条） ---
  createHealthRecord("hc-c8-1", "c-8", DEMO_WEEK_DATES[2], 36.8, "哭闹", "入园时哭闹约 15 分钟，经安抚后参与桌面活动。", "李老师", "教师"),
  createHealthRecord("hc-c8-2", "c-8", DEMO_WEEK_DATES[3], 36.6, "烦躁", "分离焦虑仍明显，午睡需要拍背安抚。", "李老师", "教师"),
  createHealthRecord("hc-c8-3", "c-8", DEMO_WEEK_DATES[4], 36.7, "困倦", "昨晚哭醒两次，今日精神不佳。", "李老师", "教师"),
  createHealthRecord("hc-c8-4", "c-8", DEMO_WEEK_DATES[5], 36.5, "平稳", "适应改善，入园哭闹缩短至 5 分钟。", "李老师", "教师"),
  createHealthRecord("hc-c8-5", "c-8", DEMO_WEEK_DATES[6], 36.8, "哭闹", "周一入园后分离焦虑有所反复。", "李老师", "教师"),
  // --- c-9 吴悦彤：精细动作突出，状态稳定 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createHealthRecord(`hc-c9-${i + 1}`, "c-9", date,
      [36.3, 36.4, 36.3, 36.5, 36.4, 36.3, 36.4][i],
      ["愉快", "愉快", "平稳", "愉快", "愉快", "平稳", "愉快"][i],
      ["精神饱满，主动整理书包。", "晨检配合好，手部灵活度佳。", "状态平稳，午前专注串珠活动。", "入园后快速进入活动状态。", "自主完成晨间签到贴纸。", "精神状态好，配合检查。", "体温正常，状态佳。"][i],
      "周老师", "教师")
  ),
  // --- c-10 孙宇航：海鲜过敏，好动注意力短 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createHealthRecord(`hc-c10-${i + 1}`, "c-10", date,
      [36.7, 36.5, 36.6, 36.8, 36.5, 36.6, 36.7][i],
      ["愉快", "烦躁", "平稳", "愉快", "烦躁", "平稳", "愉快"][i],
      ["精力充沛，入园后跑跳活跃。", "晨间等待过长略烦躁，需引导安抚。", "状态较平稳，配合晨检。", "户外活动后精神好，体温属运动后正常。", "排队等待时不耐烦，经引导后恢复。", "晨检配合，注意力保持约 5 分钟。", "入园积极，活动量大。"][i],
      "周老师", "教师")
  ),
  // --- c-11 周诗雨：偏食蔬菜少（6 条，day3 缺勤） ---
  createHealthRecord("hc-c11-1", "c-11", DEMO_WEEK_DATES[0], 36.4, "平稳", "晨检正常，午餐偏食明显。", "李老师", "教师"),
  createHealthRecord("hc-c11-2", "c-11", DEMO_WEEK_DATES[1], 36.5, "平稳", "状态稳定，仍不愿尝试新蔬菜。", "李老师", "教师"),
  createHealthRecord("hc-c11-3", "c-11", DEMO_WEEK_DATES[2], 36.4, "困倦", "精神略差，可能与营养单一有关。", "李老师", "教师"),
  createHealthRecord("hc-c11-4", "c-11", DEMO_WEEK_DATES[4], 36.5, "平稳", "晨检正常。", "李老师", "教师"),
  createHealthRecord("hc-c11-5", "c-11", DEMO_WEEK_DATES[5], 36.3, "愉快", "今日情绪佳，尝试了一小口西兰花。", "李老师", "教师"),
  createHealthRecord("hc-c11-6", "c-11", DEMO_WEEK_DATES[6], 36.5, "平稳", "状态平稳，饮食习惯待持续引导。", "李老师", "教师"),
  // --- c-12 徐铭泽：月龄小，语言发育观察（5 条） ---
  createHealthRecord("hc-c12-1", "c-12", DEMO_WEEK_DATES[0], 36.6, "平稳", "月龄较小，表情观察为主，状态平稳。", "李老师", "教师"),
  createHealthRecord("hc-c12-2", "c-12", DEMO_WEEK_DATES[1], 36.5, "平稳", "晨检配合，对声音有反应。", "李老师", "教师"),
  createHealthRecord("hc-c12-3", "c-12", DEMO_WEEK_DATES[2], 36.7, "困倦", "入园时有轻微困倦，午睡较早。", "李老师", "教师"),
  createHealthRecord("hc-c12-4", "c-12", DEMO_WEEK_DATES[3], 36.5, "平稳", "状态平稳，对老师有简短回应。", "李老师", "教师"),
  createHealthRecord("hc-c12-5", "c-12", DEMO_WEEK_DATES[6], 36.6, "愉快", "今日精神好，对老师挥手回应。", "李老师", "教师"),
  // --- c-13 何欣怡：牛奶过敏，社交能力强 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createHealthRecord(`hc-c13-${i + 1}`, "c-13", date,
      [36.4, 36.3, 36.5, 36.4, 36.5, 36.3, 36.4][i],
      ["愉快", "愉快", "愉快", "平稳", "愉快", "愉快", "愉快"][i],
      ["大方和同伴打招呼，情绪佳。", "主动帮助老师分发晨间水果。", "晨检配合，表达清晰。", "状态平稳，午前安静阅读。", "精神好，积极参与互动。", "晨检正常，性格开朗。", "体温正常，状态良好。"][i],
      "周老师", "教师")
  ),
  // --- c-14 郑浩宇：睡眠规律差，持续困倦 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createHealthRecord(`hc-c14-${i + 1}`, "c-14", date,
      [36.6, 36.7, 36.5, 36.8, 36.6, 36.5, 36.7][i],
      ["困倦", "困倦", "平稳", "困倦", "烦躁", "困倦", "困倦"][i],
      ["明显困倦，家长反馈昨晚 11 点才入睡。", "仍然较困，晨间活动参与度低。", "今日状态改善，午睡质量较好。", "再次出现困倦，入园后趴桌休息。", "睡眠不足导致情绪波动，需安抚。", "持续困倦，建议家园共同调整作息。", "表情疲惫，但能配合晨检。"][i],
      "周老师", "教师")
  ),
  // --- c-15 马若曦：虾过敏，饮水偏低（6 条，day2 缺勤） ---
  createHealthRecord("hc-c15-1", "c-15", DEMO_WEEK_DATES[0], 36.4, "平稳", "晨检正常，提醒多饮水。", "李老师", "教师"),
  createHealthRecord("hc-c15-2", "c-15", DEMO_WEEK_DATES[1], 36.5, "愉快", "情绪好，但饮水量仍偏少。", "李老师", "教师"),
  createHealthRecord("hc-c15-3", "c-15", DEMO_WEEK_DATES[3], 36.5, "愉快", "状态佳，已提醒定时喝水。", "李老师", "教师"),
  createHealthRecord("hc-c15-4", "c-15", DEMO_WEEK_DATES[4], 36.6, "平稳", "晨检正常，正在建立饮水习惯。", "李老师", "教师"),
  createHealthRecord("hc-c15-5", "c-15", DEMO_WEEK_DATES[5], 36.5, "平稳", "状态平稳，饮水有所改善。", "李老师", "教师"),
  createHealthRecord("hc-c15-6", "c-15", DEMO_WEEK_DATES[6], 36.4, "愉快", "体温正常，继续关注饮水。", "李老师", "教师"),
  // --- c-16 高子墨：情绪敏感，个别日手口眼异常 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createHealthRecord(`hc-c16-${i + 1}`, "c-16", date,
      [36.5, 36.6, 36.4, 36.7, 36.5, 36.4, 36.5][i],
      ["烦躁", "平稳", "哭闹", "平稳", "烦躁", "困倦", "平稳"][i],
      ["入园时因换教室哭闹，5 分钟后缓解。", "今日情绪较稳定，能参与集体活动。", "午睡前突然哭闹，对声音敏感，已安抚。", "经绘本引导后情绪改善明显。", "户外回教室时闹情绪，不愿进门。", "前一晚受惊吓，今日略困倦退缩。", "状态逐渐好转，能跟随指令。"][i],
      "周老师", "教师",
      i === 2 ? "异常" : "正常")
  ),
];

const INITIAL_TASK_CHECKINS: TaskCheckInRecord[] = [
  { id: "tc-1", childId: "c-1", taskId: "task_001", date: DEMO_WEEK_DATES[1] },
  { id: "tc-2", childId: "c-1", taskId: "task_003", date: DEMO_WEEK_DATES[3] },
  { id: "tc-3", childId: "c-1", taskId: "task_006", date: DEMO_WEEK_DATES[5] },
  { id: "tc-4", childId: "c-2", taskId: "task_002", date: DEMO_WEEK_DATES[2] },
  { id: "tc-5", childId: "c-2", taskId: "task_005", date: DEMO_WEEK_DATES[6] },
  { id: "tc-6", childId: "c-3", taskId: "task_003", date: DEMO_WEEK_DATES[0] },
  { id: "tc-7", childId: "c-3", taskId: "task_006", date: DEMO_WEEK_DATES[4] },
  { id: "tc-8", childId: "c-4", taskId: "task_001", date: DEMO_WEEK_DATES[3] },
  { id: "tc-9", childId: "c-5", taskId: "task_002", date: DEMO_WEEK_DATES[2] },
  { id: "tc-10", childId: "c-5", taskId: "task_004", date: DEMO_WEEK_DATES[5] },
  { id: "tc-11", childId: "c-6", taskId: "task_003", date: DEMO_WEEK_DATES[1] },
  { id: "tc-12", childId: "c-6", taskId: "task_005", date: DEMO_WEEK_DATES[4] },
  { id: "tc-13", childId: "c-7", taskId: "task_001", date: DEMO_WEEK_DATES[0] },
  { id: "tc-14", childId: "c-7", taskId: "task_006", date: DEMO_WEEK_DATES[6] },
  { id: "tc-15", childId: "c-8", taskId: "task_001", date: DEMO_WEEK_DATES[5] },
  { id: "tc-16", childId: "c-9", taskId: "task_002", date: DEMO_WEEK_DATES[1] },
  { id: "tc-17", childId: "c-9", taskId: "task_004", date: DEMO_WEEK_DATES[4] },
  { id: "tc-18", childId: "c-10", taskId: "task_003", date: DEMO_WEEK_DATES[3] },
  { id: "tc-19", childId: "c-10", taskId: "task_005", date: DEMO_WEEK_DATES[6] },
  { id: "tc-20", childId: "c-11", taskId: "task_001", date: DEMO_WEEK_DATES[2] },
  { id: "tc-21", childId: "c-12", taskId: "task_002", date: DEMO_WEEK_DATES[1] },
  { id: "tc-22", childId: "c-13", taskId: "task_003", date: DEMO_WEEK_DATES[0] },
  { id: "tc-23", childId: "c-13", taskId: "task_006", date: DEMO_WEEK_DATES[5] },
  { id: "tc-24", childId: "c-14", taskId: "task_001", date: DEMO_WEEK_DATES[2] },
  { id: "tc-25", childId: "c-14", taskId: "task_004", date: DEMO_WEEK_DATES[6] },
  { id: "tc-26", childId: "c-15", taskId: "task_005", date: DEMO_WEEK_DATES[3] },
  { id: "tc-27", childId: "c-16", taskId: "task_002", date: DEMO_WEEK_DATES[1] },
  { id: "tc-28", childId: "c-16", taskId: "task_006", date: DEMO_WEEK_DATES[4] },
];

const INITIAL_MEALS: MealRecord[] = [
  ...DEMO_WEEK_DATES.flatMap((date, index) => [
    createMealRecord(
      `m-c1-breakfast-${index + 1}`,
      "c-1",
      date,
      "早餐",
      [
        [index === 6 ? "牛奶" : "豆浆", "奶制品", index === 6 ? "180ml" : "180ml"],
        ["鸡蛋", "蛋白", "1个"],
        [index % 2 === 0 ? "南瓜小米粥" : "全麦面包", "主食", index % 2 === 0 ? "1碗" : "2片"],
        ...(index >= 4 ? [["蓝莓", "蔬果", "1小份"] as DemoMealFoodSeed] : []),
      ],
      [120, 110, 115, 90, 130, 135, 120][index],
      index >= 4 ? "偏好" : "正常",
      index >= 4 ? "林妈妈" : "李老师",
      index >= 4 ? "家长" : "教师",
      index === 3 ? "少量" : "适中",
      index === 6 ? "轻微腹胀" : undefined
    ),
    createMealRecord(
      `m-c1-lunch-${index + 1}`,
      "c-1",
      date,
      "午餐",
      [
        [index <= 2 ? "米饭" : "杂粮饭", "主食", "1碗"],
        [index % 2 === 0 ? "鸡肉" : "虾仁", "蛋白", "60g"],
        [index <= 2 ? "西兰花" : "胡萝卜西兰花", "蔬果", "60g"],
        ...(index >= 3 ? [["玉米粒", "蔬果", "30g"] as DemoMealFoodSeed] : []),
      ],
      [160, 145, 150, 155, 165, 170, 168][index],
      index === 3 ? "正常" : "偏好",
      "李老师",
      "教师"
    ),
  ]),
  ...DEMO_WEEK_DATES.map((date, index) =>
    createMealRecord(
      `m-c2-lunch-${index + 1}`,
      "c-2",
      date,
      "午餐",
      [
        [index % 2 === 0 ? "米饭" : "南瓜饭", "主食", "1碗"],
        [index % 3 === 0 ? "牛肉粒" : "鸡腿肉", "蛋白", "80g"],
        [index % 2 === 0 ? "西兰花" : "菠菜", "蔬果", "60g"],
        ["苹果丁", "蔬果", "40g"],
      ],
      [180, 175, 185, 190, 178, 182, 180][index],
      "偏好",
      "李老师",
      "教师",
      "充足"
    )
  ),
  ...DEMO_WEEK_DATES.map((date, index) =>
    createMealRecord(
      `m-c3-lunch-${index + 1}`,
      "c-3",
      date,
      "午餐",
      [
        [index % 2 === 0 ? "糙米饭" : "米饭", "主食", "1碗"],
        [index % 3 === 0 ? "牛肉粒" : "鸡胸肉", "蛋白", "75g"],
        [index % 2 === 0 ? "胡萝卜" : "西兰花", "蔬果", "55g"],
        ["橙子", "蔬果", "1小份"],
      ],
      [165, 160, 170, 168, 172, 158, 160][index],
      "偏好",
      "陈园长",
      "机构管理员",
      index === 5 ? "适中" : "充足"
    )
  ),
  createMealRecord("m-c4-1", "c-4", DEMO_WEEK_DATES[3], "午餐", [["软米饭", "主食", "半碗"], ["蒸蛋", "蛋白", "半份"], ["南瓜泥", "蔬果", "40g"]], 110, "正常", "李老师", "教师", "少量"),
  createMealRecord("m-c4-2", "c-4", DEMO_WEEK_DATES[5], "加餐", [["香蕉", "蔬果", "半根"], ["温水", "饮品", "120ml"]], 120, "偏好", "李老师", "教师"),
  createMealRecord("m-c5-1", "c-5", DEMO_WEEK_DATES[2], "午餐", [["米饭", "主食", "1碗"], ["鸡肉", "蛋白", "70g"], ["菜花", "蔬果", "60g"], ["紫薯", "主食", "30g"]], 170, "偏好", "陈园长", "机构管理员", "充足"),
  createMealRecord("m-c5-2", "c-5", DEMO_WEEK_DATES[4], "午餐", [["杂粮饭", "主食", "1碗"], ["鱼排", "蛋白", "70g"], ["西红柿炒蛋", "蔬果", "70g"], ["梨块", "蔬果", "40g"]], 175, "偏好", "陈园长", "机构管理员", "充足"),
  createMealRecord("m-c5-3", "c-5", DEMO_WEEK_DATES[6], "午餐", [["米饭", "主食", "1碗"], ["鸡肉丸", "蛋白", "70g"], ["油麦菜", "蔬果", "60g"], ["玉米粒", "蔬果", "30g"]], 168, "正常", "陈园长", "机构管理员", "充足"),
  // --- c-6 刘子轩：鸡蛋过敏，day3 配餐含鸡蛋（触发过敏预警） ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createMealRecord(`m-c6-lunch-${i + 1}`, "c-6", date, "午餐",
      [
        [i % 2 === 0 ? "米饭" : "面条", "主食", "1碗"],
        [i === 3 ? "鸡蛋羹" : i % 2 === 0 ? "鸡肉丝" : "豆腐", "蛋白", "60g"],
        [i % 3 === 0 ? "西兰花" : "胡萝卜", "蔬果", "50g"],
      ],
      [150, 140, 155, 130, 145, 150, 160][i], "正常", "李老师", "教师")
  ),
  // --- c-7 杨梓涵：饮食均衡 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createMealRecord(`m-c7-lunch-${i + 1}`, "c-7", date, "午餐",
      [
        [i % 2 === 0 ? "米饭" : "馒头", "主食", "1碗"],
        [i % 3 === 0 ? "鸡腿肉" : "鱼肉", "蛋白", "65g"],
        [i % 2 === 0 ? "番茄" : "黄瓜", "蔬果", "55g"],
        ["香蕉", "蔬果", "半根"],
      ],
      [155, 160, 150, 165, 158, 162, 155][i], "偏好", "李老师", "教师", "充足")
  ),
  // --- c-8 黄嘉豪：花生过敏，出勤少，day3 含花生（触发过敏预警） ---
  createMealRecord("m-c8-1", "c-8", DEMO_WEEK_DATES[2], "午餐", [["软米饭", "主食", "半碗"], ["蒸肉饼", "蛋白", "40g"], ["南瓜泥", "蔬果", "30g"]], 100, "正常", "李老师", "教师", "少量"),
  createMealRecord("m-c8-2", "c-8", DEMO_WEEK_DATES[3], "午餐", [["面条", "主食", "半碗"], ["花生碎拌菜", "蛋白", "30g"], ["西兰花泥", "蔬果", "30g"]], 110, "正常", "李老师", "教师", "少量"),
  createMealRecord("m-c8-3", "c-8", DEMO_WEEK_DATES[5], "午餐", [["软米饭", "主食", "半碗"], ["鸡肉泥", "蛋白", "40g"], ["胡萝卜泥", "蔬果", "30g"]], 105, "正常", "李老师", "教师", "少量"),
  createMealRecord("m-c8-4", "c-8", DEMO_WEEK_DATES[6], "加餐", [["香蕉", "蔬果", "半根"], ["温水", "饮品", "100ml"]], 100, "偏好", "李老师", "教师"),
  // --- c-9 吴悦彤：饮食正常 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createMealRecord(`m-c9-lunch-${i + 1}`, "c-9", date, "午餐",
      [
        [i % 2 === 0 ? "米饭" : "杂粮饭", "主食", "1碗"],
        [i % 3 === 0 ? "鸡肉" : i % 3 === 1 ? "牛肉粒" : "豆腐", "蛋白", "65g"],
        [i % 2 === 0 ? "菠菜" : "西兰花", "蔬果", "55g"],
        ...(i >= 4 ? [["苹果丁", "蔬果", "30g"] as DemoMealFoodSeed] : []),
      ],
      [155, 150, 160, 158, 165, 155, 160][i], "偏好", "周老师", "教师", "充足")
  ),
  // --- c-10 孙宇航：海鲜过敏，day4 含海鲜丸（触发过敏预警） ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createMealRecord(`m-c10-lunch-${i + 1}`, "c-10", date, "午餐",
      [
        ["米饭", "主食", "1碗"],
        [i % 3 === 0 ? "鸡腿肉" : i % 3 === 1 ? "牛肉" : "豆腐干", "蛋白", "75g"],
        [i % 2 === 0 ? "西兰花" : "白菜", "蔬果", "50g"],
        ...(i === 4 ? [["海鲜丸", "蛋白", "2个"] as DemoMealFoodSeed] : []),
      ],
      [170, 165, 175, 180, 168, 172, 175][i], i === 4 ? "正常" : "偏好", "周老师", "教师", "充足")
  ),
  // --- c-11 周诗雨：严重偏食（触发饮食单一 + 蔬果不足预警） ---
  createMealRecord("m-c11-1", "c-11", DEMO_WEEK_DATES[0], "午餐", [["米饭", "主食", "1碗"], ["肉末", "蛋白", "40g"]], 80, "拒食", "李老师", "教师", "少量"),
  createMealRecord("m-c11-2", "c-11", DEMO_WEEK_DATES[1], "午餐", [["米饭", "主食", "1碗"], ["肉末", "蛋白", "40g"]], 75, "拒食", "李老师", "教师", "少量"),
  createMealRecord("m-c11-3", "c-11", DEMO_WEEK_DATES[2], "午餐", [["米饭", "主食", "1碗"], ["鸡腿", "蛋白", "1个"]], 85, "正常", "李老师", "教师", "少量"),
  createMealRecord("m-c11-4", "c-11", DEMO_WEEK_DATES[4], "午餐", [["米饭", "主食", "1碗"], ["肉末", "蛋白", "40g"], ["豆腐", "蛋白", "30g"]], 80, "拒食", "李老师", "教师", "少量"),
  createMealRecord("m-c11-5", "c-11", DEMO_WEEK_DATES[5], "午餐", [["米饭", "主食", "1碗"], ["肉末", "蛋白", "40g"], ["胡萝卜丝", "蔬果", "20g"]], 90, "拒食", "李老师", "教师", "少量"),
  createMealRecord("m-c11-6", "c-11", DEMO_WEEK_DATES[6], "午餐", [["米饭", "主食", "1碗"], ["肉末", "蛋白", "40g"]], 70, "拒食", "李老师", "教师", "少量"),
  // --- c-12 徐铭泽：月龄小，辅食为主 ---
  createMealRecord("m-c12-1", "c-12", DEMO_WEEK_DATES[0], "午餐", [["软米粥", "主食", "1碗"], ["蒸蛋", "蛋白", "半份"], ["南瓜泥", "蔬果", "30g"]], 120, "正常", "李老师", "教师", "适中"),
  createMealRecord("m-c12-2", "c-12", DEMO_WEEK_DATES[1], "午餐", [["面糊", "主食", "1碗"], ["鱼泥", "蛋白", "30g"], ["胡萝卜泥", "蔬果", "30g"]], 115, "正常", "李老师", "教师", "适中"),
  createMealRecord("m-c12-3", "c-12", DEMO_WEEK_DATES[3], "午餐", [["软米粥", "主食", "1碗"], ["肉泥", "蛋白", "30g"], ["菜泥", "蔬果", "30g"]], 110, "正常", "李老师", "教师", "适中"),
  createMealRecord("m-c12-4", "c-12", DEMO_WEEK_DATES[6], "午餐", [["软面条", "主食", "半碗"], ["蒸蛋", "蛋白", "半份"], ["菠菜泥", "蔬果", "25g"]], 118, "正常", "李老师", "教师", "适中"),
  // --- c-13 何欣怡：牛奶过敏，day5 含牛奶面包（触发过敏预警） ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createMealRecord(`m-c13-lunch-${i + 1}`, "c-13", date, "午餐",
      [
        [i % 2 === 0 ? "米饭" : "馒头", "主食", "1碗"],
        [i % 3 === 0 ? "鸡肉" : "鱼肉丸", "蛋白", "65g"],
        [i % 2 === 0 ? "番茄" : "菠菜", "蔬果", "50g"],
        ...(i === 5 ? [["牛奶面包", "主食", "1片"] as DemoMealFoodSeed] : []),
      ],
      [150, 145, 155, 160, 148, 155, 150][i], "偏好", "周老师", "教师", i === 0 ? "适中" : "充足")
  ),
  // --- c-14 郑浩宇：睡眠差，饮食尚可 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createMealRecord(`m-c14-lunch-${i + 1}`, "c-14", date, "午餐",
      [
        ["米饭", "主食", "1碗"],
        [i % 3 === 0 ? "排骨" : i % 3 === 1 ? "鸡肉" : "鱼肉", "蛋白", "70g"],
        [i % 2 === 0 ? "油麦菜" : "丝瓜", "蔬果", "55g"],
      ],
      [160, 155, 165, 150, 158, 162, 155][i], "正常", "周老师", "教师")
  ),
  // --- c-15 马若曦：虾过敏，饮水偏低，day3 含虾仁（触发过敏预警） ---
  createMealRecord("m-c15-1", "c-15", DEMO_WEEK_DATES[0], "午餐", [["米饭", "主食", "1碗"], ["鸡肉", "蛋白", "60g"], ["白菜", "蔬果", "50g"]], 65, "正常", "李老师", "教师"),
  createMealRecord("m-c15-2", "c-15", DEMO_WEEK_DATES[1], "午餐", [["面条", "主食", "1碗"], ["豆腐", "蛋白", "70g"], ["菠菜", "蔬果", "45g"]], 70, "正常", "李老师", "教师"),
  createMealRecord("m-c15-3", "c-15", DEMO_WEEK_DATES[3], "午餐", [["米饭", "主食", "1碗"], ["虾仁", "蛋白", "50g"], ["西兰花", "蔬果", "50g"]], 60, "正常", "李老师", "教师"),
  createMealRecord("m-c15-4", "c-15", DEMO_WEEK_DATES[4], "午餐", [["米饭", "主食", "1碗"], ["牛肉粒", "蛋白", "65g"], ["胡萝卜", "蔬果", "45g"]], 75, "正常", "李老师", "教师"),
  createMealRecord("m-c15-5", "c-15", DEMO_WEEK_DATES[5], "午餐", [["杂粮饭", "主食", "1碗"], ["鸡肉", "蛋白", "60g"], ["番茄", "蔬果", "50g"]], 80, "正常", "李老师", "教师"),
  createMealRecord("m-c15-6", "c-15", DEMO_WEEK_DATES[6], "午餐", [["米饭", "主食", "1碗"], ["鱼肉", "蛋白", "65g"], ["油麦菜", "蔬果", "50g"]], 70, "正常", "李老师", "教师"),
  // --- c-16 高子墨：情绪敏感，饮食一般 ---
  ...DEMO_WEEK_DATES.map((date, i) =>
    createMealRecord(`m-c16-lunch-${i + 1}`, "c-16", date, "午餐",
      [
        [i % 2 === 0 ? "米饭" : "面条", "主食", "1碗"],
        [i % 3 === 0 ? "鸡肉" : "豆腐", "蛋白", "60g"],
        [i % 2 === 0 ? "青菜" : "西兰花", "蔬果", "50g"],
      ],
      [145, 140, 150, 135, 148, 145, 150][i], i <= 1 ? "拒食" : "正常", "周老师", "教师")
  ),
];

const INITIAL_GROWTH: GrowthRecord[] = [
  {
    id: "g-1",
    childId: "c-1",
    createdAt: `${DEMO_WEEK_DATES[2]} 11:35`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["午睡前", "需要安抚"],
    description: "自由活动转午睡环节出现短暂烦躁，阅读绘本后恢复。",
    needsAttention: true,
    followUpAction: "固定午睡前 5 分钟阅读过渡",
    reviewDate: shiftDate(TODAY, 1),
    reviewStatus: "待复查",
  },
  {
    id: "g-2",
    childId: "c-1",
    createdAt: `${DEMO_WEEK_DATES[4]} 20:30`,
    recorder: "林妈妈",
    recorderRole: "家长",
    category: "睡眠情况",
    tags: ["晚睡", "家庭观察"],
    description: "家庭反馈当晚较平时晚睡约 40 分钟，次日晨起困倦。",
    needsAttention: true,
    followUpAction: "提前半小时进入洗漱和绘本流程",
    reviewDate: TODAY,
    reviewStatus: "待复查",
  },
  {
    id: "g-3",
    childId: "c-1",
    createdAt: `${TODAY} 09:20`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["晨间", "恢复较快"],
    description: "今日晨间情绪较前几日平稳，能够跟随老师进入点名环节。",
    needsAttention: false,
    followUpAction: "继续巩固固定入园安抚流程",
    reviewStatus: "已完成",
  },
  {
    id: "g-4",
    childId: "c-2",
    createdAt: `${DEMO_WEEK_DATES[1]} 10:15`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "精细动作",
    tags: ["搭建", "专注"],
    description: "能独立完成积木桥梁搭建，持续专注约 18 分钟。",
    needsAttention: false,
    followUpAction: "增加拼插类材料复杂度",
    reviewStatus: "已完成",
  },
  {
    id: "g-5",
    childId: "c-2",
    createdAt: `${TODAY} 10:10`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "大动作",
    tags: ["平衡", "轮滑板车"],
    description: "户外活动中能稳定控制滑板车方向，转弯意识增强。",
    needsAttention: false,
    followUpAction: "继续加入障碍路线挑战",
    reviewStatus: "已完成",
  },
  {
    id: "g-6",
    childId: "c-3",
    createdAt: `${DEMO_WEEK_DATES[3]} 15:00`,
    recorder: "陈园长",
    recorderRole: "机构管理员",
    category: "语言表达",
    tags: ["分享", "表达清晰"],
    description: "在主题分享中能完整描述绘画作品，并主动回应同伴提问。",
    needsAttention: false,
    followUpAction: "安排担任小组分享主持",
    reviewStatus: "已完成",
  },
  {
    id: "g-7",
    childId: "c-3",
    createdAt: `${TODAY} 14:40`,
    recorder: "陈园长",
    recorderRole: "机构管理员",
    category: "社交互动",
    tags: ["协作", "带动同伴"],
    description: "在小组建构活动中主动分配角色，能照顾到低参与同伴。",
    needsAttention: false,
    followUpAction: "继续给予同伴协作任务",
    reviewStatus: "已完成",
  },
  {
    id: "g-8",
    childId: "c-4",
    createdAt: `${DEMO_WEEK_DATES[5]} 09:50`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "社交互动",
    tags: ["入托适应", "分离焦虑"],
    description: "刚入园时依恋家长，10 分钟后愿意在老师陪伴下参与桌面玩具。",
    needsAttention: true,
    followUpAction: "维持固定接园交接话术与过渡玩具",
    reviewDate: shiftDate(TODAY, 2),
    reviewStatus: "待复查",
  },
  {
    id: "g-9",
    childId: "c-5",
    createdAt: `${DEMO_WEEK_DATES[4]} 16:10`,
    recorder: "陈园长",
    recorderRole: "机构管理员",
    category: "如厕情况",
    tags: ["自理", "带动同伴"],
    description: "能够自主完成如厕和洗手流程，并提醒同伴按步骤进行。",
    needsAttention: false,
    followUpAction: "可作为生活自理示范小助手",
    reviewStatus: "已完成",
  },
  // --- c-1 补充：再增一条情绪 needsAttention，使 emotionCount=2 触发 AI ---
  {
    id: "g-10",
    childId: "c-1",
    createdAt: `${DEMO_WEEK_DATES[5]} 14:50`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["午睡后", "分离情绪"],
    description: "午睡醒来后突然哭泣，呼唤妈妈。安抚约 8 分钟后恢复参与活动。",
    needsAttention: true,
    followUpAction: "午睡后固定安抚流程，播放轻音乐过渡",
    reviewDate: shiftDate(TODAY, 1),
    reviewStatus: "待复查",
  },
  // --- c-4 分离焦虑相关 ---
  {
    id: "g-11",
    childId: "c-4",
    createdAt: `${DEMO_WEEK_DATES[3]} 09:30`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["入园适应", "分离焦虑"],
    description: "入园后哭泣约 12 分钟，家长离开后情绪逐渐缓解，能在老师陪伴下参与水彩活动。",
    needsAttention: true,
    followUpAction: "每日交接时使用固定安抚语和过渡玩具",
    reviewDate: shiftDate(TODAY, 3),
    reviewStatus: "待复查",
  },
  // --- c-5 独立进食 ---
  {
    id: "g-12",
    childId: "c-5",
    createdAt: `${DEMO_WEEK_DATES[6]} 12:20`,
    recorder: "陈园长",
    recorderRole: "机构管理员",
    category: "独立进食",
    tags: ["自主用勺", "不洒"],
    description: "午餐能自主用勺完成进食，基本不洒出碗外，进食速度适中。",
    needsAttention: false,
    followUpAction: "可逐步引导使用筷子",
    reviewStatus: "已完成",
  },
  // --- c-6 社交互动（内向） ---
  {
    id: "g-13",
    childId: "c-6",
    createdAt: `${DEMO_WEEK_DATES[2]} 10:40`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "社交互动",
    tags: ["内向", "旁观为主"],
    description: "在自由活动区多数时间独自拼拼图，同伴邀请时会短暂参与后退回。",
    needsAttention: true,
    followUpAction: "安排与性格温和的同伴进行两人小组活动",
    reviewDate: shiftDate(TODAY, 2),
    reviewStatus: "待复查",
  },
  {
    id: "g-14",
    childId: "c-6",
    createdAt: `${DEMO_WEEK_DATES[5]} 15:10`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["安静", "稳定"],
    description: "过渡到户外活动时情绪平稳，主动排队，未出现抗拒。",
    needsAttention: false,
    followUpAction: "继续观察社交参与度变化",
    reviewStatus: "已完成",
  },
  // --- c-7 精细动作 + 大动作 ---
  {
    id: "g-15",
    childId: "c-7",
    createdAt: `${DEMO_WEEK_DATES[1]} 10:30`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "精细动作",
    tags: ["剪纸", "手指灵活"],
    description: "能沿虚线剪出简单图形，手指协调性超同龄平均水平。",
    needsAttention: false,
    followUpAction: "增加折纸和串珠挑战",
    reviewStatus: "已完成",
  },
  {
    id: "g-16",
    childId: "c-7",
    createdAt: `${DEMO_WEEK_DATES[4]} 15:50`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "大动作",
    tags: ["跳跃", "协调"],
    description: "户外活动中能双脚跳过 20cm 高障碍，着地平稳。",
    needsAttention: false,
    followUpAction: "增加单脚跳练习",
    reviewStatus: "已完成",
  },
  // --- c-8 社交互动（分离焦虑） ---
  {
    id: "g-17",
    childId: "c-8",
    createdAt: `${DEMO_WEEK_DATES[4]} 09:45`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "社交互动",
    tags: ["入托适应", "依恋老师"],
    description: "整个上午紧跟老师，不愿独自走向同伴区域。参与集体活动时需手牵手引导。",
    needsAttention: true,
    followUpAction: "维持固定照护人，逐步拉大距离",
    reviewDate: shiftDate(TODAY, 3),
    reviewStatus: "待复查",
  },
  // --- c-9 精细动作 + 握笔 ---
  {
    id: "g-18",
    childId: "c-9",
    createdAt: `${DEMO_WEEK_DATES[0]} 11:05`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "精细动作",
    tags: ["串珠", "专注"],
    description: "能独立完成 15 颗串珠项链，持续专注约 20 分钟。",
    needsAttention: false,
    followUpAction: "可引入更复杂的拼插积木",
    reviewStatus: "已完成",
  },
  {
    id: "g-19",
    childId: "c-9",
    createdAt: `${DEMO_WEEK_DATES[3]} 10:00`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "握笔",
    tags: ["涂鸦", "正确握姿"],
    description: "握笔姿势较标准，能沿轮廓涂色基本不出界。",
    needsAttention: false,
    followUpAction: "引导描写简单线条",
    reviewStatus: "已完成",
  },
  // --- c-10 大动作 + 情绪 ---
  {
    id: "g-20",
    childId: "c-10",
    createdAt: `${DEMO_WEEK_DATES[2]} 15:20`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "大动作",
    tags: ["奔跑", "体力充沛"],
    description: "户外活动中跑动积极，速度和协调性好，但不太遵守轮流规则。",
    needsAttention: false,
    followUpAction: "通过接力赛等结构化游戏引导规则意识",
    reviewStatus: "已完成",
  },
  {
    id: "g-21",
    childId: "c-10",
    createdAt: `${DEMO_WEEK_DATES[5]} 11:30`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["急躁", "等待困难"],
    description: "午餐排队时因等待过久推搡同伴，经提醒后道歉。",
    needsAttention: true,
    followUpAction: "提前告知流程顺序，减少空等时间",
    reviewDate: shiftDate(TODAY, 2),
    reviewStatus: "待复查",
  },
  // --- c-11 独立进食（偏食） ---
  {
    id: "g-22",
    childId: "c-11",
    createdAt: `${DEMO_WEEK_DATES[1]} 12:30`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "独立进食",
    tags: ["偏食", "蔬菜拒绝"],
    description: "午餐将所有蔬菜拨到碗边不吃，仅吃米饭和肉末。已多次引导但效果有限。",
    needsAttention: true,
    followUpAction: "与家长沟通家庭饮食习惯，尝试将蔬菜融入肉馅",
    reviewDate: shiftDate(TODAY, 3),
    reviewStatus: "待复查",
  },
  // --- c-13 社交互动 + 语言表达 ---
  {
    id: "g-23",
    childId: "c-13",
    createdAt: `${DEMO_WEEK_DATES[2]} 10:20`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "社交互动",
    tags: ["主动交往", "乐于分享"],
    description: "主动邀请新入园同伴一起搭积木，耐心等待对方选择积木颜色。",
    needsAttention: false,
    followUpAction: "可担任新成员融入引导小帮手",
    reviewStatus: "已完成",
  },
  {
    id: "g-24",
    childId: "c-13",
    createdAt: `${DEMO_WEEK_DATES[5]} 14:30`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "语言表达",
    tags: ["叙事", "逻辑清晰"],
    description: "能完整讲述周末经历，使用'先…然后…最后'连接词。",
    needsAttention: false,
    followUpAction: "鼓励在分享环节担任小主持",
    reviewStatus: "已完成",
  },
  // --- c-14 睡眠问题（2 条 needsAttention 触发 AI） + 情绪 ---
  {
    id: "g-25",
    childId: "c-14",
    createdAt: `${DEMO_WEEK_DATES[1]} 13:45`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "睡眠情况",
    tags: ["难入睡", "翻来覆去"],
    description: "午睡时翻转超过 30 分钟才入睡，期间多次坐起。家长反馈前一晚 11 点半才睡。",
    needsAttention: true,
    followUpAction: "建议家庭 9 点前关闭屏幕，建立固定睡前流程",
    reviewDate: shiftDate(TODAY, 1),
    reviewStatus: "待复查",
  },
  {
    id: "g-26",
    childId: "c-14",
    createdAt: `${DEMO_WEEK_DATES[4]} 13:30`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "睡眠情况",
    tags: ["午睡困难", "易醒"],
    description: "午睡仅 25 分钟即醒，醒后哭闹不愿再躺下。连续多日午睡质量差。",
    needsAttention: true,
    followUpAction: "尝试白噪音辅助入睡，安排靠窗安静床位",
    reviewDate: TODAY,
    reviewStatus: "待复查",
  },
  {
    id: "g-27",
    childId: "c-14",
    createdAt: `${DEMO_WEEK_DATES[5]} 10:50`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["疲惫", "易怒"],
    description: "因长期睡眠不足，上午活动时对同伴抢玩具反应过激，大声哭闹。",
    needsAttention: true,
    followUpAction: "结合睡眠干预，降低活动节奏",
    reviewDate: shiftDate(TODAY, 1),
    reviewStatus: "待复查",
  },
  // --- c-15 独立进食 ---
  {
    id: "g-28",
    childId: "c-15",
    createdAt: `${DEMO_WEEK_DATES[3]} 12:10`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "独立进食",
    tags: ["饮水少", "需提醒"],
    description: "午餐进食正常但全天饮水不足 100ml，需多次提醒才喝水。",
    needsAttention: true,
    followUpAction: "设置半小时饮水提醒，使用有刻度的趣味水杯",
    reviewDate: shiftDate(TODAY, 2),
    reviewStatus: "待复查",
  },
  // --- c-16 情绪敏感（2 条 needsAttention 触发 AI）+ 社交 ---
  {
    id: "g-29",
    childId: "c-16",
    createdAt: `${DEMO_WEEK_DATES[0]} 09:40`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["敏感", "环境变化"],
    description: "中转换教室后情绪崩溃，蹲在角落哭泣约 10 分钟。经拥抱安抚后逐渐平复。",
    needsAttention: true,
    followUpAction: "提前告知环境变化，使用图片卡预告流程",
    reviewDate: shiftDate(TODAY, 1),
    reviewStatus: "待复查",
  },
  {
    id: "g-30",
    childId: "c-16",
    createdAt: `${DEMO_WEEK_DATES[4]} 14:20`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["声音敏感", "户外回撤"],
    description: "户外活动结束铃声响起后捂耳哭泣，不愿回到教室。需要单独陪伴 5 分钟过渡。",
    needsAttention: true,
    followUpAction: "减少突发声响刺激，改用视觉信号提示转换",
    reviewDate: TODAY,
    reviewStatus: "待复查",
  },
  {
    id: "g-31",
    childId: "c-16",
    createdAt: `${DEMO_WEEK_DATES[6]} 10:30`,
    recorder: "周老师",
    recorderRole: "教师",
    category: "社交互动",
    tags: ["退缩", "需引导"],
    description: "小组活动时不主动参与，等待老师点名才开口。与熟悉同伴有少量眼神交流。",
    needsAttention: true,
    followUpAction: "安排固定小组搭档，创造安全社交情境",
    reviewDate: shiftDate(TODAY, 2),
    reviewStatus: "待复查",
  },
  // --- c-12 语言发育 ---
  {
    id: "g-32",
    childId: "c-12",
    createdAt: `${DEMO_WEEK_DATES[3]} 11:20`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "语言表达",
    tags: ["月龄小", "咿呀阶段"],
    description: "能发出'妈''不'等单音节词，对老师叫名有明确回头反应。",
    needsAttention: true,
    followUpAction: "增加一对一语言互动时间，搭配指物命名训练",
    reviewDate: shiftDate(TODAY, 7),
    reviewStatus: "待复查",
  },
];

const INITIAL_FEEDBACKS: GuardianFeedback[] = [
  {
    id: "fb-1",
    childId: "c-1",
    date: DEMO_WEEK_DATES[2],
    status: "已知晓",
    content: "已收到午睡前情绪提醒，今晚会提前开始洗漱和绘本流程。",
    createdBy: "林妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-2",
    childId: "c-1",
    date: DEMO_WEEK_DATES[4],
    status: "在家已配合",
    content: "昨晚已按建议提前半小时关灯，入睡时间比前天提前约 20 分钟。",
    createdBy: "林妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-3",
    childId: "c-1",
    date: TODAY,
    status: "今晚反馈",
    content: "今天计划继续保持固定睡前故事时光，明早反馈晨起状态。",
    createdBy: "林妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-4",
    childId: "c-2",
    date: DEMO_WEEK_DATES[5],
    status: "已知晓",
    content: "已看到老师关于精细动作优势的记录，周末会一起做拼插游戏。",
    createdBy: "张爸爸",
    createdByRole: "家长",
  },
  {
    id: "fb-5",
    childId: "c-3",
    date: DEMO_WEEK_DATES[3],
    status: "在家已配合",
    content: "感谢老师鼓励，孩子回家主动讲述了今天的分享内容。",
    createdBy: "陈奶奶",
    createdByRole: "家长",
  },
  {
    id: "fb-6",
    childId: "c-1",
    date: TODAY,
    status: "在家已配合",
    content: "已看到老师关于今日情绪恢复的反馈，会继续保持稳定接送节奏。",
    createdBy: "林妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-7",
    childId: "c-4",
    date: DEMO_WEEK_DATES[5],
    status: "已知晓",
    content: "已了解孩子在园分离焦虑情况，会按老师建议在家做短暂分离练习。",
    createdBy: "陈爸爸",
    createdByRole: "家长",
  },
  {
    id: "fb-8",
    childId: "c-6",
    date: DEMO_WEEK_DATES[3],
    status: "在家已配合",
    content: "已确认孩子过敏发作原因，今后会在家和园双重确认餐单中不含鸡蛋。",
    createdBy: "刘妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-9",
    childId: "c-8",
    date: DEMO_WEEK_DATES[6],
    status: "已知晓",
    content: "感谢老师的耐心安抚，周末会带孩子来园熟悉环境，希望缓解分离焦虑。",
    createdBy: "黄妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-10",
    childId: "c-9",
    date: DEMO_WEEK_DATES[3],
    status: "在家已配合",
    content: "已看到精细动作发展记录，很高兴！周末给她买了新的拼插积木。",
    createdBy: "吴爸爸",
    createdByRole: "家长",
  },
  {
    id: "fb-11",
    childId: "c-10",
    date: DEMO_WEEK_DATES[5],
    status: "已知晓",
    content: "了解了孩子注意力短的情况，在家会减少电子屏幕时间，增加专注力训练。",
    createdBy: "孙妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-12",
    childId: "c-11",
    date: DEMO_WEEK_DATES[4],
    status: "在家已配合",
    content: "已收到偏食引导建议，在家尝试了蔬菜肉馅饺子，孩子吃了几个。",
    createdBy: "周爸爸",
    createdByRole: "家长",
  },
  {
    id: "fb-13",
    childId: "c-11",
    date: TODAY,
    status: "今晚反馈",
    content: "今晚继续尝试把蔬菜藏在面食里，看孩子能不能接受。",
    createdBy: "周爸爸",
    createdByRole: "家长",
  },
  {
    id: "fb-14",
    childId: "c-13",
    date: DEMO_WEEK_DATES[5],
    status: "已知晓",
    content: "已看到牛奶过敏提醒，会联系园方确认明天的加餐是否含奶制品。",
    createdBy: "何妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-15",
    childId: "c-14",
    date: DEMO_WEEK_DATES[2],
    status: "在家已配合",
    content: "昨晚按建议提前 1 小时关灯，孩子 10 点左右入睡，比之前有进步。",
    createdBy: "郑妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-16",
    childId: "c-14",
    date: DEMO_WEEK_DATES[5],
    status: "在家已配合",
    content: "坚持了 3 天提前关灯，但昨晚又反复，孩子不肯放下玩具。继续努力。",
    createdBy: "郑妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-17",
    childId: "c-15",
    date: DEMO_WEEK_DATES[4],
    status: "已知晓",
    content: "了解到孩子饮水偏低，已经准备了带刻度的小水壶，会在家鼓励定时喝水。",
    createdBy: "马爸爸",
    createdByRole: "家长",
  },
  {
    id: "fb-18",
    childId: "c-16",
    date: DEMO_WEEK_DATES[1],
    status: "在家已配合",
    content: "感谢老师告知情绪波动情况，在家已减少大声说话，给孩子更多安静空间。",
    createdBy: "高妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-19",
    childId: "c-16",
    date: DEMO_WEEK_DATES[5],
    status: "今晚反馈",
    content: "这两天在家情绪确实比较敏感，我们在用绘本引导识别情绪，明天反馈效果。",
    createdBy: "高妈妈",
    createdByRole: "家长",
  },
];

function monthsBetween(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  let months = (now.getFullYear() - date.getFullYear()) * 12;
  months += now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) months -= 1;
  return Math.max(months, 0);
}

export function getAgeBandFromBirthDate(birthDate: string): AgeBand {
  const months = monthsBetween(birthDate);
  if (months < 6) return "0–6个月";
  if (months < 12) return "6–12个月";
  if (months < 36) return "1–3岁";
  if (months < 72) return "3–6岁";
  return "6–7岁";
}

export function getAgeText(birthDate: string) {
  const months = monthsBetween(birthDate);
  if (months < 12) return `${months}个月`;
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths === 0 ? `${years}岁` : `${years}岁${restMonths}个月`;
}

export function formatDisplayDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeRecords(records: MealRecord[]) {
  return records.map((record) => ({
    ...record,
    nutritionScore: calcNutritionScore(record.foods, record.waterMl, record.preference),
  }));
}

function createDemoSnapshot(): AppStateSnapshot {
  return {
    children: INITIAL_CHILDREN.map((child) => ({
      ...child,
      allergies: [...child.allergies],
      guardians: child.guardians.map((guardian) => ({ ...guardian })),
    })),
    attendance: INITIAL_ATTENDANCE.map((record) => ({ ...record })),
    meals: INITIAL_MEALS.map((record) => ({
      ...record,
      foods: record.foods.map((food) => ({ ...food })),
    })),
    growth: INITIAL_GROWTH.map((record) => ({
      ...record,
      tags: [...record.tags],
      selectedIndicators: record.selectedIndicators ? [...record.selectedIndicators] : undefined,
    })),
    feedback: INITIAL_FEEDBACKS.map((record) => ({ ...record })),
    health: INITIAL_HEALTH_CHECKS.map((record) => ({ ...record })),
    taskCheckIns: INITIAL_TASK_CHECKINS.map((record) => ({ ...record })),
    updatedAt: new Date().toISOString(),
  };
}

function filterChildrenByUser(children: Child[], user: User) {
  if (user.role === "机构管理员") {
    return children.filter((child) => child.institutionId === user.institutionId);
  }
  if (user.role === "教师") {
    return children.filter(
      (child) => child.institutionId === user.institutionId && child.className === user.className
    );
  }
  return children.filter((child) => child.parentUserId === user.id || user.childIds?.includes(child.id));
}

function startOfDay(dateString: string) {
  return new Date(`${dateString}T00:00:00`).getTime();
}

function isInLastDays(dateString: string, days: number) {
  const pureDate = dateString.split(" ")[0];
  const diff = startOfDay(TODAY) - startOfDay(pureDate);
  return diff >= 0 && diff <= (days - 1) * 24 * 60 * 60 * 1000;
}

function containsAllergyWord(foods: FoodItem[], allergies: string[]) {
  const allergyWords = allergies.map((item) => item.toLowerCase());
  return foods.some((food) => allergyWords.some((word) => food.name.toLowerCase().includes(word)));
}

export function calcNutritionScore(
  foods: FoodItem[],
  waterMl = 0,
  preference: PreferenceStatus = "正常"
) {
  if (foods.length === 0) return 0;
  const categorySet = new Set(foods.map((food) => food.category));
  const categoryScore = Math.min(categorySet.size * 18, 54);
  const varietyScore = Math.min(foods.length * 7, 21);
  const hydrationScore = Math.min(Math.round(waterMl / 20), 15);
  const preferenceScore = preference === "偏好" ? 10 : preference === "正常" ? 7 : 2;
  return Math.min(categoryScore + varietyScore + hydrationScore + preferenceScore, 100);
}

export function AppProvider({ children: childNodes }: { children: ReactNode }) {
  const [users] = useState<User[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [shouldPromoteDemoSnapshot, setShouldPromoteDemoSnapshot] = useState(false);
  const [childrenList, setChildrenList] = useState<Child[]>(INITIAL_CHILDREN);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE);
  const [mealRecords, setMealRecords] = useState<MealRecord[]>(normalizeRecords(INITIAL_MEALS));
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>(INITIAL_GROWTH);
  const [guardianFeedbacks, setGuardianFeedbacks] = useState<GuardianFeedback[]>(INITIAL_FEEDBACKS);
  const [healthCheckRecords, setHealthCheckRecords] = useState<HealthCheckRecord[]>(INITIAL_HEALTH_CHECKS);
  const [taskCheckInRecords, setTaskCheckInRecords] = useState<TaskCheckInRecord[]>(INITIAL_TASK_CHECKINS);
  const isAuthenticated = Boolean(currentUserId);

  useEffect(() => {
    const storedChildren = readStorage<Child[]>(STORAGE_KEYS.children, INITIAL_CHILDREN);
    const storedAttendance = readStorage<AttendanceRecord[]>(STORAGE_KEYS.attendance, INITIAL_ATTENDANCE);
    const storedMeals = normalizeRecords(readStorage<MealRecord[]>(STORAGE_KEYS.meals, INITIAL_MEALS));
    const storedGrowth = readStorage<GrowthRecord[]>(STORAGE_KEYS.growth, INITIAL_GROWTH);
    const storedFeedback = readStorage<GuardianFeedback[]>(STORAGE_KEYS.feedback, INITIAL_FEEDBACKS);
    const storedHealth = readStorage<HealthCheckRecord[]>(STORAGE_KEYS.health, INITIAL_HEALTH_CHECKS);
    const storedTaskCheckIns = readStorage<TaskCheckInRecord[]>(STORAGE_KEYS.taskCheckIns, INITIAL_TASK_CHECKINS);

    setChildrenList(storedChildren);
    setAttendanceRecords(storedAttendance);
    setMealRecords(storedMeals);
    setGrowthRecords(storedGrowth);
    setGuardianFeedbacks(storedFeedback);
    setHealthCheckRecords(storedHealth);
    setTaskCheckInRecords(storedTaskCheckIns);
    setShouldPromoteDemoSnapshot(
      readStorage<string | null>(STORAGE_KEYS.remoteDemoSeed, null) !== REMOTE_DEMO_SEED_VERSION
    );
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setRemoteReady(true);
      return;
    }
    setRemoteReady(false);

    if (shouldPromoteDemoSnapshot) {
      setRemoteReady(true);
      return;
    }

    let active = true;
    const loadRemoteSnapshot = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { ok: boolean; snapshot: AppStateSnapshot | null };
        if (!data.ok || !data.snapshot || !active) {
          return;
        }

        setChildrenList(data.snapshot.children);
        setAttendanceRecords(data.snapshot.attendance);
        setMealRecords(normalizeRecords(data.snapshot.meals));
        setGrowthRecords(data.snapshot.growth);
        setGuardianFeedbacks(data.snapshot.feedback);
        setHealthCheckRecords(data.snapshot.health);
        setTaskCheckInRecords(data.snapshot.taskCheckIns);
      } catch {
        // Remote sync is optional for local development fallback.
      } finally {
        if (active) setRemoteReady(true);
      }
    };

    void loadRemoteSnapshot();

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, shouldPromoteDemoSnapshot]);

  useEffect(() => {
    if (!storageReady) return;
    writeStorage(STORAGE_KEYS.children, childrenList);
    writeStorage(STORAGE_KEYS.attendance, attendanceRecords);
    writeStorage(STORAGE_KEYS.meals, mealRecords);
    writeStorage(STORAGE_KEYS.growth, growthRecords);
    writeStorage(STORAGE_KEYS.feedback, guardianFeedbacks);
    writeStorage(STORAGE_KEYS.health, healthCheckRecords);
    writeStorage(STORAGE_KEYS.taskCheckIns, taskCheckInRecords);
  }, [
    storageReady,
    childrenList,
    attendanceRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    healthCheckRecords,
    taskCheckInRecords,
  ]);

  useEffect(() => {
    if (!storageReady || !remoteReady || !isAuthenticated) return;

    const timer = window.setTimeout(async () => {
      const snapshot: AppStateSnapshot = {
        children: childrenList,
        attendance: attendanceRecords,
        meals: mealRecords,
        growth: growthRecords,
        feedback: guardianFeedbacks,
        health: healthCheckRecords,
        taskCheckIns: taskCheckInRecords,
        updatedAt: new Date().toISOString(),
      };

      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot }),
        });

        if (response.ok && shouldPromoteDemoSnapshot) {
          writeStorage(STORAGE_KEYS.remoteDemoSeed, REMOTE_DEMO_SEED_VERSION);
          setShouldPromoteDemoSnapshot(false);
        }
      } catch {
        // Keep local persistence available if remote sync fails.
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    storageReady,
    remoteReady,
    isAuthenticated,
    childrenList,
    attendanceRecords,
    mealRecords,
    growthRecords,
    guardianFeedbacks,
    healthCheckRecords,
    taskCheckInRecords,
    shouldPromoteDemoSnapshot,
  ]);

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          if (active) setCurrentUserId(null);
          return;
        }
        const data = (await response.json()) as { userId?: string | null };
        const userExists = users.some((user) => user.id === data.userId);
        if (active) {
          setCurrentUserId(userExists ? (data.userId ?? null) : null);
        }
      } catch {
        if (active) setCurrentUserId(null);
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    void loadSession();
    return () => {
      active = false;
    };
  }, [users]);

  const currentUser = users.find((user) => user.id === currentUserId) ?? users[1] ?? users[0];
  const visibleChildren = useMemo(() => filterChildrenByUser(childrenList, currentUser), [childrenList, currentUser]);

  const getAttendanceByDate = (date: string, childId?: string) => {
    const ids = childId ? [childId] : visibleChildren.map((child) => child.id);
    return attendanceRecords.filter((record) => record.date === date && ids.includes(record.childId));
  };

  const getTodayAttendance = () => getAttendanceByDate(TODAY);

  const presentChildren = visibleChildren.filter((child) => {
    const todayAttendance = attendanceRecords.find(
      (record) => record.childId === child.id && record.date === TODAY
    );
    return todayAttendance?.isPresent;
  });

  const switchUser = (userId: string) => {
    const canSwitch = users.some((user) => user.id === userId);
    if (canSwitch) setCurrentUserId(userId);
  };

  const login = async (userId: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string; userId?: string };
      if (!response.ok || !result.ok || !result.userId) {
        return { ok: false, error: result.error ?? "登录失败，请检查账号和密码。" };
      }
      setCurrentUserId(result.userId);
      return { ok: true };
    } catch {
      return { ok: false, error: "网络异常，请稍后重试。" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setCurrentUserId(null);
    }
  };

  const addChild = (child: NewChildInput) => {
    const avatars = child.gender === "女" ? GIRL_AVATARS : BOY_AVATARS;
    setChildrenList((prev) => [
      ...prev,
      {
        ...child,
        id: `c-${Date.now()}`,
        avatar: avatars[Math.floor(Math.random() * avatars.length)],
      },
    ]);
  };

  const removeChild = (id: string) => {
    setChildrenList((prev) => prev.filter((child) => child.id !== id));
    setAttendanceRecords((prev) => prev.filter((record) => record.childId !== id));
    setMealRecords((prev) => prev.filter((record) => record.childId !== id));
    setGrowthRecords((prev) => prev.filter((record) => record.childId !== id));
    setGuardianFeedbacks((prev) => prev.filter((record) => record.childId !== id));
  };

  const markAttendance = (input: Omit<AttendanceRecord, "id">) => {
    setAttendanceRecords((prev) => {
      const existing = prev.find((record) => record.childId === input.childId && record.date === input.date);
      if (!existing) {
        return [...prev, { ...input, id: `a-${Date.now()}` }];
      }
      return prev.map((record) => (record.id === existing.id ? { ...existing, ...input } : record));
    });
  };

  const toggleTodayAttendance = (childId: string) => {
    const existing = attendanceRecords.find((record) => record.childId === childId && record.date === TODAY);
    if (!existing) {
      markAttendance({ childId, date: TODAY, isPresent: true, checkInAt: "08:30", checkOutAt: "17:10" });
      return;
    }
    markAttendance({
      ...existing,
      isPresent: !existing.isPresent,
      absenceReason: existing.isPresent ? "临时请假" : undefined,
      checkInAt: existing.isPresent ? undefined : "08:35",
      checkOutAt: existing.isPresent ? undefined : "17:15",
    });
  };

  const upsertMealRecord = (input: UpsertMealRecordInput) => {
    setMealRecords((prev) => {
      const existing = prev.find(
        (record) =>
          record.childId === input.childId && record.date === input.date && record.meal === input.meal
      );
      const next: MealRecord = {
        ...(existing ?? { id: `m-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` }),
        ...input,
        nutritionScore: calcNutritionScore(input.foods, input.waterMl, input.preference),
      };
      if (!existing) return [...prev, next];
      return prev.map((record) => (record.id === existing.id ? next : record));
    });
  };

  const previewBulkMealTemplate = (
    input: Pick<BulkMealTemplateInput, "foods" | "excludedChildIds" | "onlyChildIds">
  ): BulkPreviewItem[] => {
    const base = presentChildren
      .filter((child) => (input.onlyChildIds ? input.onlyChildIds.includes(child.id) : true))
      .map((child) => {
        const blockedByAllergy = containsAllergyWord(input.foods, child.allergies);
        return {
          childId: child.id,
          childName: child.name,
          blockedByAllergy,
          blockedReason: blockedByAllergy ? `检测到过敏词：${child.allergies.join("、")}` : undefined,
          excluded: Boolean(input.excludedChildIds?.includes(child.id)),
        };
      });
    return base;
  };

  const bulkApplyMealTemplate = (input: BulkMealTemplateInput) => {
    const preview = previewBulkMealTemplate({
      foods: input.foods,
      excludedChildIds: input.excludedChildIds,
      onlyChildIds: input.onlyChildIds,
    });
    const applied: string[] = [];
    const blocked: string[] = [];

    preview.forEach((item) => {
      if (item.excluded || item.blockedByAllergy) {
        blocked.push(item.childId);
        return;
      }
      upsertMealRecord({ ...input, childId: item.childId });
      applied.push(item.childId);
    });

    return { applied, blocked };
  };

  const addGrowthRecord = (input: AddGrowthRecordInput) => {
    setGrowthRecords((prev) => [
      {
        id: `g-${Date.now()}`,
        childId: input.childId,
        createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        recorder: currentUser.name,
        recorderRole: currentUser.role,
        category: input.category,
        tags: input.tags,
        description: input.description,
        needsAttention: input.needsAttention,
        followUpAction: input.followUpAction,
        reviewDate: input.reviewDate,
        reviewStatus: input.reviewStatus ?? (input.needsAttention ? "待复查" : "已完成"),
      },
      ...prev,
    ]);
  };

  const addGuardianFeedback = (input: Omit<GuardianFeedback, "id" | "createdBy" | "createdByRole">) => {
    setGuardianFeedbacks((prev) => [
      {
        ...input,
        id: `fb-${Date.now()}`,
        createdBy: currentUser.name,
        createdByRole: currentUser.role,
      },
      ...prev,
    ]);
  };

  const getTodayHealthCheck = (childId: string) => {
    return healthCheckRecords.find((record) => record.childId === childId && record.date === TODAY);
  };

  const upsertHealthCheck = (input: Omit<HealthCheckRecord, "id" | "date" | "checkedBy" | "checkedByRole"> & { date?: string }) => {
    setHealthCheckRecords((prev) => {
      const existingIndex = prev.findIndex((record) => record.childId === input.childId && record.date === (input.date || TODAY));
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...input };
        return next;
      }
      return [
        {
          ...input,
          id: `hc-${Date.now()}`,
          date: input.date || TODAY,
          checkedBy: currentUser.name,
          checkedByRole: currentUser.role,
        },
        ...prev,
      ];
    });
  };

  const getTaskCheckIns = (childId: string, date?: string) => {
    return taskCheckInRecords.filter((record) => record.childId === childId && (!date || record.date === date));
  };

  const checkInTask = (childId: string, taskId: string, date: string) => {
    setTaskCheckInRecords((prev) => {
      const exists = prev.some((r) => r.childId === childId && r.taskId === taskId && r.date === date);
      if (exists) return prev;
      return [...prev, { id: `tc-${Date.now()}`, childId, taskId, date }];
    });
  };

  const getTodayMealRecords = (childIds?: string[]) => {
    const ids = childIds ?? visibleChildren.map((child) => child.id);
    return mealRecords.filter((record) => record.date === TODAY && ids.includes(record.childId));
  };

  const getWeeklyDietTrend = (childId?: string): WeeklyDietTrend => {
    const targetIds = childId ? [childId] : visibleChildren.map((child) => child.id);
    const weeklyRecords = mealRecords.filter(
      (record) => targetIds.includes(record.childId) && isInLastDays(record.date, 7)
    );

    if (weeklyRecords.length === 0) {
      return { balancedRate: 0, vegetableDays: 0, proteinDays: 0, stapleDays: 0, hydrationAvg: 0, monotonyDays: 0 };
    }

    const byDay = new Map<string, MealRecord[]>();
    weeklyRecords.forEach((record) => {
      const key = `${record.childId}-${record.date}`;
      byDay.set(key, [...(byDay.get(key) ?? []), record]);
    });

    let balancedDays = 0;
    let vegetableDays = 0;
    let proteinDays = 0;
    let stapleDays = 0;
    let waterTotal = 0;
    let monotonyDays = 0;

    byDay.forEach((records) => {
      const categories = new Set(records.flatMap((record) => record.foods.map((food) => food.category)));
      if (categories.has("蔬果")) vegetableDays += 1;
      if (categories.has("蛋白")) proteinDays += 1;
      if (categories.has("主食")) stapleDays += 1;
      if (categories.has("蔬果") && categories.has("蛋白") && categories.has("主食")) balancedDays += 1;

      const names = new Set(records.flatMap((record) => record.foods.map((food) => food.name)));
      if (names.size <= 3) monotonyDays += 1;

      waterTotal += records.reduce((sum, record) => sum + record.waterMl, 0);
    });

    return {
      balancedRate: Math.round((balancedDays / byDay.size) * 100),
      vegetableDays,
      proteinDays,
      stapleDays,
      hydrationAvg: Math.round(waterTotal / byDay.size),
      monotonyDays,
    };
  };

  const getSmartInsights = () => {
    const insights: SmartInsight[] = [];
    const visibleIds = visibleChildren.map((child) => child.id);

    visibleChildren.forEach((child) => {
      const ageBand = getAgeBandFromBirthDate(child.birthDate);
      const weekly = getWeeklyDietTrend(child.id);
      const childGrowth = growthRecords.filter(
        (record) => record.childId === child.id && isInLastDays(record.createdAt, 7)
      );
      const childMeals = mealRecords.filter(
        (record) => record.childId === child.id && isInLastDays(record.date, 7)
      );

      if (weekly.monotonyDays >= 3) {
        insights.push({
          id: `ins-monotony-${child.id}`,
          childId: child.id,
          level: "warning",
          title: `${child.name} 最近饮食偏单一`,
          description: "连续多天食物种类较少，建议在加餐加入不同颜色蔬果和优质蛋白。",
          tags: ["饮食", "单一"],
        });
      }

      if (weekly.vegetableDays <= 2) {
        insights.push({
          id: `ins-veg-${child.id}`,
          childId: child.id,
          level: "warning",
          title: `${child.name} 蔬果摄入偏低`,
          description: "建议在午餐和加餐中增加深色蔬菜与水果切块。",
          tags: ["饮食", "蔬果不足"],
        });
      }

      const allergyRiskMeals = childMeals.filter((record) => containsAllergyWord(record.foods, child.allergies));
      if (allergyRiskMeals.length > 0) {
        insights.push({
          id: `ins-allergy-${child.id}`,
          childId: child.id,
          level: "warning",
          title: `${child.name} 存在过敏联动风险`,
          description: "饮食记录中出现疑似过敏词，建议复核餐单并进行替代食材处理。",
          tags: ["过敏", "饮食安全"],
        });
      }

      const emotionCount = childGrowth.filter((record) => record.category === "情绪表现" && record.needsAttention).length;
      const sleepCount = childGrowth.filter((record) => record.category === "睡眠情况" && record.needsAttention).length;
      if (emotionCount >= 2 || sleepCount >= 2) {
        insights.push({
          id: `ins-emotion-sleep-${child.id}`,
          childId: child.id,
          level: "warning",
          title: `${child.name} 情绪与睡眠连续异常`,
          description: "近 3-7 天情绪/睡眠关注记录偏多，建议家园共同复盘作息和环境触发因素。",
          tags: ["情绪", "睡眠", "连续异常"],
        });
      }

      if (ageBand === "1–3岁") {
        const writingObservation = childGrowth.some(
          (record) => record.category === "握笔" || record.category === "精细动作"
        );
        if (!writingObservation) {
          insights.push({
            id: `ins-age-band-${child.id}`,
            childId: child.id,
            level: "info",
            title: `${child.name} 可加强精细动作记录`,
            description: "1–3 岁阶段建议增加抓握、串珠、涂鸦等观察记录，便于形成发展轨迹。",
            tags: ["年龄段", "精细动作"],
          });
        }
      }
    });

    const todayAttendance = getTodayAttendance();
    const todayPresent = todayAttendance.filter((item) => item.isPresent).length;
    const todayMeals = getTodayMealRecords(visibleIds).length;

    insights.unshift({
      id: "ins-role-ready",
      level: "success",
      title: "角色权限模型已就绪",
      description: "已支持家长/教师/机构管理员的前端数据权限视图，可对接 Supabase Auth + RLS。",
      tags: ["Auth", "RLS", currentUser.role],
    });

    insights.unshift({
      id: "ins-operation",
      level: todayPresent > 0 ? "success" : "info",
      title: `今日运营概况：出勤 ${todayPresent} 人，饮食记录 ${todayMeals} 条`,
      description: "可继续推进‘批量录入→例外处理→家长反馈’闭环流程。",
      tags: ["运营", "闭环"],
    });

    return insights.slice(0, 10);
  };

  const getParentFeed = () => {
    const parentChildren = currentUser.role === "家长"
      ? visibleChildren
      : visibleChildren.filter((child) => Boolean(child.parentUserId));

    return parentChildren.map((child) => {
      const todayMeals = mealRecords.filter((record) => record.childId === child.id && record.date === TODAY);
      const todayGrowth = growthRecords.filter(
        (record) => record.childId === child.id && record.createdAt.startsWith(TODAY)
      );
      const suggestions = getSmartInsights().filter((insight) => !insight.childId || insight.childId === child.id);
      const feedbacks = guardianFeedbacks.filter((feedback) => feedback.childId === child.id && feedback.date === TODAY);

      return {
        child,
        todayMeals,
        todayGrowth,
        weeklyTrend: getWeeklyDietTrend(child.id),
        suggestions,
        feedbacks,
      };
    });
  };

  const getAdminBoardData = (): AdminBoardData => {
    const scopeChildren = filterChildrenByUser(childrenList, users.find((u) => u.role === "机构管理员") ?? currentUser);

    const highAttentionChildren = scopeChildren
      .map((child) => {
        const count = growthRecords.filter(
          (record) => record.childId === child.id && record.needsAttention && isInLastDays(record.createdAt, 7)
        ).length;
        return { childId: child.id, childName: child.name, count };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const lowHydrationChildren = scopeChildren
      .map((child) => ({
        childId: child.id,
        childName: child.name,
        hydrationAvg: getWeeklyDietTrend(child.id).hydrationAvg,
      }))
      .sort((a, b) => a.hydrationAvg - b.hydrationAvg)
      .slice(0, 5);

    const lowVegTrendChildren = scopeChildren
      .map((child) => ({
        childId: child.id,
        childName: child.name,
        vegetableDays: getWeeklyDietTrend(child.id).vegetableDays,
      }))
      .sort((a, b) => a.vegetableDays - b.vegetableDays)
      .slice(0, 5);

    return { highAttentionChildren, lowHydrationChildren, lowVegTrendChildren };
  };

  const resetDemoData = async () => {
    const snapshot = createDemoSnapshot();

    setChildrenList(snapshot.children);
    setAttendanceRecords(snapshot.attendance);
    setMealRecords(normalizeRecords(snapshot.meals));
    setGrowthRecords(snapshot.growth);
    setGuardianFeedbacks(snapshot.feedback);
    setHealthCheckRecords(snapshot.health);
    setTaskCheckInRecords(snapshot.taskCheckIns);
    setShouldPromoteDemoSnapshot(true);

    writeStorage(STORAGE_KEYS.children, snapshot.children);
    writeStorage(STORAGE_KEYS.attendance, snapshot.attendance);
    writeStorage(STORAGE_KEYS.meals, normalizeRecords(snapshot.meals));
    writeStorage(STORAGE_KEYS.growth, snapshot.growth);
    writeStorage(STORAGE_KEYS.feedback, snapshot.feedback);
    writeStorage(STORAGE_KEYS.health, snapshot.health);
    writeStorage(STORAGE_KEYS.taskCheckIns, snapshot.taskCheckIns);
    writeStorage<string | null>(STORAGE_KEYS.remoteDemoSeed, null);

    if (!isAuthenticated) {
      return { remoteSynced: false };
    }

    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      });

      if (response.ok) {
        writeStorage(STORAGE_KEYS.remoteDemoSeed, REMOTE_DEMO_SEED_VERSION);
        setShouldPromoteDemoSnapshot(false);
        return { remoteSynced: true };
      }
    } catch {
      // Fallback to the normal sync effect if the immediate remote write fails.
    }

    return { remoteSynced: false };
  };

  return (
    <AppContext.Provider
      value={{
        users,
        currentUser,
        isAuthenticated,
        authLoading,
        login,
        logout,
        switchUser,
        children: childrenList,
        visibleChildren,
        attendanceRecords,
        getAttendanceByDate,
        getTodayAttendance,
        markAttendance,
        toggleTodayAttendance,
        healthCheckRecords,
        upsertHealthCheck,
        getTodayHealthCheck,
        taskCheckInRecords,
        checkInTask,
        getTaskCheckIns,
        presentChildren,
        addChild,
        removeChild,
        mealRecords,
        upsertMealRecord,
        bulkApplyMealTemplate,
        previewBulkMealTemplate,
        growthRecords,
        addGrowthRecord,
        guardianFeedbacks,
        addGuardianFeedback,
        getTodayMealRecords,
        getWeeklyDietTrend,
        getSmartInsights,
        getParentFeed,
        getAdminBoardData,
        resetDemoData,
      }}
    >
      {authLoading ? (
        <div className="flex min-h-[calc(100vh-64px)] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm text-slate-400">加载中…</p>
          </div>
        </div>
      ) : (
        childNodes
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
