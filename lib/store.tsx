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
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  children: "childcare.children.v1",
  attendance: "childcare.attendance.v1",
  meals: "childcare.meals.v1",
  growth: "childcare.growth.v1",
  feedback: "childcare.feedback.v1",
  health: "childcare.health.v1",
  taskCheckIns: "childcare.taskcheckins.v1",
} as const;

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

const INITIAL_USERS: User[] = [
  { id: "u-admin", name: "陈园长", role: "机构管理员", avatar: "🧑‍💼", institutionId: "inst-1" },
  { id: "u-teacher", name: "李老师", role: "教师", avatar: "👩‍🏫", institutionId: "inst-1", className: "向阳班" },
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
];

const INITIAL_ATTENDANCE: AttendanceRecord[] = [
  { id: "a-1", childId: "c-1", date: TODAY, isPresent: true, checkInAt: "08:25", checkOutAt: "17:10" },
  { id: "a-2", childId: "c-2", date: TODAY, isPresent: true, checkInAt: "08:35", checkOutAt: "17:20" },
  { id: "a-3", childId: "c-3", date: TODAY, isPresent: true, checkInAt: "08:40", checkOutAt: "17:15" },
  { id: "a-4", childId: "c-4", date: TODAY, isPresent: false, absenceReason: "居家观察" },
  { id: "a-5", childId: "c-5", date: TODAY, isPresent: true, checkInAt: "08:22", checkOutAt: "17:05" },
  { id: "a-6", childId: "c-1", date: shiftDate(TODAY, -1), isPresent: true, checkInAt: "08:20", checkOutAt: "17:15" },
  { id: "a-7", childId: "c-2", date: shiftDate(TODAY, -1), isPresent: true, checkInAt: "08:33", checkOutAt: "17:19" },
  { id: "a-8", childId: "c-3", date: shiftDate(TODAY, -1), isPresent: false, absenceReason: "发热请假" },
];

const INITIAL_HEALTH_CHECKS: HealthCheckRecord[] = [
  {
    id: "hc-1",
    childId: "c-1",
    date: TODAY,
    temperature: 36.5,
    mood: "积极/开心",
    handMouthEye: "正常",
    isAbnormal: false,
    checkedBy: "u-3",
    checkedByRole: "教师",
    remark: "体温正常，情绪稳定"
  }
];

const INITIAL_TASK_CHECKINS: TaskCheckInRecord[] = [];

const INITIAL_MEALS: MealRecord[] = [
  {
    id: "m-1",
    childId: "c-1",
    date: TODAY,
    meal: "早餐",
    foods: [
      { id: "f-1", name: "牛奶", category: "奶制品", amount: "180ml" },
      { id: "f-2", name: "鸡蛋", category: "蛋白", amount: "1个" },
      { id: "f-3", name: "全麦面包", category: "主食", amount: "2片" },
    ],
    intakeLevel: "适中",
    preference: "偏好",
    allergyReaction: "轻微腹胀",
    waterMl: 120,
    nutritionScore: 0,
    recordedBy: "李老师",
    recordedByRole: "教师",
  },
  {
    id: "m-2",
    childId: "c-2",
    date: TODAY,
    meal: "午餐",
    foods: [
      { id: "f-4", name: "米饭", category: "主食", amount: "1碗" },
      { id: "f-5", name: "鸡肉", category: "蛋白", amount: "80g" },
      { id: "f-6", name: "西兰花", category: "蔬果", amount: "60g" },
    ],
    intakeLevel: "适中",
    preference: "正常",
    waterMl: 180,
    nutritionScore: 0,
    recordedBy: "李老师",
    recordedByRole: "教师",
  },
  {
    id: "m-3",
    childId: "c-3",
    date: TODAY,
    meal: "午餐",
    foods: [
      { id: "f-7", name: "米饭", category: "主食", amount: "1碗" },
      { id: "f-8", name: "牛肉粒", category: "蛋白", amount: "70g" },
      { id: "f-9", name: "胡萝卜", category: "蔬果", amount: "50g" },
    ],
    intakeLevel: "充足",
    preference: "偏好",
    waterMl: 160,
    nutritionScore: 0,
    recordedBy: "陈园长",
    recordedByRole: "机构管理员",
  },
  {
    id: "m-4",
    childId: "c-1",
    date: shiftDate(TODAY, -1),
    meal: "晚餐",
    foods: [
      { id: "f-10", name: "面条", category: "主食", amount: "1碗" },
      { id: "f-11", name: "鸡蛋", category: "蛋白", amount: "1个" },
    ],
    intakeLevel: "适中",
    preference: "正常",
    waterMl: 140,
    nutritionScore: 0,
    recordedBy: "林妈妈",
    recordedByRole: "家长",
  },
  {
    id: "m-5",
    childId: "c-1",
    date: shiftDate(TODAY, -2),
    meal: "加餐",
    foods: [
      { id: "f-12", name: "苹果", category: "蔬果", amount: "1小份" },
      { id: "f-13", name: "酸奶", category: "奶制品", amount: "100ml" },
    ],
    intakeLevel: "适中",
    preference: "偏好",
    waterMl: 90,
    nutritionScore: 0,
    recordedBy: "林妈妈",
    recordedByRole: "家长",
  },
];

const INITIAL_GROWTH: GrowthRecord[] = [
  {
    id: "g-1",
    childId: "c-1",
    createdAt: `${TODAY} 09:20`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "情绪表现",
    tags: ["午睡前", "轻微波动"],
    description: "午睡前出现短暂烦躁，在阅读安抚后恢复稳定。",
    needsAttention: true,
    followUpAction: "增加午睡前过渡活动",
    reviewDate: shiftDate(TODAY, 2),
    reviewStatus: "待复查",
  },
  {
    id: "g-2",
    childId: "c-2",
    createdAt: `${TODAY} 10:10`,
    recorder: "李老师",
    recorderRole: "教师",
    category: "精细动作",
    tags: ["搭建", "专注"],
    description: "能够独立完成积木拼搭，持续专注约15分钟。",
    needsAttention: false,
    followUpAction: "继续提供精细动作挑战材料",
    reviewStatus: "已完成",
  },
  {
    id: "g-3",
    childId: "c-1",
    createdAt: `${shiftDate(TODAY, -1)} 20:30`,
    recorder: "林妈妈",
    recorderRole: "家长",
    category: "睡眠情况",
    tags: ["晚睡", "家庭观察"],
    description: "昨晚入睡时间较平日晚40分钟，晨起情绪一般。",
    needsAttention: true,
    followUpAction: "家庭提前30分钟睡前流程",
    reviewDate: shiftDate(TODAY, 1),
    reviewStatus: "待复查",
  },
  {
    id: "g-4",
    childId: "c-3",
    createdAt: `${shiftDate(TODAY, -2)} 15:00`,
    recorder: "陈园长",
    recorderRole: "机构管理员",
    category: "语言表达",
    tags: ["分享", "表达清晰"],
    description: "在分享环节能够完整描述自己的绘画作品。",
    needsAttention: false,
    followUpAction: "安排小组主持机会",
    reviewStatus: "已完成",
  },
];

const INITIAL_FEEDBACKS: GuardianFeedback[] = [
  {
    id: "fb-1",
    childId: "c-1",
    date: TODAY,
    status: "已知晓",
    content: "已看到老师关于午睡前情绪观察，今晚会提前读绘本。",
    createdBy: "林妈妈",
    createdByRole: "家长",
  },
  {
    id: "fb-2",
    childId: "c-1",
    date: TODAY,
    status: "在家已配合",
    content: "在家已按建议进行睡前流程，今晚继续观察。",
    createdBy: "林妈妈",
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
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setRemoteReady(true);
      return;
    }
    setRemoteReady(false);

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
  }, [authLoading, isAuthenticated]);

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
        await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot }),
        });
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
