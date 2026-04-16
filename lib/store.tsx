"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normalizeAppStateSnapshot, type AppStateSnapshot } from "@/lib/persistence/snapshot";
import {
  filterChildrenForSessionUser,
  scopeSnapshotForSessionUser,
} from "@/lib/persistence/state-scope";
import type { ConsultationResult, MobileDraft, MobileDraftSyncStatus, ReminderItem } from "@/lib/ai/types";
import {
  normalizeGuardianFeedbackCollection,
  normalizeParentStructuredFeedback,
} from "@/lib/feedback/normalize";
import type {
  GuardianFeedback as SharedGuardianFeedback,
  GuardianFeedbackInput,
} from "@/lib/feedback/types";
import {
  DEMO_ACCOUNTS,
  type AccountRole,
  type DemoAccount,
  type RegisterAccountInput,
  type SessionUser,
} from "@/lib/auth/accounts";
import { buildInterventionCardFromConsultation, type InterventionCard } from "@/lib/agent/intervention-card";
import { getLocalToday, isDateWithinLastDays, normalizeLocalDate, shiftLocalDate, startOfLocalDay } from "@/lib/date";
import { emptyInstitutionSnapshot } from "@/lib/persistence/bootstrap";
import { materializeTasksFromLegacy, pickActiveTask } from "@/lib/tasks/task-model";
import type { CanonicalTask, TaskOwnerRole } from "@/lib/tasks/types";
import { buildDemoConsultationResults } from "@/lib/demo/demo-consultations";

export type Role = AccountRole;
export type GuardianFeedback = SharedGuardianFeedback;
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
const DEMO_DATASET_VERSION = "v4-demo-recovery-hotfix";

const TODAY = getLocalToday();
const UNAUTHENTICATED_USER: User = {
  id: "guest",
  name: "未登录用户",
  role: "家长",
  avatar: "",
  institutionId: "",
  childIds: [],
  accountKind: "normal",
};

export type User = SessionUser;

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

export interface MealAiEvaluation {
  mealScore: number;
  mealComment: string;
  todayScore: number;
  todayComment: string;
  recentScore: number;
  recentComment: string;
  suggestions: string[];
  generatedAt: string;
  model?: string;
}

export interface MealRecord {
  id: string;
  childId: string;
  date: string;
  meal: MealType;
  foods: FoodItem[];
  photoUrls?: string[];
  intakeLevel: IntakeLevel;
  preference: PreferenceStatus;
  allergyReaction?: string;
  waterMl: number;
  nutritionScore: number;
  aiEvaluation?: MealAiEvaluation;
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
  mediaUrls?: string[];
}

export interface ParentMediaItem {
  id: string;
  childId: string;
  recordedAt: string;
  title: string;
  summary: string;
  source: "growth" | "meal";
  mediaUrl: string;
  thumbnailUrl: string;
  tags: string[];
}

export interface TaskCheckInRecord {
  id: string;
  childId: string;
  taskId: string;
  date: string;
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
  weeklyGrowth: GrowthRecord[];
  weeklyTrend: WeeklyDietTrend;
  suggestions: SmartInsight[];
  feedbacks: GuardianFeedback[];
  recentFeedbacks: GuardianFeedback[];
  latestFeedback?: GuardianFeedback;
  hasFeedbackToday: boolean;
  mediaGallery: ParentMediaItem[];
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
  aiEvaluation?: MealAiEvaluation;
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

export interface PersistAppSnapshotResult {
  status: "saved" | "local_only" | "failed";
  message: string;
  persistedAt: string;
  error?: string;
}

interface AppContextType {
  demoAccounts: DemoAccount[];
  currentUser: User;
  isAuthenticated: boolean;
  authLoading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string; user?: User }>;
  loginWithDemo: (accountId: string) => Promise<{ ok: boolean; error?: string; user?: User }>;
  register: (input: RegisterAccountInput & { confirmPassword: string }) => Promise<{ ok: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;

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
  addGuardianFeedback: (input: GuardianFeedbackInput) => void;
  interventionCards: InterventionCard[];
  consultations: ConsultationResult[];
  mobileDrafts: MobileDraft[];
  reminders: ReminderItem[];
  tasks: CanonicalTask[];
  upsertInterventionCard: (card: InterventionCard) => void;
  upsertConsultation: (consultation: ConsultationResult) => void;
  upsertTask: (task: CanonicalTask) => void;
  saveMobileDraft: (draft: MobileDraft) => void;
  markMobileDraftSyncStatus: (draftId: string, syncStatus: MobileDraftSyncStatus) => void;
  persistAppSnapshotNow: (
    override?: Partial<AppStateSnapshot>
  ) => Promise<PersistAppSnapshotResult>;
  upsertReminder: (reminder: ReminderItem) => void;
  updateReminderStatus: (reminderId: string, status: ReminderItem["status"]) => void;
  getTasksForChild: (childId: string, ownerRole?: TaskOwnerRole) => CanonicalTask[];
  getActiveTask: (childId: string, ownerRole?: TaskOwnerRole) => CanonicalTask | undefined;
  getChildInterventionCard: (childId: string) => InterventionCard | undefined;
  getConsultationsForChild: (childId: string) => ConsultationResult[];
  getLatestConsultationForChild: (childId: string) => ConsultationResult | undefined;
  getLatestConsultations: () => ConsultationResult[];

  getTodayMealRecords: (childIds?: string[]) => MealRecord[];
  getWeeklyDietTrend: (childId?: string) => WeeklyDietTrend;
  getSmartInsights: () => SmartInsight[];
  getParentFeed: () => ParentFeed[];
  getAdminBoardData: () => AdminBoardData;
  resetDemoData: () => Promise<{ remoteSynced: boolean }>;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  children: "children.v3",
  attendance: "attendance.v3",
  meals: "meals.v3",
  growth: "growth.v3",
  feedback: "feedback.v3",
  health: "health.v3",
  taskCheckIns: "taskcheckins.v3",
  interventionCards: "interventioncards.v1",
  consultations: "consultations.v1",
  mobileDrafts: "mobile-drafts.v1",
  reminders: "reminders.v1",
  tasks: "tasks.v1",
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

function readScopedSnapshot(namespace: string, fallbackSnapshot: AppStateSnapshot): AppStateSnapshot {
  const snapshot = {
    children: readStorage<Child[]>(buildScopedStorageKey(namespace, "children"), fallbackSnapshot.children),
    attendance: readStorage<AttendanceRecord[]>(
      buildScopedStorageKey(namespace, "attendance"),
      fallbackSnapshot.attendance
    ),
    meals: normalizeRecords(
      readStorage<MealRecord[]>(buildScopedStorageKey(namespace, "meals"), fallbackSnapshot.meals)
    ),
    growth: readStorage<GrowthRecord[]>(buildScopedStorageKey(namespace, "growth"), fallbackSnapshot.growth),
    feedback:
      normalizeGuardianFeedbackCollection(
        readStorage<unknown[]>(
          buildScopedStorageKey(namespace, "feedback"),
          fallbackSnapshot.feedback
        )
      ) ?? fallbackSnapshot.feedback,
    health: readStorage<HealthCheckRecord[]>(
      buildScopedStorageKey(namespace, "health"),
      fallbackSnapshot.health
    ),
    taskCheckIns: readStorage<TaskCheckInRecord[]>(
      buildScopedStorageKey(namespace, "taskCheckIns"),
      fallbackSnapshot.taskCheckIns
    ),
    interventionCards: readStorage<InterventionCard[]>(
      buildScopedStorageKey(namespace, "interventionCards"),
      fallbackSnapshot.interventionCards
    ),
    consultations: readStorage<ConsultationResult[]>(
      buildScopedStorageKey(namespace, "consultations"),
      fallbackSnapshot.consultations
    ),
    mobileDrafts: readStorage<MobileDraft[]>(
      buildScopedStorageKey(namespace, "mobileDrafts"),
      fallbackSnapshot.mobileDrafts
    ),
    reminders: readStorage<ReminderItem[]>(
      buildScopedStorageKey(namespace, "reminders"),
      fallbackSnapshot.reminders
    ),
    tasks: readStorage<CanonicalTask[]>(
      buildScopedStorageKey(namespace, "tasks"),
      fallbackSnapshot.tasks
    ),
    updatedAt: fallbackSnapshot.updatedAt,
  } satisfies AppStateSnapshot;

  return normalizeAppStateSnapshot(snapshot) ?? fallbackSnapshot;
}

function writeScopedSnapshot(namespace: string, snapshot: AppStateSnapshot) {
  writeStorage(buildScopedStorageKey(namespace, "children"), snapshot.children);
  writeStorage(buildScopedStorageKey(namespace, "attendance"), snapshot.attendance);
  writeStorage(buildScopedStorageKey(namespace, "meals"), snapshot.meals);
  writeStorage(buildScopedStorageKey(namespace, "growth"), snapshot.growth);
  writeStorage(buildScopedStorageKey(namespace, "feedback"), snapshot.feedback);
  writeStorage(buildScopedStorageKey(namespace, "health"), snapshot.health);
  writeStorage(buildScopedStorageKey(namespace, "taskCheckIns"), snapshot.taskCheckIns);
  writeStorage(buildScopedStorageKey(namespace, "interventionCards"), snapshot.interventionCards);
  writeStorage(buildScopedStorageKey(namespace, "consultations"), snapshot.consultations);
  writeStorage(buildScopedStorageKey(namespace, "mobileDrafts"), snapshot.mobileDrafts);
  writeStorage(buildScopedStorageKey(namespace, "reminders"), snapshot.reminders);
  writeStorage(buildScopedStorageKey(namespace, "tasks"), snapshot.tasks);
}

function buildScopedStorageKey(namespace: string, key: keyof typeof STORAGE_KEYS) {
  return `childcare.${namespace}.${STORAGE_KEYS[key]}`;
}

const GIRL_AVATARS = ["👧", "🧒", "👶"];
const BOY_AVATARS = ["👦", "🧒", "👶"];

function createClientId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

function shiftDate(baseDate: string, diff: number) {
  return shiftLocalDate(baseDate, diff);
}

type DemoAttendanceSeed = Pick<AttendanceRecord, "isPresent" | "checkInAt" | "checkOutAt" | "absenceReason">;
type DemoMealFoodSeed = [name: string, category: FoodCategory, amount: string];

const DEMO_TEMPLATE_LATEST_DATE = "2026-03-31";
const DEMO_WEEK_DATES = Array.from({ length: 7 }, (_, index) => shiftDate(DEMO_TEMPLATE_LATEST_DATE, index - 6));
const DEMO_TEMPLATE_TODAY = DEMO_WEEK_DATES[6];

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

const INITIAL_USERS: DemoAccount[] = DEMO_ACCOUNTS;

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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 1),
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
    reviewDate: DEMO_TEMPLATE_TODAY,
    reviewStatus: "待复查",
  },
  {
    id: "g-3",
    childId: "c-1",
    createdAt: `${DEMO_TEMPLATE_TODAY} 09:20`,
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
    createdAt: `${DEMO_TEMPLATE_TODAY} 10:10`,
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
    createdAt: `${DEMO_TEMPLATE_TODAY} 14:40`,
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 2),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 1),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 3),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 2),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 3),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 2),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 3),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 1),
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
    reviewDate: DEMO_TEMPLATE_TODAY,
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 1),
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
    description: "午餐进食正常，但全天补水偏少，需多次提醒才愿意喝水。",
    needsAttention: true,
    followUpAction: "设置半小时饮水提醒，使用有刻度的趣味水杯",
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 2),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 1),
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
    reviewDate: DEMO_TEMPLATE_TODAY,
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 2),
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
    reviewDate: shiftDate(DEMO_TEMPLATE_TODAY, 7),
    reviewStatus: "待复查",
  },
];

const INITIAL_FEEDBACKS: GuardianFeedbackInput[] = [
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
    date: DEMO_TEMPLATE_TODAY,
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
    date: DEMO_TEMPLATE_TODAY,
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
    date: DEMO_TEMPLATE_TODAY,
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
  const normalizedDate = normalizeLocalDate(dateString);
  if (!normalizedDate) return dateString;

  return new Date(`${normalizedDate}T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeRecords(records: MealRecord[]) {
  return records.map((record) => ({
    ...record,
    photoUrls: record.photoUrls ? [...record.photoUrls] : undefined,
    nutritionScore: calcNutritionScore(record.foods, record.waterMl, record.preference),
  }));
}

function getLatestSnapshotDate(snapshot: AppStateSnapshot): string | null {
  const dates = [
    ...snapshot.attendance.map((record) => normalizeLocalDate(record.date)),
    ...snapshot.meals.map((record) => normalizeLocalDate(record.date)),
    ...snapshot.health.map((record) => normalizeLocalDate(record.date)),
    ...snapshot.growth.map((record) => normalizeLocalDate(record.createdAt)),
    ...snapshot.feedback.map((record) => normalizeLocalDate(record.date)),
    ...snapshot.taskCheckIns.map((record) => normalizeLocalDate(record.date)),
  ].filter((value): value is string => Boolean(value));

  if (dates.length === 0) return null;
  return dates.reduce((latest, current) => (current > latest ? current : latest));
}

function cloneDemoSnapshotTemplate(): AppStateSnapshot {
  return {
    children: ALL_INITIAL_CHILDREN.map((child) => ({
      ...child,
      allergies: [...child.allergies],
      guardians: child.guardians.map((guardian) => ({ ...guardian })),
    })),
    attendance: ALL_INITIAL_ATTENDANCE.map((record) => ({ ...record })),
    meals: ALL_INITIAL_MEALS.map((record) => ({
      ...record,
      foods: record.foods.map((food) => ({ ...food })),
      photoUrls: record.photoUrls ? [...record.photoUrls] : undefined,
    })),
    growth: ALL_INITIAL_GROWTH.map((record) => ({
      ...record,
      tags: [...record.tags],
      selectedIndicators: record.selectedIndicators ? [...record.selectedIndicators] : undefined,
      mediaUrls: record.mediaUrls ? [...record.mediaUrls] : undefined,
    })),
    feedback:
      normalizeGuardianFeedbackCollection(
        ALL_INITIAL_FEEDBACKS.map((record) => ({ ...record }))
      ) ?? [],
    health: ALL_INITIAL_HEALTH_CHECKS.map((record) => ({ ...record })),
    taskCheckIns: ALL_INITIAL_TASK_CHECKINS.map((record) => ({ ...record })),
    interventionCards: [],
    consultations: buildDemoConsultationResults(),
    mobileDrafts: [],
    reminders: [],
    tasks: [],
    updatedAt: new Date().toISOString(),
  };
}

const DEMO_HERO_CONSULTATION_CHILD_IDS = new Set(["c-1", "c-8", "c-11", "c-14", "c-15"]);

function demoDateMs(value?: string) {
  if (!value) return 0;
  const exact = new Date(value).getTime();
  if (Number.isFinite(exact) && exact > 0) return exact;
  const normalized = normalizeLocalDate(value);
  return normalized ? new Date(`${normalized}T00:00:00`).getTime() : 0;
}

function shiftDemoTemporalValue(value: string | undefined, diffDays: number) {
  if (!value) return value;
  if (diffDays === 0) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return shiftDemoDate(value, diffDays);
  }

  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})(T.*)$/);
  if (isoMatch) {
    return `${shiftDemoDate(isoMatch[1], diffDays)}${isoMatch[2]}`;
  }

  const spacedMatch = value.match(/^(\d{4}-\d{2}-\d{2})( .*)$/);
  if (spacedMatch) {
    return `${shiftDemoDate(spacedMatch[1], diffDays)}${spacedMatch[2]}`;
  }

  return value;
}

function buildDemoReminderAt(anchor: string, hour: number, minute: number, dayOffset = 0) {
  const next = new Date(anchor);
  next.setDate(next.getDate() + dayOffset);
  next.setHours(hour, minute, 0, 0);
  return next.toISOString();
}

function linkDemoFeedbackToNarrative(
  records: GuardianFeedback[],
  interventionCards: InterventionCard[],
  consultations: ConsultationResult[]
) {
  const cardByChildId = new Map(interventionCards.map((card) => [card.targetChildId, card] as const));
  const consultationByChildId = new Map(consultations.map((item) => [item.childId, item] as const));
  const latestFeedbackIds = new Set(
    [...records]
      .filter((record) => DEMO_HERO_CONSULTATION_CHILD_IDS.has(record.childId))
      .sort(
        (left, right) =>
          demoDateMs(right.submittedAt ?? right.date) - demoDateMs(left.submittedAt ?? left.date)
      )
      .filter((record, index, items) => items.findIndex((item) => item.childId === record.childId) === index)
      .map((record) => record.id)
  );

  return records.map((record) => {
    const interventionCard = cardByChildId.get(record.childId);
    const consultation = consultationByChildId.get(record.childId);
    if (!interventionCard || !consultation || !latestFeedbackIds.has(record.id)) {
      return { ...record };
    }

    return {
      ...record,
      interventionCardId: record.interventionCardId ?? interventionCard.id,
      relatedConsultationId: record.relatedConsultationId ?? consultation.consultationId,
      sourceWorkflow: record.sourceWorkflow ?? "manual",
    };
  });
}

function buildDemoReminderItems(
  interventionCards: InterventionCard[],
  consultations: ConsultationResult[],
  childMap: Map<string, Child>
): ReminderItem[] {
  const familyStatusByChildId: Record<string, ReminderItem["status"]> = {
    "c-1": "done",
    "c-8": "acknowledged",
    "c-11": "acknowledged",
    "c-14": "acknowledged",
    "c-15": "pending",
  };
  const teacherStatusByChildId: Record<string, ReminderItem["status"]> = {
    "c-1": "done",
    "c-8": "pending",
    "c-11": "pending",
    "c-14": "acknowledged",
    "c-15": "pending",
  };
  const adminStatusByConsultationId: Record<string, ReminderItem["status"]> = {
    "consultation-c-15": "pending",
    "consultation-c-14": "acknowledged",
    "consultation-c-8": "pending",
    "consultation-c-11": "pending",
  };

  return [
    ...interventionCards.flatMap((card) => {
      const childName = childMap.get(card.targetChildId)?.name ?? "幼儿";
      const createdAt = card.createdAt ?? new Date().toISOString();
      return [
        {
          reminderId: `reminder-family-${card.id}`,
          reminderType: "family-task",
          targetRole: "parent",
          targetId: card.targetChildId,
          childId: card.targetChildId,
          title: `${childName} 今晚家庭跟进`,
          description: card.tonightHomeAction,
          scheduledAt: buildDemoReminderAt(createdAt, 20, 30),
          status: familyStatusByChildId[card.targetChildId] ?? "pending",
          sourceId: card.id,
          sourceType: "intervention_card",
        },
        {
          reminderId: `reminder-review-${card.id}`,
          reminderType: "review-48h",
          targetRole: "teacher",
          targetId: card.targetChildId,
          childId: card.targetChildId,
          title: `${childName} 48 小时复核`,
          description: card.reviewIn48h,
          scheduledAt: buildDemoReminderAt(createdAt, 9, 30, 2),
          status: teacherStatusByChildId[card.targetChildId] ?? "pending",
          sourceId: card.id,
          sourceType: "intervention_card",
        },
      ] satisfies ReminderItem[];
    }),
    ...consultations
      .filter((consultation) => consultation.shouldEscalateToAdmin)
      .map((consultation) => {
        const childName = childMap.get(consultation.childId)?.name ?? "幼儿";
        return {
          reminderId: `reminder-admin-${consultation.consultationId}`,
          reminderType: "admin-focus",
          targetRole: "admin",
          targetId: consultation.childId,
          childId: consultation.childId,
          title: `${childName} 园长跟进`,
          description: consultation.directorDecisionCard.reason || consultation.triggerReason,
          scheduledAt: consultation.directorDecisionCard.recommendedAt,
          status: adminStatusByConsultationId[consultation.consultationId] ?? "pending",
          sourceId: consultation.consultationId,
          sourceType: "consultation",
        } satisfies ReminderItem;
      }),
  ];
}

function buildDemoMobileDrafts(
  consultations: ConsultationResult[],
  childMap: Map<string, Child>
): MobileDraft[] {
  const voiceDraftChildIds = ["c-8", "c-11", "c-14", "c-15"];
  const draftConfigByChildId: Record<
    string,
    {
      asrConfidence: number;
      warning?: string;
      category: "EMOTION" | "HEALTH" | "SLEEP" | "DIET";
      confidence: number;
      suggestedAction: string;
    }
  > = {
    "c-8": {
      asrConfidence: 0.73,
      warning: "router_low_confidence",
      category: "EMOTION",
      confidence: 0.46,
      suggestedAction: "补入园哭闹持续时长与安抚方式。",
    },
    "c-11": {
      asrConfidence: 0.92,
      category: "DIET",
      confidence: 0.88,
      suggestedAction: "补蔬菜尝试量和替代食物记录。",
    },
    "c-14": {
      asrConfidence: 0.78,
      warning: "detail_missing",
      category: "SLEEP",
      confidence: 0.58,
      suggestedAction: "补午睡入睡时长与醒后情绪。",
    },
    "c-15": {
      asrConfidence: 0.95,
      category: "HEALTH",
      confidence: 0.91,
      suggestedAction: "补下午饮水刻度和晚间补水反馈。",
    },
  };

  const drafts: MobileDraft[] = [];
  voiceDraftChildIds.forEach((childId, index) => {
    const consultation = consultations.find((item) => item.childId === childId);
    const childName = childMap.get(childId)?.name;
    const config = draftConfigByChildId[childId];
    if (!consultation || !childName || !config) {
      return;
    }

    const createdAt = buildDemoReminderAt(consultation.generatedAt, 9 + index, 5 + index * 7);
    drafts.push({
      draftId: `demo-draft-${childId}`,
      childId,
      draftType: "voice",
      targetRole: "teacher",
      content: `${childName} demo-safe voice observation`,
      structuredPayload: {
        kind: "teacher-voice-understanding",
        t5Seed: {
          transcript: `${childName} ${consultation.triggerReason}`,
          warnings: config.warning ? [config.warning] : [],
          draft_items: [
            {
              category: config.category,
              summary: consultation.summary,
              structured_fields: {},
              confidence: config.confidence,
              suggested_actions: [config.suggestedAction],
              raw_excerpt: consultation.triggerReason,
            },
          ],
        },
        understanding: {
          meta: {
            asr: {
              confidence: config.asrConfidence,
            },
          },
        },
      },
      syncStatus: "synced" satisfies MobileDraftSyncStatus,
      createdAt,
      updatedAt: createdAt,
      syncedAt: createdAt,
    });
  });
  return drafts;
}

function applyDemoNarrativeScaffold(snapshot: AppStateSnapshot): AppStateSnapshot {
  const childMap = new Map(snapshot.children.map((child) => [child.id, child] as const));
  const consultations = buildDemoConsultationResults();
  const interventionCards = consultations
    .map((consultation) => {
      const child = childMap.get(consultation.childId);
      if (!child) return null;
      return buildInterventionCardFromConsultation({
        targetChildId: consultation.childId,
        childName: child.name,
        consultation,
        generatedAt: consultation.generatedAt,
      });
    })
    .filter((card): card is InterventionCard => Boolean(card));
  const feedback = linkDemoFeedbackToNarrative(snapshot.feedback, interventionCards, consultations);
  const reminders = buildDemoReminderItems(interventionCards, consultations, childMap);
  const scaffoldTasks = materializeTasksFromLegacy({
    interventionCards,
    consultations,
    reminders,
    guardianFeedbacks: feedback,
    taskCheckIns: snapshot.taskCheckIns,
  });

  return {
    ...snapshot,
    feedback,
    interventionCards,
    consultations,
    mobileDrafts: buildDemoMobileDrafts(consultations, childMap),
    reminders,
    tasks: scaffoldTasks,
    updatedAt: new Date().toISOString(),
  };
}

const DEMO_MEAL_PHOTO_LIBRARY: Record<MealType, string[]> = {
  早餐: ["/demo-meals/breakfast-porridge-real.svg", "/demo-meals/breakfast-sandwich-real.svg"],
  午餐: ["/demo-meals/lunch-bento-a-real.svg", "/demo-meals/lunch-bento-b-real.svg", "/demo-meals/lunch-bento-c-real.svg"],
  晚餐: ["/demo-meals/dinner-soup-real.svg", "/demo-meals/lunch-bento-b-real.svg"],
  加餐: ["/demo-meals/snack-fruit-yogurt-real.svg", "/demo-meals/snack-corn-milk-real.svg"],
};

const DEMO_GROWTH_MEDIA_LIBRARY = [
  "/demo-growth/growth-reading-corner.svg",
  "/demo-growth/growth-garden-balance.svg",
  "/demo-growth/growth-art-table.svg",
  "/demo-growth/growth-sensory-play.svg",
];

function buildRecordKey(childId: string, date: string) {
  return `${childId}-${date}`;
}

function buildAttendanceLookup(records: AttendanceRecord[]) {
  return new Map(records.map((record) => [buildRecordKey(record.childId, record.date), record] as const));
}

function keepRecordsOnPresentDays<T extends { childId: string; date: string }>(
  records: T[],
  attendanceLookup: Map<string, AttendanceRecord>
) {
  return records.filter((record) => attendanceLookup.get(buildRecordKey(record.childId, record.date))?.isPresent);
}

function getDemoMealPhotoPaths(meal: MealType, childId: string, date: string) {
  const library = DEMO_MEAL_PHOTO_LIBRARY[meal] ?? [];
  if (library.length === 0) return undefined;

  const seed = `${childId}-${date}-${meal}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return [library[seed % library.length]];
}

function attachDemoMealPhotos(records: MealRecord[]) {
  return records.map((record) => {
    if (record.photoUrls?.length) {
      return { ...record, photoUrls: [...record.photoUrls] };
    }

    const photoUrls = getDemoMealPhotoPaths(record.meal, record.childId, record.date);
    return photoUrls ? { ...record, photoUrls } : { ...record };
  });
}

function getDemoGrowthMediaPaths(childId: string, createdAt: string) {
  const seed = `${childId}-${createdAt}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return [DEMO_GROWTH_MEDIA_LIBRARY[seed % DEMO_GROWTH_MEDIA_LIBRARY.length]];
}

function attachDemoGrowthMedia(records: GrowthRecord[]) {
  return records.map((record) => {
    if (record.mediaUrls?.length) {
      return { ...record, mediaUrls: [...record.mediaUrls] };
    }

    return {
      ...record,
      mediaUrls: getDemoGrowthMediaPaths(record.childId, record.createdAt),
    };
  });
}

function shiftDemoDate(dateString: string, diffDays: number) {
  return shiftDate(dateString, diffDays);
}

function shiftDemoDateTime(dateTime: string, diffDays: number) {
  const [datePart, ...timeParts] = dateTime.split(" ");
  const shiftedDate = shiftDate(datePart, diffDays);
  return timeParts.length > 0 ? `${shiftedDate} ${timeParts.join(" ")}` : shiftedDate;
}

function shiftDemoSnapshotDates(snapshot: AppStateSnapshot, targetToday: string): AppStateSnapshot {
  const latestDate = getLatestSnapshotDate(snapshot);
  if (!latestDate) {
    return {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    };
  }

  const diffDays = Math.round((startOfDay(targetToday) - startOfDay(latestDate)) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...snapshot,
    attendance: snapshot.attendance.map((record) => ({
      ...record,
      date: shiftDemoDate(record.date, diffDays),
    })),
    meals: snapshot.meals.map((record) => ({
      ...record,
      date: shiftDemoDate(record.date, diffDays),
    })),
    growth: snapshot.growth.map((record) => ({
      ...record,
      createdAt: shiftDemoDateTime(record.createdAt, diffDays),
      reviewDate: shiftDemoTemporalValue(record.reviewDate, diffDays),
    })),
    feedback: snapshot.feedback.map((record) => ({
      ...record,
      date: shiftDemoDate(record.date, diffDays),
      submittedAt:
        shiftDemoTemporalValue(record.submittedAt, diffDays) ?? shiftDemoDate(record.date, diffDays),
    })),
    health: snapshot.health.map((record) => ({
      ...record,
      date: shiftDemoDate(record.date, diffDays),
    })),
    taskCheckIns: snapshot.taskCheckIns.map((record) => ({
      ...record,
      date: shiftDemoDate(record.date, diffDays),
    })),
    interventionCards: snapshot.interventionCards.map((record) => ({
      ...record,
      createdAt: shiftDemoTemporalValue(record.createdAt, diffDays),
      updatedAt: shiftDemoTemporalValue(record.updatedAt, diffDays),
    })),
    consultations: snapshot.consultations.map((record) => {
      const dueAt = (record as ConsultationResult & { dueAt?: string }).dueAt;
      return {
        ...record,
        generatedAt: shiftDemoTemporalValue(record.generatedAt, diffDays) ?? record.generatedAt,
        ...(dueAt ? { dueAt: shiftDemoTemporalValue(dueAt, diffDays) ?? dueAt } : {}),
        directorDecisionCard: {
          ...record.directorDecisionCard,
          recommendedAt:
            shiftDemoTemporalValue(record.directorDecisionCard.recommendedAt, diffDays) ??
            record.directorDecisionCard.recommendedAt,
        },
      };
    }),
    mobileDrafts: snapshot.mobileDrafts.map((record) => ({
      ...record,
      createdAt: shiftDemoTemporalValue(record.createdAt, diffDays) ?? record.createdAt,
      updatedAt: shiftDemoTemporalValue(record.updatedAt, diffDays) ?? record.updatedAt,
      syncedAt: shiftDemoTemporalValue(record.syncedAt, diffDays),
    })),
    reminders: snapshot.reminders.map((record) => ({
      ...record,
      scheduledAt: shiftDemoTemporalValue(record.scheduledAt, diffDays) ?? record.scheduledAt,
    })),
    tasks: snapshot.tasks.map((record) => ({
      ...record,
      dueAt: shiftDemoTemporalValue(record.dueAt, diffDays) ?? record.dueAt,
      createdAt: shiftDemoTemporalValue(record.createdAt, diffDays) ?? record.createdAt,
      updatedAt: shiftDemoTemporalValue(record.updatedAt, diffDays) ?? record.updatedAt,
      completedAt: shiftDemoTemporalValue(record.completedAt, diffDays),
      lastEvidenceAt: shiftDemoTemporalValue(record.lastEvidenceAt, diffDays),
      statusChangedAt: shiftDemoTemporalValue(record.statusChangedAt, diffDays),
    })),
    updatedAt: new Date().toISOString(),
  };
}

function validateDemoSnapshotCoverage(snapshot: AppStateSnapshot, targetToday: string) {
  const todayGrowthCount = snapshot.growth.filter((record) => normalizeLocalDate(record.createdAt) === targetToday).length;
  const todayHealthCount = snapshot.health.filter((record) => record.date === targetToday).length;
  const todayAttendanceCount = snapshot.attendance.filter((record) => record.date === targetToday && record.isPresent).length;
  const todayMealCount = snapshot.meals.filter((record) => record.date === targetToday).length;
  const childIds = new Set(snapshot.children.map((child) => child.id));
  const allowedTaskIds = new Set(["task_001", "task_002", "task_003", "task_004", "task_005", "task_006"]);
  const attendanceLookup = buildAttendanceLookup(snapshot.attendance);
  const orphanMealCount = snapshot.meals.filter(
    (record) => !attendanceLookup.get(buildRecordKey(record.childId, record.date))?.isPresent
  ).length;
  const orphanHealthCount = snapshot.health.filter(
    (record) => !attendanceLookup.get(buildRecordKey(record.childId, record.date))?.isPresent
  ).length;
  const missingChildRefCount =
    snapshot.attendance.filter((record) => !childIds.has(record.childId)).length +
    snapshot.meals.filter((record) => !childIds.has(record.childId)).length +
    snapshot.health.filter((record) => !childIds.has(record.childId)).length +
    snapshot.growth.filter((record) => !childIds.has(record.childId)).length +
    snapshot.feedback.filter((record) => !childIds.has(record.childId)).length +
    snapshot.taskCheckIns.filter((record) => !childIds.has(record.childId)).length;
  const invalidTaskIdCount = snapshot.taskCheckIns.filter((record) => !allowedTaskIds.has(record.taskId)).length;

  const hasCoverage =
    todayAttendanceCount > 0 &&
    todayMealCount > 0 &&
    todayGrowthCount > 0 &&
    todayHealthCount > 0 &&
    orphanMealCount === 0 &&
    orphanHealthCount === 0 &&
    missingChildRefCount === 0 &&
    invalidTaskIdCount === 0;

  if (hasCoverage) {
    return snapshot;
  }

  const message = `[DEMO] Snapshot coverage invalid for ${targetToday}: attendance=${todayAttendanceCount}, meals=${todayMealCount}, growth=${todayGrowthCount}, health=${todayHealthCount}, orphanMeals=${orphanMealCount}, orphanHealth=${orphanHealthCount}, missingChildRefs=${missingChildRefCount}, invalidTaskIds=${invalidTaskIdCount}`;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(message);
  }

  console.error(message);
  return snapshot;
}

function buildFreshDemoSnapshot(targetToday = getLocalToday()): AppStateSnapshot {
  const template = cloneDemoSnapshotTemplate();
  const attendanceLookup = buildAttendanceLookup(template.attendance);
  const normalizedTemplate = applyDemoNarrativeScaffold({
    ...template,
    meals: attachDemoMealPhotos(keepRecordsOnPresentDays(template.meals, attendanceLookup)),
    growth: attachDemoGrowthMedia(template.growth),
    health: keepRecordsOnPresentDays(template.health, attendanceLookup),
  });

  return validateDemoSnapshotCoverage(shiftDemoSnapshotDates(normalizedTemplate, targetToday), targetToday);
}

function hydrateDemoSnapshotForToday(snapshot: AppStateSnapshot, targetToday = getLocalToday()) {
  const attendanceLookup = buildAttendanceLookup(snapshot.attendance);
  const normalizedSnapshot = applyDemoNarrativeScaffold({
    ...snapshot,
    meals: attachDemoMealPhotos(keepRecordsOnPresentDays(snapshot.meals, attendanceLookup)),
    growth: attachDemoGrowthMedia(snapshot.growth),
    health: keepRecordsOnPresentDays(snapshot.health, attendanceLookup),
    tasks: [],
  });

  return validateDemoSnapshotCoverage(shiftDemoSnapshotDates(normalizedSnapshot, targetToday), targetToday);
}

function filterChildrenByUser(children: Child[], user: User) {
  return filterChildrenForSessionUser(children, user);
}

function startOfDay(dateString: string) {
  return startOfLocalDay(dateString);
}

function isInLastDays(dateString: string, days: number) {
  return isDateWithinLastDays(dateString, days, TODAY);
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

function summarizeWeeklyDietRecords(records: MealRecord[]): WeeklyDietTrend {
  if (records.length === 0) {
    return { balancedRate: 0, vegetableDays: 0, proteinDays: 0, stapleDays: 0, hydrationAvg: 0, monotonyDays: 0 };
  }

  const byDay = new Map<string, MealRecord[]>();
  records.forEach((record) => {
    const key = `${record.childId}-${record.date}`;
    byDay.set(key, [...(byDay.get(key) ?? []), record]);
  });

  let balancedDays = 0;
  let vegetableDays = 0;
  let proteinDays = 0;
  let stapleDays = 0;
  let waterTotal = 0;
  let monotonyDays = 0;

  byDay.forEach((dailyRecords) => {
    const categories = new Set(dailyRecords.flatMap((record) => record.foods.map((food) => food.category)));
    if (categories.has("蔬果")) vegetableDays += 1;
    if (categories.has("蛋白")) proteinDays += 1;
    if (categories.has("主食")) stapleDays += 1;
    if (categories.has("蔬果") && categories.has("蛋白") && categories.has("主食")) balancedDays += 1;

    const names = new Set(dailyRecords.flatMap((record) => record.foods.map((food) => food.name)));
    if (names.size <= 3) monotonyDays += 1;

    waterTotal += dailyRecords.reduce((sum, record) => sum + record.waterMl, 0);
  });

  return {
    balancedRate: Math.round((balancedDays / byDay.size) * 100),
    vegetableDays,
    proteinDays,
    stapleDays,
    hydrationAvg: Math.round(waterTotal / byDay.size),
    monotonyDays,
  };
}

function groupRecordsByChildId<T extends { childId: string }>(records: T[]) {
  return records.reduce<Map<string, T[]>>((map, record) => {
    map.set(record.childId, [...(map.get(record.childId) ?? []), record]);
    return map;
  }, new Map<string, T[]>());
}

function buildParentMediaGallery(childId: string, growthRecords: GrowthRecord[], mealRecords: MealRecord[]) {
  const growthItems: ParentMediaItem[] = growthRecords.flatMap((record) =>
    (record.mediaUrls ?? []).map((mediaUrl, mediaIndex) => ({
      id: `growth-media-${record.id}-${mediaIndex}`,
      childId,
      recordedAt: record.createdAt,
      title: record.tags[0] ?? record.category,
      summary: record.description,
      source: "growth",
      mediaUrl,
      thumbnailUrl: mediaUrl,
      tags: [record.category, ...record.tags].slice(0, 4),
    }))
  );
  const mealItems: ParentMediaItem[] = mealRecords.flatMap((record) =>
    (record.photoUrls ?? []).map((photoUrl, photoIndex) => ({
      id: `meal-media-${record.id}-${photoIndex}`,
      childId,
      recordedAt: `${record.date}T12:00:00`,
      title: `${record.meal}餐食记录`,
      summary: record.foods.map((food) => food.name).slice(0, 3).join(" / "),
      source: "meal",
      mediaUrl: photoUrl,
      thumbnailUrl: photoUrl,
      tags: [record.meal, record.preference, record.intakeLevel],
    }))
  );

  return [...growthItems, ...mealItems]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, 8);
}

type ExtraMealStyle = "balanced" | "gentleRecovery" | "hydrationFocusNeeded" | "positiveHighHydration";
type ExtraHealthStyle =
  | "morningCheckAlert"
  | "separationAnxiety"
  | "napWatch"
  | "hydrationWatch"
  | "emotionWatch"
  | "socialCoaching"
  | "positiveSteady";

type ExtraGrowthSeed = {
  idSuffix: string;
  dayIndex: number;
  time: string;
  recorder: string;
  recorderRole: Role;
  category: BehaviorCategory;
  tags: string[];
  description: string;
  needsAttention: boolean;
  followUpAction?: string;
  reviewOffset?: number;
  reviewStatus?: GrowthRecord["reviewStatus"];
};

type ExtraFeedbackSeed = {
  idSuffix: string;
  dayIndex: number;
  status: CollaborationStatus;
  content: string;
  createdBy: string;
  createdByRole: Role;
};

type ExtraTaskSeed = {
  idSuffix: string;
  dayIndex: number;
  taskId: string;
};

type ExtraChildSeed = {
  child: Child;
  attendancePlan: DemoAttendanceSeed[];
  mealStyle: ExtraMealStyle;
  healthStyle: ExtraHealthStyle;
  growthSeeds: ExtraGrowthSeed[];
  feedbackSeeds: ExtraFeedbackSeed[];
  taskSeeds: ExtraTaskSeed[];
};

type ExtraMealPlan = {
  breakfastFoods: DemoMealFoodSeed[];
  lunchFoods: DemoMealFoodSeed[];
  snackFoods: DemoMealFoodSeed[];
  breakfastWater: number;
  lunchWater: number;
  snackWater: number;
  breakfastPreference: PreferenceStatus;
  lunchPreference: PreferenceStatus;
  snackPreference: PreferenceStatus;
  breakfastIntake: IntakeLevel;
  lunchIntake: IntakeLevel;
  snackIntake: IntakeLevel;
};

type ExtraHealthEntry = {
  temperature: number;
  mood: string;
  remark: string;
  handMouthEye: "正常" | "异常";
};

function rotateSeed<T>(items: T[], index: number) {
  return items[index % items.length];
}

function buildExtraGrowthRecord(childId: string, seed: ExtraGrowthSeed): GrowthRecord {
  return {
    id: `g-${childId}-${seed.idSuffix}`,
    childId,
    createdAt: `${DEMO_WEEK_DATES[seed.dayIndex]} ${seed.time}`,
    recorder: seed.recorder,
    recorderRole: seed.recorderRole,
    category: seed.category,
    tags: seed.tags,
    description: seed.description,
    needsAttention: seed.needsAttention,
    followUpAction: seed.followUpAction,
    reviewDate: seed.reviewOffset !== undefined ? shiftDate(DEMO_TEMPLATE_TODAY, seed.reviewOffset) : undefined,
    reviewStatus: seed.reviewStatus ?? (seed.needsAttention ? "待复查" : "已完成"),
  };
}

function buildExtraFeedbackRecord(childId: string, seed: ExtraFeedbackSeed): GuardianFeedbackInput {
  return {
    id: `fb-${childId}-${seed.idSuffix}`,
    childId,
    date: DEMO_WEEK_DATES[seed.dayIndex],
    status: seed.status,
    content: seed.content,
    createdBy: seed.createdBy,
    createdByRole: seed.createdByRole,
  };
}

function buildExtraTaskCheckInRecord(childId: string, seed: ExtraTaskSeed): TaskCheckInRecord {
  return {
    id: `tc-${childId}-${seed.idSuffix}`,
    childId,
    taskId: seed.taskId,
    date: DEMO_WEEK_DATES[seed.dayIndex],
  };
}

function buildExtraMealPlan(style: ExtraMealStyle, dayIndex: number): ExtraMealPlan {
  const balancedBreakfasts: DemoMealFoodSeed[][] = [
    [["燕麦南瓜粥", "主食", "1碗"], ["蒸蛋", "蛋白", "1份"], ["蓝莓", "蔬果", "1小份"]],
    [["豆浆", "饮品", "180ml"], ["全麦面包", "主食", "2片"], ["苹果块", "蔬果", "40g"]],
    [["玉米小米粥", "主食", "1碗"], ["鸡肉松饭团", "蛋白", "1个"], ["圣女果", "蔬果", "3颗"]],
  ];
  const balancedLunches: DemoMealFoodSeed[][] = [
    [["杂粮饭", "主食", "1碗"], ["清炖鸡腿肉", "蛋白", "70g"], ["西兰花胡萝卜", "蔬果", "60g"]],
    [["番茄牛肉意面", "主食", "1份"], ["牛肉末", "蛋白", "65g"], ["生菜玉米粒", "蔬果", "55g"]],
    [["南瓜饭", "主食", "1碗"], ["香菇豆腐", "蛋白", "70g"], ["油麦菜", "蔬果", "60g"]],
  ];
  const balancedSnacks: DemoMealFoodSeed[][] = [
    [["酸奶", "奶制品", "100ml"], ["香蕉", "蔬果", "半根"]],
    [["玉米棒", "主食", "半份"], ["梨块", "蔬果", "40g"]],
    [["红豆小发糕", "主食", "1块"], ["橙子片", "蔬果", "2片"]],
  ];
  const gentleBreakfasts: DemoMealFoodSeed[][] = [
    [["小米山药粥", "主食", "1碗"], ["鸡蛋羹", "蛋白", "半份"], ["温水", "饮品", "120ml"]],
    [["南瓜粥", "主食", "1碗"], ["豆腐小卷", "蛋白", "2个"], ["苹果泥", "蔬果", "30g"]],
    [["银耳百合粥", "主食", "1碗"], ["鸡丝面片", "蛋白", "半份"], ["温水", "饮品", "120ml"]],
  ];
  const gentleLunches: DemoMealFoodSeed[][] = [
    [["米饭", "主食", "1碗"], ["虾仁豆腐羹", "蛋白", "60g"], ["青菜碎", "蔬果", "45g"]],
    [["软面条", "主食", "1碗"], ["鸡蓉蒸蛋", "蛋白", "60g"], ["南瓜丁", "蔬果", "40g"]],
    [["山药饭", "主食", "1碗"], ["清蒸鱼块", "蛋白", "55g"], ["西葫芦丁", "蔬果", "45g"]],
  ];
  const gentleSnacks: DemoMealFoodSeed[][] = [
    [["蒸苹果", "蔬果", "40g"], ["温开水", "饮品", "120ml"]],
    [["小米糕", "主食", "1块"], ["香蕉片", "蔬果", "30g"]],
    [["原味酸奶", "奶制品", "90ml"], ["火龙果块", "蔬果", "30g"]],
  ];
  const positiveBreakfasts: DemoMealFoodSeed[][] = [
    [["牛油果鸡蛋卷", "蛋白", "1份"], ["全麦吐司", "主食", "2片"], ["草莓", "蔬果", "3颗"]],
    [["玉米燕麦粥", "主食", "1碗"], ["芝士土豆泥", "奶制品", "50g"], ["蓝莓", "蔬果", "1小份"]],
    [["杂粮小饭团", "主食", "2个"], ["鸡肉条", "蛋白", "50g"], ["橙子片", "蔬果", "2片"]],
  ];
  const positiveLunches: DemoMealFoodSeed[][] = [
    [["糙米饭", "主食", "1碗"], ["番茄牛肉丸", "蛋白", "70g"], ["西兰花彩椒", "蔬果", "70g"]],
    [["紫薯饭", "主食", "1碗"], ["香煎三文鱼", "蛋白", "65g"], ["芦笋胡萝卜", "蔬果", "65g"]],
    [["鸡茸蔬菜烩饭", "主食", "1碗"], ["鸡茸", "蛋白", "60g"], ["菠菜玉米粒", "蔬果", "65g"]],
  ];
  const positiveSnacks: DemoMealFoodSeed[][] = [
    [["酸奶水果杯", "奶制品", "120ml"], ["哈密瓜块", "蔬果", "50g"]],
    [["蒸南瓜", "蔬果", "50g"], ["温豆浆", "饮品", "160ml"]],
    [["全麦饼干", "主食", "2片"], ["奇异果片", "蔬果", "2片"]],
  ];
  const lowHydrationVegDay = dayIndex === 1 || dayIndex === 5;
  const lowHydrationBreakfast = lowHydrationVegDay
    ? ([["南瓜小粥", "主食", "半碗"], ["鸡肉小卷", "蛋白", "1个"], ["香蕉片", "蔬果", "20g"]] as DemoMealFoodSeed[])
    : ([["白粥", "主食", "半碗"], ["鸡肉丸", "蛋白", "2颗"], ["苏打饼干", "主食", "2片"]] as DemoMealFoodSeed[]);
  const lowHydrationLunch = lowHydrationVegDay
    ? ([["米饭", "主食", "1小碗"], ["肉末豆腐", "蛋白", "55g"], ["小白菜", "蔬果", "35g"]] as DemoMealFoodSeed[])
    : ([["米饭", "主食", "1小碗"], ["鸡腿肉", "蛋白", "55g"], ["小馒头", "主食", "1个"]] as DemoMealFoodSeed[]);
  const lowHydrationSnack = lowHydrationVegDay
    ? ([["苹果片", "蔬果", "25g"], ["小米糕", "主食", "1块"]] as DemoMealFoodSeed[])
    : ([["磨牙饼干", "主食", "2片"], ["温豆浆", "饮品", "70ml"]] as DemoMealFoodSeed[]);

  switch (style) {
    case "gentleRecovery":
      return {
        breakfastFoods: rotateSeed(gentleBreakfasts, dayIndex),
        lunchFoods: rotateSeed(gentleLunches, dayIndex),
        snackFoods: rotateSeed(gentleSnacks, dayIndex),
        breakfastWater: [90, 85, 88, 92, 94, 96, 98][dayIndex],
        lunchWater: [120, 118, 122, 125, 128, 130, 132][dayIndex],
        snackWater: [70, 72, 68, 74, 76, 78, 80][dayIndex],
        breakfastPreference: dayIndex === 0 ? "正常" : "偏好",
        lunchPreference: "正常",
        snackPreference: "正常",
        breakfastIntake: dayIndex === 2 ? "少量" : "适中",
        lunchIntake: dayIndex === 4 ? "少量" : "适中",
        snackIntake: "适中",
      };
    case "hydrationFocusNeeded":
      return {
        breakfastFoods: lowHydrationBreakfast,
        lunchFoods: lowHydrationLunch,
        snackFoods: lowHydrationSnack,
        breakfastWater: [30, 35, 28, 32, 34, 36, 30][dayIndex],
        lunchWater: [42, 45, 38, 40, 44, 46, 42][dayIndex],
        snackWater: [24, 28, 22, 25, 26, 28, 24][dayIndex],
        breakfastPreference: dayIndex % 2 === 0 ? "正常" : "拒食",
        lunchPreference: lowHydrationVegDay ? "正常" : "拒食",
        snackPreference: lowHydrationVegDay ? "正常" : "偏好",
        breakfastIntake: dayIndex % 2 === 0 ? "少量" : "适中",
        lunchIntake: lowHydrationVegDay ? "适中" : "少量",
        snackIntake: "少量",
      };
    case "positiveHighHydration":
      return {
        breakfastFoods: rotateSeed(positiveBreakfasts, dayIndex),
        lunchFoods: rotateSeed(positiveLunches, dayIndex),
        snackFoods: rotateSeed(positiveSnacks, dayIndex),
        breakfastWater: [140, 145, 150, 148, 152, 155, 158][dayIndex],
        lunchWater: [170, 175, 180, 178, 182, 185, 188][dayIndex],
        snackWater: [110, 115, 120, 118, 122, 125, 128][dayIndex],
        breakfastPreference: "偏好",
        lunchPreference: "偏好",
        snackPreference: "偏好",
        breakfastIntake: "充足",
        lunchIntake: "充足",
        snackIntake: "适中",
      };
    case "balanced":
    default:
      return {
        breakfastFoods: rotateSeed(balancedBreakfasts, dayIndex),
        lunchFoods: rotateSeed(balancedLunches, dayIndex),
        snackFoods: rotateSeed(balancedSnacks, dayIndex),
        breakfastWater: [105, 110, 108, 112, 115, 118, 120][dayIndex],
        lunchWater: [145, 150, 152, 155, 158, 160, 162][dayIndex],
        snackWater: [80, 85, 88, 90, 92, 95, 98][dayIndex],
        breakfastPreference: dayIndex === 1 ? "正常" : "偏好",
        lunchPreference: "偏好",
        snackPreference: dayIndex === 4 ? "正常" : "偏好",
        breakfastIntake: "适中",
        lunchIntake: dayIndex === 3 ? "充足" : "适中",
        snackIntake: "适中",
      };
  }
}

function buildExtraHealthEntry(style: ExtraHealthStyle, childId: string, dayIndex: number): ExtraHealthEntry {
  if (style === "morningCheckAlert") {
    if (childId === "c-17") {
      return {
        temperature: [36.7, 36.8, 36.9, 37.1, 37.2, 36.9, 37.5][dayIndex],
        mood: ["平稳", "平稳", "平稳", "困倦", "平稳", "平稳", "烦躁"][dayIndex],
        remark: [
          "晨检平稳，但老师已在群里提醒继续关注体温。",
          "夜里睡眠偏浅，晨起状态一般。",
          "上午活动量正常，午前精神略弱。",
          "体温轻度上浮，保健老师已做复测。",
          "午睡前出现倦怠，建议减少剧烈活动。",
          "午后恢复稳定，继续追踪。",
          "今晨复测 37.5℃，已通知家长并建议今日重点观察。",
        ][dayIndex],
        handMouthEye: dayIndex === 6 ? "异常" : "正常",
      };
    }

    if (childId === "c-18") {
      return {
        temperature: [36.6, 36.5, 36.6, 36.7, 36.9, 36.7, 36.8][dayIndex],
        mood: ["平稳", "愉快", "平稳", "平稳", "轻咳", "平稳", "平稳"][dayIndex],
        remark: [
          "晨检配合良好。",
          "情绪稳定，能主动挥手告别。",
          "晨间精神不错，活动参与积极。",
          "咽喉略干，已提醒多喝温水。",
          "晨起轻咳 2 次，已记录观察。",
          "午后未再出现咳嗽。",
          "今晨仍有轻咳，已提醒继续补水并减少冷饮。",
        ][dayIndex],
        handMouthEye: "正常",
      };
    }

    return {
      temperature: [36.7, 37.1, 36.8, 36.9, 37.0, 36.8, 37.4][dayIndex],
      mood: ["平稳", "困倦", "平稳", "平稳", "平稳", "愉快", "困倦"][dayIndex],
      remark: [
        "晨检稳定，但本周已列入连续观察名单。",
        "体温轻度上浮，已减少晨练强度。",
        "今日恢复平稳，继续追踪。",
        "上午精神一般，已提醒补水。",
        "午后状态恢复，家长知情。",
        "昨日作息提早，今日精神稍好。",
        "今晨体温 37.4℃，建议完成离园前二次复测。",
      ][dayIndex],
      handMouthEye: dayIndex === 6 ? "异常" : "正常",
    };
  }

  if (style === "separationAnxiety") {
    return {
      temperature: [36.5, 36.5, 36.6, 36.5, 36.6, 36.5, 36.6][dayIndex],
      mood: ["哭闹", "黏人", "平稳", "黏人", "平稳", "愉快", "平稳"][dayIndex],
      remark: [
        "入园时有明显分离情绪，安抚后逐渐恢复。",
        "需要牵手进入教室，5 分钟后可参与活动。",
        "晨间情绪比周初稳定。",
        "交接时仍会回头找家长，需要固定安抚句。",
        "能跟随老师进入游戏区。",
        "到园后 3 分钟内即可平复。",
        "今晨仅短暂情绪波动，恢复速度较快。",
      ][dayIndex],
      handMouthEye: "正常",
    };
  }

  if (style === "napWatch") {
    return {
      temperature: [36.5, 36.6, 36.5, 36.5, 36.6, 36.5, 36.6][dayIndex],
      mood: ["平稳", "困倦", "平稳", "困倦", "平稳", "困倦", "平稳"][dayIndex],
      remark: [
        "晨起可配合，但老师已备注午睡观察。",
        "昨晚入睡偏晚，晨起有些困倦。",
        "上午活动状态正常。",
        "午睡后恢复较慢，已减少高强度活动。",
        "今天精神略好于前天。",
        "午休前揉眼频率偏高，需要提前安静过渡。",
        "今晨状态平稳，继续追踪午睡质量。",
      ][dayIndex],
      handMouthEye: "正常",
    };
  }

  if (style === "hydrationWatch") {
    return {
      temperature: [36.5, 36.5, 36.6, 36.5, 36.6, 36.5, 36.6][dayIndex],
      mood: ["平稳", "平稳", "口渴", "平稳", "口渴", "平稳", "平稳"][dayIndex],
      remark: [
        "晨检正常，但老师计划重点提醒饮水。",
        "晨间食欲一般，需要观察早餐摄入。",
        "嘴唇略干，已增加喝水提醒。",
        "加餐时主动喝水意愿不足。",
        "如厕前后饮水量偏少，已做记录。",
        "午后喝水仍需老师提醒。",
        "今晨状态平稳，继续跟踪补水习惯。",
      ][dayIndex],
      handMouthEye: "正常",
    };
  }

  if (style === "emotionWatch") {
    return {
      temperature: [36.5, 36.5, 36.6, 36.5, 36.5, 36.6, 36.5][dayIndex],
      mood: ["平稳", "敏感", "平稳", "烦躁", "平稳", "平稳", "平稳"][dayIndex],
      remark: [
        "晨检正常，情绪稳定。",
        "转场前提醒后仍需要老师陪伴。",
        "上午互动平稳。",
        "环境噪声变大时出现烦躁，需要安静角落缓冲。",
        "能在提示下表达需要帮助。",
        "今天能主动说出不舒服的感受。",
        "今晨状态平稳，继续关注表达方式。",
      ][dayIndex],
      handMouthEye: "正常",
    };
  }

  if (style === "socialCoaching") {
    return {
      temperature: [36.5, 36.5, 36.6, 36.5, 36.6, 36.5, 36.5][dayIndex],
      mood: ["愉快", "平稳", "平稳", "愉快", "平稳", "愉快", "平稳"][dayIndex],
      remark: [
        "晨检状态稳定，可参与合作游戏。",
        "今天能较好地等待轮流。",
        "上午与同伴互动较积极。",
        "需要老师提醒用语言表达冲突。",
        "冲突后能在提示下说出想法。",
        "今天主动邀请同伴一起搭建。",
        "今晨状态平稳，适合继续进行合作活动。",
      ][dayIndex],
      handMouthEye: "正常",
    };
  }

  return {
    temperature: [36.5, 36.5, 36.6, 36.5, 36.5, 36.6, 36.5][dayIndex],
    mood: ["愉快", "平稳", "愉快", "平稳", "愉快", "平稳", "愉快"][dayIndex],
    remark: [
      "晨检平稳，精神饱满。",
      "能主动问好并排队洗手。",
      "上午活动参与积极。",
      "可独立进入晨间任务。",
      "与同伴互动友好。",
      "饮水和进餐都较主动。",
      "今晨状态良好，可继续承担示范角色。",
    ][dayIndex],
    handMouthEye: "正常",
  };
}

function presentSeed(checkInAt: string, checkOutAt: string): DemoAttendanceSeed {
  return { isPresent: true, checkInAt, checkOutAt };
}

function absentSeed(absenceReason: string): DemoAttendanceSeed {
  return { isPresent: false, absenceReason };
}

const DEMO_TODAY_ATTENDANCE_OVERRIDES: Record<string, DemoAttendanceSeed> = {
  "c-2": presentSeed("08:56", "17:08"),
  "c-4": absentSeed("家庭观察休息"),
  "c-6": presentSeed("08:53", "17:05"),
  "c-7": absentSeed("居家调整作息"),
  "c-8": presentSeed("08:41", "17:01"),
  "c-11": absentSeed("晨起咳嗽居家观察"),
  "c-12": presentSeed("08:58", "17:02"),
  "c-19": absentSeed("家长请假陪诊"),
  "c-24": absentSeed("居家补觉恢复状态"),
  "c-25": absentSeed("家庭出行请假"),
  "c-28": presentSeed("08:54", "17:04"),
  "c-30": absentSeed("轻微不适居家观察"),
  "c-33": absentSeed("家中照护安排请假"),
};

function applyTodayAttendanceOverrides(records: AttendanceRecord[]) {
  return records.map((record) => {
    const override = record.date === DEMO_TEMPLATE_TODAY ? DEMO_TODAY_ATTENDANCE_OVERRIDES[record.childId] : undefined;
    if (!override) {
      return { ...record };
    }

    if (override.isPresent) {
      return {
        ...record,
        isPresent: true,
        checkInAt: override.checkInAt,
        checkOutAt: override.checkOutAt,
        absenceReason: undefined,
      };
    }

    return {
      ...record,
      isPresent: false,
      checkInAt: undefined,
      checkOutAt: undefined,
      absenceReason: override.absenceReason,
    };
  });
}

const EXTRA_CHILD_SEEDS: ExtraChildSeed[] = [
  {
    child: {
      id: "c-17",
      name: "江沐晴",
      nickname: "沐沐",
      birthDate: "2025-09-14",
      gender: "女",
      allergies: ["虾"],
      heightCm: 76,
      weightKg: 9.6,
      guardians: [
        { name: "江妈妈", relation: "母亲", phone: "139****2618" },
        { name: "江爸爸", relation: "父亲", phone: "187****5312" },
      ],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "晨检体温波动，今天需二次复测。",
      avatar: "👶",
      parentUserId: "u-parent",
    },
    attendancePlan: [
      presentSeed("08:18", "17:02"),
      presentSeed("08:22", "17:06"),
      presentSeed("08:25", "16:58"),
      absentSeed("居家观察体温"),
      presentSeed("08:30", "16:56"),
      presentSeed("08:21", "17:04"),
      presentSeed("08:24", "16:52"),
    ],
    mealStyle: "gentleRecovery",
    healthStyle: "morningCheckAlert",
    growthSeeds: [
      {
        idSuffix: "mood-watch",
        dayIndex: 2,
        time: "09:35",
        recorder: "李老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["体温波动", "晨检跟踪"],
        description: "晨间活动参与正常，但精神略弱，已降低高强度活动安排。",
        needsAttention: true,
        followUpAction: "今天继续减少高强度活动并二次测温",
        reviewOffset: 1,
      },
      {
        idSuffix: "today-recheck",
        dayIndex: 6,
        time: "08:52",
        recorder: "李老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["待复查", "体温波动"],
        description: "今晨测温偏高后情绪有些黏人，已安排保健老师复测并同步家长。",
        needsAttention: true,
        followUpAction: "离园前复测体温并反馈家长",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "home-rest",
        dayIndex: 4,
        status: "已知晓",
        content: "昨晚已经提前休息，今天出门前也复测过体温，会继续配合观察。",
        createdBy: "江妈妈",
        createdByRole: "家长",
      },
      {
        idSuffix: "today-plan",
        dayIndex: 6,
        status: "今晚反馈",
        content: "今晚会减少活动量并记录睡前体温，明早把结果反馈给老师。",
        createdBy: "江妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [
      { idSuffix: "routine-1", dayIndex: 2, taskId: "task_001" },
      { idSuffix: "routine-2", dayIndex: 6, taskId: "task_004" },
    ],
  },
  {
    child: {
      id: "c-18",
      name: "顾宇航",
      nickname: "航航",
      birthDate: "2025-07-20",
      gender: "男",
      allergies: [],
      heightCm: 78,
      weightKg: 10.1,
      guardians: [{ name: "顾妈妈", relation: "母亲", phone: "136****8841" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "晨起轻咳，需关注咽喉与饮水。",
      avatar: "👦",
    },
    attendancePlan: [
      presentSeed("08:20", "17:01"),
      presentSeed("08:26", "17:09"),
      presentSeed("08:24", "17:04"),
      presentSeed("08:28", "17:08"),
      absentSeed("咽喉不适居家观察"),
      presentSeed("08:23", "17:05"),
      presentSeed("08:27", "17:03"),
    ],
    mealStyle: "gentleRecovery",
    healthStyle: "morningCheckAlert",
    growthSeeds: [
      {
        idSuffix: "cough-sleep",
        dayIndex: 3,
        time: "10:05",
        recorder: "李老师",
        recorderRole: "教师",
        category: "睡眠情况",
        tags: ["轻咳", "饮水提醒"],
        description: "午睡前有轻咳，已增加温水补充并减轻户外奔跑强度。",
        needsAttention: true,
        followUpAction: "继续跟踪咽喉状态并提醒主动饮水",
        reviewOffset: 1,
      },
      {
        idSuffix: "expression-steady",
        dayIndex: 6,
        time: "09:20",
        recorder: "李老师",
        recorderRole: "教师",
        category: "语言表达",
        tags: ["晨谈", "恢复稳定"],
        description: "今日晨谈愿意主动回应老师，咳嗽频次较前两日减少。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "drink-more",
        dayIndex: 5,
        status: "已知晓",
        content: "今天在家也会继续准备温水，观察咽喉和咳嗽频率。",
        createdBy: "顾妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [
      { idSuffix: "follow-1", dayIndex: 3, taskId: "task_002" },
      { idSuffix: "follow-2", dayIndex: 6, taskId: "task_005" },
    ],
  },
  {
    child: {
      id: "c-19",
      name: "杜若溪",
      nickname: "若若",
      birthDate: "2022-01-15",
      gender: "女",
      allergies: ["花生"],
      heightCm: 101,
      weightKg: 15.5,
      guardians: [{ name: "杜妈妈", relation: "母亲", phone: "158****4726" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "本周出现两次低热，需连续复查。",
      avatar: "👧",
    },
    attendancePlan: [
      presentSeed("08:11", "17:12"),
      presentSeed("08:14", "17:10"),
      absentSeed("晨起体温偏高居家观察"),
      presentSeed("08:17", "17:08"),
      presentSeed("08:12", "17:14"),
      presentSeed("08:16", "17:11"),
      presentSeed("08:10", "17:09"),
    ],
    mealStyle: "gentleRecovery",
    healthStyle: "morningCheckAlert",
    growthSeeds: [
      {
        idSuffix: "morning-watch",
        dayIndex: 1,
        time: "09:10",
        recorder: "周老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["低热观察", "待复查"],
        description: "晨间情绪略疲惫，参与活动意愿一般，需结合体温变化持续跟踪。",
        needsAttention: true,
        followUpAction: "保持轻量活动并连续记录晨检状态",
        reviewOffset: 2,
      },
      {
        idSuffix: "today-sleep",
        dayIndex: 6,
        time: "08:48",
        recorder: "周老师",
        recorderRole: "教师",
        category: "睡眠情况",
        tags: ["待复查", "晨起困倦"],
        description: "今日晨起精神恢复一般，老师已再次提醒家庭侧保证作息和补水。",
        needsAttention: true,
        followUpAction: "明早继续复测体温并关注睡眠时长",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [],
    taskSeeds: [
      { idSuffix: "temp-1", dayIndex: 1, taskId: "task_001" },
      { idSuffix: "temp-2", dayIndex: 4, taskId: "task_006" },
    ],
  },
  {
    child: {
      id: "c-20",
      name: "许嘉佑",
      nickname: "佑佑",
      birthDate: "2024-02-11",
      gender: "男",
      allergies: [],
      heightCm: 86,
      weightKg: 11.4,
      guardians: [{ name: "许妈妈", relation: "母亲", phone: "137****0914" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "入园分离焦虑明显，需要固定安抚流程。",
      avatar: "👦",
      parentUserId: "u-parent",
    },
    attendancePlan: [
      presentSeed("08:33", "16:58"),
      absentSeed("入园适应休整"),
      presentSeed("08:31", "17:03"),
      presentSeed("08:26", "17:06"),
      presentSeed("08:24", "17:10"),
      presentSeed("08:22", "17:08"),
      presentSeed("08:25", "17:05"),
    ],
    mealStyle: "balanced",
    healthStyle: "separationAnxiety",
    growthSeeds: [
      {
        idSuffix: "arrival-mood",
        dayIndex: 0,
        time: "08:58",
        recorder: "李老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["分离焦虑", "晨间交接"],
        description: "入园后持续哭闹约 10 分钟，在固定玩具和拥抱安抚后逐步平稳。",
        needsAttention: true,
        followUpAction: "继续固定交接流程并缩短家长停留时间",
        reviewOffset: 2,
      },
      {
        idSuffix: "today-mood",
        dayIndex: 6,
        time: "09:12",
        recorder: "李老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["入园适应", "待复查"],
        description: "今天仍有短暂哭闹，但能较快跟随老师进入点名环节。",
        needsAttention: true,
        followUpAction: "记录情绪恢复时长，周内复盘安抚流程效果",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "home-practice",
        dayIndex: 3,
        status: "已知晓",
        content: "今晚会继续做短时分离练习，帮助孩子熟悉早晨交接流程。",
        createdBy: "许妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [
      { idSuffix: "adapt-1", dayIndex: 0, taskId: "task_003" },
      { idSuffix: "adapt-2", dayIndex: 6, taskId: "task_006" },
    ],
  },
  {
    child: {
      id: "c-21",
      name: "温可心",
      nickname: "可可",
      birthDate: "2023-11-08",
      gender: "女",
      allergies: ["芒果"],
      heightCm: 84,
      weightKg: 11.0,
      guardians: [{ name: "温爸爸", relation: "父亲", phone: "135****6132" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "依恋照护者，入园后需要先完成熟悉的小任务。",
      avatar: "👧",
    },
    attendancePlan: [
      presentSeed("08:29", "17:04"),
      presentSeed("08:27", "17:02"),
      presentSeed("08:30", "17:08"),
      absentSeed("情绪调整休整"),
      presentSeed("08:26", "17:05"),
      presentSeed("08:22", "17:03"),
      presentSeed("08:24", "17:00"),
    ],
    mealStyle: "balanced",
    healthStyle: "separationAnxiety",
    growthSeeds: [
      {
        idSuffix: "task-transition",
        dayIndex: 2,
        time: "09:05",
        recorder: "李老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["依恋照护者", "过渡任务"],
        description: "完成摆放姓名卡的小任务后情绪逐步稳定，但离开熟悉老师仍会回头寻找。",
        needsAttention: true,
        followUpAction: "继续用固定小任务帮助完成晨间过渡",
        reviewOffset: 2,
      },
      {
        idSuffix: "social-better",
        dayIndex: 5,
        time: "09:18",
        recorder: "李老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["同伴模仿", "恢复中"],
        description: "今天能模仿同伴一起搬运积木，晨间黏人情况较本周前半段减轻。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [],
    taskSeeds: [{ idSuffix: "habit-1", dayIndex: 2, taskId: "task_001" }],
  },
  {
    child: {
      id: "c-22",
      name: "韩泽远",
      nickname: "远远",
      birthDate: "2021-09-23",
      gender: "男",
      allergies: [],
      heightCm: 104,
      weightKg: 16.4,
      guardians: [{ name: "韩妈妈", relation: "母亲", phone: "136****5008" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "周初交接情绪波动，安抚后恢复较快。",
      avatar: "👦",
    },
    attendancePlan: [
      presentSeed("08:09", "17:12"),
      presentSeed("08:11", "17:09"),
      absentSeed("家庭陪伴日"),
      presentSeed("08:13", "17:10"),
      presentSeed("08:15", "17:08"),
      presentSeed("08:12", "17:13"),
      presentSeed("08:10", "17:11"),
    ],
    mealStyle: "balanced",
    healthStyle: "separationAnxiety",
    growthSeeds: [
      {
        idSuffix: "arrival-support",
        dayIndex: 1,
        time: "09:15",
        recorder: "周老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["分离焦虑", "交接支持"],
        description: "入园后拉着家长不愿放手，老师陪同完成签到后约 6 分钟恢复平稳。",
        needsAttention: true,
        followUpAction: "坚持晨间固定签到动作，缩短交接时间",
        reviewOffset: 1,
      },
      {
        idSuffix: "peer-join",
        dayIndex: 6,
        time: "09:25",
        recorder: "周老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["晨间游戏", "恢复稳定"],
        description: "今天能在点名后主动加入同伴拼图活动，晨间交接明显顺畅。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "ack-today",
        dayIndex: 6,
        status: "已知晓",
        content: "已收到老师关于晨间交接改善的反馈，家里会继续配合同样的告别节奏。",
        createdBy: "韩妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [{ idSuffix: "transition-1", dayIndex: 1, taskId: "task_003" }],
  },
  {
    child: {
      id: "c-23",
      name: "沈语彤",
      nickname: "彤彤",
      birthDate: "2023-07-18",
      gender: "女",
      allergies: ["猕猴桃"],
      heightCm: 89,
      weightKg: 12.4,
      guardians: [{ name: "沈妈妈", relation: "母亲", phone: "188****3140" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "午睡入睡慢，醒后恢复也偏慢。",
      avatar: "👧",
      parentUserId: "u-parent",
    },
    attendancePlan: [
      presentSeed("08:24", "17:03"),
      presentSeed("08:21", "17:06"),
      presentSeed("08:22", "17:05"),
      presentSeed("08:20", "17:04"),
      absentSeed("午睡调整在家休息"),
      presentSeed("08:25", "17:02"),
      presentSeed("08:23", "17:00"),
    ],
    mealStyle: "gentleRecovery",
    healthStyle: "napWatch",
    growthSeeds: [
      {
        idSuffix: "nap-slow",
        dayIndex: 1,
        time: "13:20",
        recorder: "李老师",
        recorderRole: "教师",
        category: "睡眠情况",
        tags: ["午睡入睡难", "午后困倦"],
        description: "午睡入睡超过 25 分钟，期间翻身频繁，需要老师陪伴拍抚。",
        needsAttention: true,
        followUpAction: "午睡前提前进入安静过渡流程",
        reviewOffset: 1,
      },
      {
        idSuffix: "nap-wake",
        dayIndex: 5,
        time: "14:05",
        recorder: "李老师",
        recorderRole: "教师",
        category: "睡眠情况",
        tags: ["易醒", "待复查"],
        description: "午睡中途醒来后难以再次入睡，下午活动出现明显困倦。",
        needsAttention: true,
        followUpAction: "连续跟踪午睡时长并同步家庭晚间作息",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "home-routine",
        dayIndex: 2,
        status: "在家已配合",
        content: "在家已按建议提前洗漱和关灯，今晚继续保持固定午睡前安静流程。",
        createdBy: "沈妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [
      { idSuffix: "nap-1", dayIndex: 1, taskId: "task_002" },
      { idSuffix: "nap-2", dayIndex: 5, taskId: "task_006" },
    ],
  },
  {
    child: {
      id: "c-24",
      name: "唐子睿",
      nickname: "睿睿",
      birthDate: "2023-03-29",
      gender: "男",
      allergies: [],
      heightCm: 91,
      weightKg: 13.2,
      guardians: [{ name: "唐爸爸", relation: "父亲", phone: "134****7820" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "午睡时需要更长时间进入安静状态。",
      avatar: "👦",
    },
    attendancePlan: [
      presentSeed("08:26", "17:04"),
      presentSeed("08:23", "17:02"),
      presentSeed("08:21", "17:03"),
      presentSeed("08:24", "17:06"),
      presentSeed("08:20", "17:05"),
      absentSeed("午睡观察居家休整"),
      presentSeed("08:22", "17:01"),
    ],
    mealStyle: "gentleRecovery",
    healthStyle: "napWatch",
    growthSeeds: [
      {
        idSuffix: "nap-transition",
        dayIndex: 3,
        time: "13:45",
        recorder: "李老师",
        recorderRole: "教师",
        category: "睡眠情况",
        tags: ["午睡观察", "安静过渡"],
        description: "午睡前翻身和说话较多，需要额外陪伴才能逐步入睡。",
        needsAttention: true,
        followUpAction: "午睡前增加呼吸放松和轻音乐过渡",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "home-follow",
        dayIndex: 4,
        status: "在家已配合",
        content: "这两天在家已提前半小时开始睡前准备，会继续配合老师观察。",
        createdBy: "唐爸爸",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [{ idSuffix: "nap-1", dayIndex: 3, taskId: "task_004" }],
  },
  {
    child: {
      id: "c-25",
      name: "罗诗涵",
      nickname: "诗诗",
      birthDate: "2021-11-05",
      gender: "女",
      allergies: [],
      heightCm: 103,
      weightKg: 16.2,
      guardians: [{ name: "罗妈妈", relation: "母亲", phone: "151****9063" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "午后容易犯困，需关注连续午睡质量。",
      avatar: "👧",
    },
    attendancePlan: [
      presentSeed("08:12", "17:14"),
      presentSeed("08:13", "17:11"),
      presentSeed("08:15", "17:10"),
      presentSeed("08:10", "17:12"),
      presentSeed("08:14", "17:13"),
      presentSeed("08:11", "17:12"),
      presentSeed("08:09", "17:09"),
    ],
    mealStyle: "gentleRecovery",
    healthStyle: "napWatch",
    growthSeeds: [
      {
        idSuffix: "nap-late",
        dayIndex: 4,
        time: "14:10",
        recorder: "周老师",
        recorderRole: "教师",
        category: "睡眠情况",
        tags: ["午睡不足", "午后困倦"],
        description: "今日午睡时长不足，午后集体活动出现揉眼和反应变慢。",
        needsAttention: true,
        followUpAction: "连续观察午睡时长并优化中午过渡节奏",
        reviewOffset: 1,
      },
      {
        idSuffix: "expression-ok",
        dayIndex: 6,
        time: "15:05",
        recorder: "周老师",
        recorderRole: "教师",
        category: "语言表达",
        tags: ["分享", "状态恢复"],
        description: "今天下午愿意完整复述绘本内容，精神状态较前两日更稳定。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [],
    taskSeeds: [{ idSuffix: "nap-1", dayIndex: 4, taskId: "task_002" }],
  },
  {
    child: {
      id: "c-26",
      name: "邵景行",
      nickname: "景景",
      birthDate: "2022-08-14",
      gender: "男",
      allergies: [],
      heightCm: 98,
      weightKg: 15.1,
      guardians: [{ name: "邵妈妈", relation: "母亲", phone: "139****4406" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "偏食明显，饮水主动性不足，需要双重提醒。",
      avatar: "👦",
      parentUserId: "u-parent",
    },
    attendancePlan: [
      presentSeed("08:19", "17:07"),
      presentSeed("08:22", "17:05"),
      presentSeed("08:20", "17:03"),
      presentSeed("08:23", "17:06"),
      presentSeed("08:24", "17:08"),
      presentSeed("08:21", "17:04"),
      presentSeed("08:18", "17:02"),
    ],
    mealStyle: "hydrationFocusNeeded",
    healthStyle: "hydrationWatch",
    growthSeeds: [
      {
        idSuffix: "food-watch",
        dayIndex: 2,
        time: "11:40",
        recorder: "李老师",
        recorderRole: "教师",
        category: "独立进食",
        tags: ["偏食", "补水不足"],
        description: "午餐挑出大部分蔬菜，老师多次提醒后饮水量仍偏低。",
        needsAttention: true,
        followUpAction: "继续采用小口喝水提醒并做蔬菜示范进食",
        reviewOffset: 1,
      },
      {
        idSuffix: "today-food",
        dayIndex: 6,
        time: "11:55",
        recorder: "李老师",
        recorderRole: "教师",
        category: "独立进食",
        tags: ["低蔬菜摄入", "待复查"],
        description: "今天主食摄入稳定，但蔬菜剩余较多，饮水仍依赖老师提示。",
        needsAttention: true,
        followUpAction: "家园同步设置餐后喝水和尝菜小目标",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "meal-home",
        dayIndex: 5,
        status: "已知晓",
        content: "已收到老师关于偏食和喝水的提醒，周末会继续练习尝试蔬菜。",
        createdBy: "邵妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [
      { idSuffix: "meal-1", dayIndex: 2, taskId: "task_005" },
      { idSuffix: "meal-2", dayIndex: 6, taskId: "task_006" },
    ],
  },
  {
    child: {
      id: "c-27",
      name: "贺知夏",
      nickname: "夏夏",
      birthDate: "2021-12-30",
      gender: "女",
      allergies: ["虾"],
      heightCm: 104,
      weightKg: 16.0,
      guardians: [{ name: "贺爸爸", relation: "父亲", phone: "150****1273" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "蔬菜接受度低，喝水量需要外部提醒。",
      avatar: "👧",
    },
    attendancePlan: [
      presentSeed("08:13", "17:11"),
      presentSeed("08:12", "17:09"),
      absentSeed("家庭活动请假"),
      presentSeed("08:15", "17:08"),
      presentSeed("08:11", "17:10"),
      presentSeed("08:14", "17:12"),
      presentSeed("08:09", "17:07"),
    ],
    mealStyle: "hydrationFocusNeeded",
    healthStyle: "hydrationWatch",
    growthSeeds: [
      {
        idSuffix: "veg-watch",
        dayIndex: 4,
        time: "11:35",
        recorder: "周老师",
        recorderRole: "教师",
        category: "独立进食",
        tags: ["偏食", "蔬菜摄入低"],
        description: "今日午餐对绿色蔬菜抗拒明显，饮水量也低于班级平均水平。",
        needsAttention: true,
        followUpAction: "提供少量分次尝试并加强餐前喝水提示",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "meal-ack",
        dayIndex: 5,
        status: "已知晓",
        content: "已看到老师关于蔬菜摄入的提醒，会在家继续做少量多次尝试。",
        createdBy: "贺爸爸",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [{ idSuffix: "meal-1", dayIndex: 4, taskId: "task_003" }],
  },
  {
    child: {
      id: "c-28",
      name: "苏奕辰",
      nickname: "奕奕",
      birthDate: "2021-06-17",
      gender: "男",
      allergies: [],
      heightCm: 107,
      weightKg: 16.8,
      guardians: [{ name: "苏妈妈", relation: "母亲", phone: "156****2840" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "补水量连续偏低，餐后主动喝水习惯未建立。",
      avatar: "👦",
    },
    attendancePlan: [
      presentSeed("08:10", "17:12"),
      presentSeed("08:14", "17:10"),
      presentSeed("08:12", "17:08"),
      absentSeed("接种疫苗休息"),
      presentSeed("08:11", "17:09"),
      presentSeed("08:13", "17:11"),
      presentSeed("08:09", "17:08"),
    ],
    mealStyle: "hydrationFocusNeeded",
    healthStyle: "hydrationWatch",
    growthSeeds: [
      {
        idSuffix: "water-watch",
        dayIndex: 1,
        time: "15:10",
        recorder: "周老师",
        recorderRole: "教师",
        category: "独立进食",
        tags: ["补水不足", "加餐提醒"],
        description: "加餐后未主动补水，需老师连续两次提醒才愿意小口喝水。",
        needsAttention: true,
        followUpAction: "建立固定喝水口令并在活动转换时补水",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [],
    taskSeeds: [
      { idSuffix: "water-1", dayIndex: 1, taskId: "task_001" },
      { idSuffix: "water-2", dayIndex: 5, taskId: "task_004" },
    ],
  },
  {
    child: {
      id: "c-29",
      name: "叶芷宁",
      nickname: "宁宁",
      birthDate: "2024-01-26",
      gender: "女",
      allergies: [],
      heightCm: 85,
      weightKg: 11.3,
      guardians: [{ name: "叶妈妈", relation: "母亲", phone: "137****2459" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "情绪表达较直接，环境变化时容易先哭再说需求。",
      avatar: "👧",
      parentUserId: "u-parent",
    },
    attendancePlan: [
      presentSeed("08:27", "17:02"),
      presentSeed("08:25", "17:04"),
      presentSeed("08:22", "17:05"),
      presentSeed("08:29", "17:01"),
      absentSeed("情绪休整半日请假"),
      presentSeed("08:24", "17:03"),
      presentSeed("08:21", "17:00"),
    ],
    mealStyle: "balanced",
    healthStyle: "emotionWatch",
    growthSeeds: [
      {
        idSuffix: "emotion-language",
        dayIndex: 3,
        time: "10:40",
        recorder: "李老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["情绪表达", "转场敏感"],
        description: "从户外回教室时因等待顺序而哭泣，安抚后能说出自己想先洗手。",
        needsAttention: true,
        followUpAction: "帮助用简单句先表达需求，再进入转场流程",
        reviewOffset: 1,
      },
      {
        idSuffix: "today-better",
        dayIndex: 6,
        time: "10:55",
        recorder: "李老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["情绪恢复", "表达进步"],
        description: "今天能先说出‘我还想玩一下’再寻求老师帮助，哭闹明显减少。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "tonight-update",
        dayIndex: 6,
        status: "今晚反馈",
        content: "今晚会继续练习先说需求再哭闹，明天把家庭表现同步给老师。",
        createdBy: "叶妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [{ idSuffix: "emotion-1", dayIndex: 3, taskId: "task_002" }],
  },
  {
    child: {
      id: "c-30",
      name: "邢宇哲",
      nickname: "哲哲",
      birthDate: "2022-04-09",
      gender: "男",
      allergies: ["菠萝"],
      heightCm: 100,
      weightKg: 15.7,
      guardians: [{ name: "邢爸爸", relation: "父亲", phone: "133****6504" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "对突发噪音敏感，需提前做转场提醒。",
      avatar: "👦",
    },
    attendancePlan: [
      presentSeed("08:12", "17:10"),
      presentSeed("08:10", "17:08"),
      presentSeed("08:14", "17:09"),
      presentSeed("08:11", "17:11"),
      presentSeed("08:15", "17:12"),
      absentSeed("感官调节复盘"),
      presentSeed("08:09", "17:08"),
    ],
    mealStyle: "hydrationFocusNeeded",
    healthStyle: "emotionWatch",
    growthSeeds: [
      {
        idSuffix: "sensory-watch",
        dayIndex: 2,
        time: "10:20",
        recorder: "周老师",
        recorderRole: "教师",
        category: "情绪表现",
        tags: ["感官敏感", "环境变化"],
        description: "教室噪音增大时捂耳并离开队列，需老师带去安静角缓冲。",
        needsAttention: true,
        followUpAction: "转场前做语言预告，保留安静角调节时间",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "sensory-home",
        dayIndex: 3,
        status: "已知晓",
        content: "已了解孩子对噪音敏感，家里也会提前提醒并练习深呼吸。",
        createdBy: "邢爸爸",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [{ idSuffix: "emotion-1", dayIndex: 2, taskId: "task_004" }],
  },
  {
    child: {
      id: "c-31",
      name: "魏知语",
      nickname: "语语",
      birthDate: "2021-08-21",
      gender: "女",
      allergies: [],
      heightCm: 105,
      weightKg: 16.1,
      guardians: [{ name: "魏妈妈", relation: "母亲", phone: "152****3175" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "情绪感受细腻，转场前需要更明确的语言提示。",
      avatar: "👧",
    },
    attendancePlan: [
      presentSeed("08:09", "17:11"),
      presentSeed("08:12", "17:12"),
      absentSeed("家庭活动请假"),
      presentSeed("08:14", "17:09"),
      presentSeed("08:10", "17:10"),
      presentSeed("08:13", "17:08"),
      presentSeed("08:11", "17:07"),
    ],
    mealStyle: "hydrationFocusNeeded",
    healthStyle: "emotionWatch",
    growthSeeds: [
      {
        idSuffix: "expression-watch",
        dayIndex: 5,
        time: "10:35",
        recorder: "周老师",
        recorderRole: "教师",
        category: "语言表达",
        tags: ["情绪表达", "转场不稳"],
        description: "在活动切换时会低声说不想结束，但还不够主动请求帮助。",
        needsAttention: true,
        followUpAction: "引导用完整句表达情绪和需求",
        reviewOffset: 1,
      },
    ],
    feedbackSeeds: [],
    taskSeeds: [
      { idSuffix: "emotion-1", dayIndex: 5, taskId: "task_003" },
      { idSuffix: "emotion-2", dayIndex: 6, taskId: "task_005" },
    ],
  },
  {
    child: {
      id: "c-32",
      name: "傅靖然",
      nickname: "然然",
      birthDate: "2022-02-18",
      gender: "男",
      allergies: [],
      heightCm: 101,
      weightKg: 15.6,
      guardians: [
        { name: "傅妈妈", relation: "母亲", phone: "139****8260" },
        { name: "傅姑姑", relation: "姑姑", phone: "136****7281" },
      ],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "社交冲突后容易沉默，需要老师帮助复盘表达。",
      avatar: "👦",
      parentUserId: "u-parent",
    },
    attendancePlan: [
      presentSeed("08:10", "17:12"),
      presentSeed("08:12", "17:10"),
      presentSeed("08:11", "17:08"),
      presentSeed("08:09", "17:11"),
      presentSeed("08:13", "17:09"),
      presentSeed("08:10", "17:12"),
      presentSeed("08:08", "17:08"),
    ],
    mealStyle: "balanced",
    healthStyle: "socialCoaching",
    growthSeeds: [
      {
        idSuffix: "conflict-watch",
        dayIndex: 4,
        time: "10:50",
        recorder: "周老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["冲突调解", "表达支持"],
        description: "积木轮流时与同伴发生争抢，安静后能在老师引导下复述经过。",
        needsAttention: true,
        followUpAction: "继续练习‘我先说、再协商’的社交句式",
        reviewOffset: 1,
      },
      {
        idSuffix: "today-better",
        dayIndex: 6,
        time: "11:05",
        recorder: "周老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["同伴合作", "恢复稳定"],
        description: "今天能主动邀请同伴分工搭建，冲突后恢复速度明显更快。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "home-coach",
        dayIndex: 4,
        status: "在家已配合",
        content: "在家已练习先说感受再协商，感谢老师今天的冲突复盘支持。",
        createdBy: "傅妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [{ idSuffix: "social-1", dayIndex: 4, taskId: "task_001" }],
  },
  {
    child: {
      id: "c-33",
      name: "黎曼婷",
      nickname: "曼曼",
      birthDate: "2021-03-07",
      gender: "女",
      allergies: ["芒果"],
      heightCm: 108,
      weightKg: 17.0,
      guardians: [{ name: "黎妈妈", relation: "母亲", phone: "138****1957" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "同伴互动积极，但冲突后容易委屈，需要老师陪伴复盘。",
      avatar: "👧",
    },
    attendancePlan: [
      presentSeed("08:09", "17:10"),
      presentSeed("08:11", "17:09"),
      presentSeed("08:13", "17:11"),
      presentSeed("08:10", "17:08"),
      absentSeed("家庭日请假"),
      presentSeed("08:12", "17:12"),
      presentSeed("08:08", "17:07"),
    ],
    mealStyle: "balanced",
    healthStyle: "socialCoaching",
    growthSeeds: [
      {
        idSuffix: "peer-share",
        dayIndex: 6,
        time: "10:15",
        recorder: "周老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["同伴支持", "集体参与"],
        description: "今天主动邀请低龄同伴一起玩角色游戏，能等待轮流并鼓励别人加入。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "home-share",
        dayIndex: 4,
        status: "在家已配合",
        content: "在家也会继续练习轮流和表达感受，孩子这周很愿意分享在园故事。",
        createdBy: "黎妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [{ idSuffix: "social-1", dayIndex: 6, taskId: "task_006" }],
  },
  {
    child: {
      id: "c-34",
      name: "薛承宇",
      nickname: "承承",
      birthDate: "2020-10-30",
      gender: "男",
      allergies: [],
      heightCm: 112,
      weightKg: 18.4,
      guardians: [{ name: "薛爸爸", relation: "父亲", phone: "189****4208" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "集体活动参与度波动，冲突后需要引导回到团队。",
      avatar: "👦",
    },
    attendancePlan: [
      presentSeed("08:08", "17:10"),
      presentSeed("08:12", "17:12"),
      presentSeed("08:11", "17:09"),
      presentSeed("08:09", "17:08"),
      presentSeed("08:13", "17:11"),
      presentSeed("08:10", "17:07"),
      presentSeed("08:08", "17:06"),
    ],
    mealStyle: "balanced",
    healthStyle: "socialCoaching",
    growthSeeds: [
      {
        idSuffix: "group-watch",
        dayIndex: 2,
        time: "10:40",
        recorder: "周老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["集体参与差异", "待复查"],
        description: "集体搭建时一度离开队伍并推开同伴，需老师带回并复盘规则。",
        needsAttention: true,
        followUpAction: "继续练习等待轮流和用语言表达不满",
        reviewOffset: 2,
      },
    ],
    feedbackSeeds: [],
    taskSeeds: [{ idSuffix: "social-1", dayIndex: 2, taskId: "task_002" }],
  },
  {
    child: {
      id: "c-35",
      name: "宋知微",
      nickname: "微微",
      birthDate: "2024-03-15",
      gender: "女",
      allergies: [],
      heightCm: 87,
      weightKg: 11.8,
      guardians: [{ name: "宋妈妈", relation: "母亲", phone: "139****5538" }],
      institutionId: "inst-1",
      className: "向阳班",
      specialNotes: "饮水和表达都很主动，适合做正向示范。",
      avatar: "👧",
      parentUserId: "u-parent",
    },
    attendancePlan: [
      presentSeed("08:20", "17:08"),
      presentSeed("08:21", "17:06"),
      presentSeed("08:18", "17:05"),
      presentSeed("08:22", "17:07"),
      presentSeed("08:19", "17:09"),
      presentSeed("08:20", "17:04"),
      presentSeed("08:17", "17:03"),
    ],
    mealStyle: "positiveHighHydration",
    healthStyle: "positiveSteady",
    growthSeeds: [
      {
        idSuffix: "social-highlight",
        dayIndex: 5,
        time: "10:25",
        recorder: "李老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["正向成长", "主动邀请"],
        description: "今天主动邀请新朋友一起玩厨房游戏，还会分发餐具道具给同伴。",
        needsAttention: false,
      },
      {
        idSuffix: "language-highlight",
        dayIndex: 6,
        time: "11:00",
        recorder: "李老师",
        recorderRole: "教师",
        category: "语言表达",
        tags: ["正向成长", "表达清晰"],
        description: "能完整说出活动步骤并提醒同伴喝水，表达自信且清晰。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [
      {
        idSuffix: "home-praise",
        dayIndex: 6,
        status: "在家已配合",
        content: "谢谢老师分享正向表现，孩子回家也会主动提醒家人喝水和排队。",
        createdBy: "宋妈妈",
        createdByRole: "家长",
      },
    ],
    taskSeeds: [
      { idSuffix: "positive-1", dayIndex: 5, taskId: "task_001" },
      { idSuffix: "positive-2", dayIndex: 6, taskId: "task_003" },
    ],
  },
  {
    child: {
      id: "c-36",
      name: "程昊辰",
      nickname: "昊昊",
      birthDate: "2020-09-12",
      gender: "男",
      allergies: [],
      heightCm: 113,
      weightKg: 18.8,
      guardians: [{ name: "程爸爸", relation: "父亲", phone: "135****6147" }],
      institutionId: "inst-1",
      className: "晨曦班",
      specialNotes: "规则意识较好，集体活动中常能给出正向示范。",
      avatar: "👦",
    },
    attendancePlan: [
      presentSeed("08:07", "17:11"),
      presentSeed("08:09", "17:10"),
      presentSeed("08:08", "17:09"),
      presentSeed("08:10", "17:08"),
      presentSeed("08:11", "17:12"),
      presentSeed("08:09", "17:10"),
      presentSeed("08:08", "17:07"),
    ],
    mealStyle: "positiveHighHydration",
    healthStyle: "positiveSteady",
    growthSeeds: [
      {
        idSuffix: "language-highlight",
        dayIndex: 3,
        time: "10:30",
        recorder: "周老师",
        recorderRole: "教师",
        category: "语言表达",
        tags: ["正向成长", "分享表达"],
        description: "集体分享时能清楚说明观察到的春天变化，并主动倾听同伴发言。",
        needsAttention: false,
      },
      {
        idSuffix: "social-highlight",
        dayIndex: 6,
        time: "11:10",
        recorder: "周老师",
        recorderRole: "教师",
        category: "社交互动",
        tags: ["榜样示范", "合作稳定"],
        description: "今天在合作搭建中主动分工并帮助同伴完成收尾，团队配合稳定。",
        needsAttention: false,
      },
    ],
    feedbackSeeds: [],
    taskSeeds: [
      { idSuffix: "positive-1", dayIndex: 3, taskId: "task_005" },
      { idSuffix: "positive-2", dayIndex: 6, taskId: "task_006" },
    ],
  },
];

const EXTRA_CHILDREN: Child[] = EXTRA_CHILD_SEEDS.map((seed) => seed.child);
const EXTRA_CHILD_SEED_MAP = new Map(EXTRA_CHILD_SEEDS.map((seed) => [seed.child.id, seed] as const));

const EXTRA_ATTENDANCE: AttendanceRecord[] = EXTRA_CHILD_SEEDS.flatMap((seed) =>
  seed.attendancePlan.map((record, dayIndex) => ({
    id: `a-${seed.child.id}-${dayIndex + 1}`,
    childId: seed.child.id,
    date: DEMO_WEEK_DATES[dayIndex],
    ...record,
  }))
);

const EXTRA_MEALS: MealRecord[] = EXTRA_ATTENDANCE.flatMap((attendance) => {
  if (!attendance.isPresent) return [];
  const seed = EXTRA_CHILD_SEED_MAP.get(attendance.childId);
  if (!seed) return [];
  const dayIndex = DEMO_WEEK_DATES.indexOf(attendance.date);
  const mealPlan = buildExtraMealPlan(seed.mealStyle, dayIndex);
  const recorder = seed.child.className === "晨曦班" ? "周老师" : "李老师";

  return [
    createMealRecord(
      `m-${attendance.childId}-${dayIndex + 1}-breakfast`,
      attendance.childId,
      attendance.date,
      "早餐",
      mealPlan.breakfastFoods,
      mealPlan.breakfastWater,
      mealPlan.breakfastPreference,
      recorder,
      "教师",
      mealPlan.breakfastIntake
    ),
    createMealRecord(
      `m-${attendance.childId}-${dayIndex + 1}-lunch`,
      attendance.childId,
      attendance.date,
      "午餐",
      mealPlan.lunchFoods,
      mealPlan.lunchWater,
      mealPlan.lunchPreference,
      recorder,
      "教师",
      mealPlan.lunchIntake
    ),
    createMealRecord(
      `m-${attendance.childId}-${dayIndex + 1}-snack`,
      attendance.childId,
      attendance.date,
      "加餐",
      mealPlan.snackFoods,
      mealPlan.snackWater,
      mealPlan.snackPreference,
      recorder,
      "教师",
      mealPlan.snackIntake
    ),
  ];
});

const EXTRA_HEALTH_CHECKS: HealthCheckRecord[] = EXTRA_ATTENDANCE.flatMap((attendance) => {
  if (!attendance.isPresent) return [];
  const seed = EXTRA_CHILD_SEED_MAP.get(attendance.childId);
  if (!seed) return [];
  const dayIndex = DEMO_WEEK_DATES.indexOf(attendance.date);
  const healthEntry = buildExtraHealthEntry(seed.healthStyle, seed.child.id, dayIndex);
  const checker = seed.child.className === "晨曦班" ? "周老师" : "李老师";

  return [
    createHealthRecord(
      `hc-${attendance.childId}-${dayIndex + 1}`,
      attendance.childId,
      attendance.date,
      healthEntry.temperature,
      healthEntry.mood,
      healthEntry.remark,
      checker,
      "教师",
      healthEntry.handMouthEye
    ),
  ];
});

const EXTRA_GROWTH: GrowthRecord[] = EXTRA_CHILD_SEEDS.flatMap((seed) =>
  seed.growthSeeds.map((growthSeed) => buildExtraGrowthRecord(seed.child.id, growthSeed))
);

const EXTRA_FEEDBACKS: GuardianFeedbackInput[] = EXTRA_CHILD_SEEDS.flatMap((seed) =>
  seed.feedbackSeeds.map((feedbackSeed) => buildExtraFeedbackRecord(seed.child.id, feedbackSeed))
);

const EXTRA_TASK_CHECKINS: TaskCheckInRecord[] = EXTRA_CHILD_SEEDS.flatMap((seed) =>
  seed.taskSeeds.map((taskSeed) => buildExtraTaskCheckInRecord(seed.child.id, taskSeed))
);

const ALL_INITIAL_CHILDREN = [...INITIAL_CHILDREN, ...EXTRA_CHILDREN];
const ALL_INITIAL_ATTENDANCE = applyTodayAttendanceOverrides([...INITIAL_ATTENDANCE, ...EXTRA_ATTENDANCE]);
const ALL_INITIAL_MEALS = attachDemoMealPhotos([...INITIAL_MEALS, ...EXTRA_MEALS]);
const ALL_INITIAL_HEALTH_CHECKS = [...INITIAL_HEALTH_CHECKS, ...EXTRA_HEALTH_CHECKS];
const ALL_INITIAL_GROWTH = attachDemoGrowthMedia([...INITIAL_GROWTH, ...EXTRA_GROWTH]);
const ALL_INITIAL_FEEDBACKS = [...INITIAL_FEEDBACKS, ...EXTRA_FEEDBACKS];
const ALL_INITIAL_TASK_CHECKINS = [...INITIAL_TASK_CHECKINS, ...EXTRA_TASK_CHECKINS];


export function AppProvider({ children: childNodes }: { children: ReactNode }) {
  const demoAccounts = INITIAL_USERS;
  const [currentUser, setCurrentUser] = useState<User>(UNAUTHENTICATED_USER);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [childrenList, setChildrenList] = useState<Child[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [mealRecords, setMealRecords] = useState<MealRecord[]>([]);
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>([]);
  const [guardianFeedbacks, setGuardianFeedbacks] = useState<GuardianFeedback[]>([]);
  const [healthCheckRecords, setHealthCheckRecords] = useState<HealthCheckRecord[]>([]);
  const [taskCheckInRecords, setTaskCheckInRecords] = useState<TaskCheckInRecord[]>([]);
  const [interventionCards, setInterventionCards] = useState<InterventionCard[]>([]);
  const [consultations, setConsultations] = useState<ConsultationResult[]>([]);
  const [mobileDrafts, setMobileDrafts] = useState<MobileDraft[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [tasks, setTasks] = useState<CanonicalTask[]>([]);
  const lastSyncedSnapshotKeyRef = useRef<string | null>(null);
  const isAuthenticated = currentUser.id !== UNAUTHENTICATED_USER.id;
  const isDemoUser = isAuthenticated && currentUser.accountKind === "demo";
  const isNormalUser = isAuthenticated && currentUser.accountKind === "normal";
  const currentStorageNamespace =
    isNormalUser && currentUser.institutionId
      ? `normal:${currentUser.institutionId}:${currentUser.role}:${currentUser.id}`
      : isDemoUser
        ? `demo:${DEMO_DATASET_VERSION}:${currentUser.id}`
        : null;
  const snapshotStateRef = useRef({
    children: [] as Child[],
    attendance: [] as AttendanceRecord[],
    meals: [] as MealRecord[],
    growth: [] as GrowthRecord[],
    feedback: [] as GuardianFeedback[],
    health: [] as HealthCheckRecord[],
    taskCheckIns: [] as TaskCheckInRecord[],
    interventionCards: [] as InterventionCard[],
    consultations: [] as ConsultationResult[],
    mobileDrafts: [] as MobileDraft[],
    reminders: [] as ReminderItem[],
    tasks: [] as CanonicalTask[],
  });

  snapshotStateRef.current = {
    children: childrenList,
    attendance: attendanceRecords,
    meals: mealRecords,
    growth: growthRecords,
    feedback: guardianFeedbacks,
    health: healthCheckRecords,
    taskCheckIns: taskCheckInRecords,
    interventionCards,
    consultations,
    mobileDrafts,
    reminders,
    tasks,
  };

  const applySnapshot = useCallback((snapshot: AppStateSnapshot) => {
    setChildrenList(snapshot.children);
    setAttendanceRecords(snapshot.attendance);
    setMealRecords(normalizeRecords(snapshot.meals));
    setGrowthRecords(snapshot.growth);
    setGuardianFeedbacks(snapshot.feedback);
    setHealthCheckRecords(snapshot.health);
    setTaskCheckInRecords(snapshot.taskCheckIns);
    setInterventionCards(snapshot.interventionCards);
    setConsultations(snapshot.consultations);
    setMobileDrafts(snapshot.mobileDrafts);
    setReminders(snapshot.reminders);
    setTasks(snapshot.tasks);
  }, []);

  const buildSnapshotWithOverride = useCallback(
    (override?: Partial<AppStateSnapshot>): AppStateSnapshot => ({
      children: override?.children ?? snapshotStateRef.current.children,
      attendance: override?.attendance ?? snapshotStateRef.current.attendance,
      meals: override?.meals ?? snapshotStateRef.current.meals,
      growth: override?.growth ?? snapshotStateRef.current.growth,
      feedback: override?.feedback ?? snapshotStateRef.current.feedback,
      health: override?.health ?? snapshotStateRef.current.health,
      taskCheckIns: override?.taskCheckIns ?? snapshotStateRef.current.taskCheckIns,
      interventionCards: override?.interventionCards ?? snapshotStateRef.current.interventionCards,
      consultations: override?.consultations ?? snapshotStateRef.current.consultations,
      mobileDrafts: override?.mobileDrafts ?? snapshotStateRef.current.mobileDrafts,
      reminders: override?.reminders ?? snapshotStateRef.current.reminders,
      tasks: override?.tasks ?? snapshotStateRef.current.tasks,
      updatedAt: override?.updatedAt ?? new Date().toISOString(),
    }),
    []
  );

  useEffect(() => {
    setTasks((prev) =>
      materializeTasksFromLegacy({
        existingTasks: prev,
        interventionCards,
        consultations,
        reminders,
        guardianFeedbacks,
        taskCheckIns: taskCheckInRecords,
      })
    );
  }, [consultations, guardianFeedbacks, interventionCards, reminders, taskCheckInRecords]);

  const remoteSnapshot = useMemo<AppStateSnapshot>(
    () =>
      buildSnapshotWithOverride({
        children: childrenList,
        attendance: attendanceRecords,
        meals: mealRecords,
        growth: growthRecords,
        feedback: guardianFeedbacks,
        health: healthCheckRecords,
        taskCheckIns: taskCheckInRecords,
        interventionCards,
        consultations,
        mobileDrafts,
        reminders,
        tasks,
      }),
    [
      buildSnapshotWithOverride,
      childrenList,
      attendanceRecords,
      mealRecords,
      growthRecords,
      guardianFeedbacks,
      healthCheckRecords,
      taskCheckInRecords,
      interventionCards,
      consultations,
      mobileDrafts,
      reminders,
      tasks,
    ]
  );

  const remoteSnapshotKey = useMemo(() => JSON.stringify(remoteSnapshot), [remoteSnapshot]);

  const isSnapshotEffectivelyEmpty = useCallback((snapshot: AppStateSnapshot) => {
    return (
      snapshot.children.length === 0 &&
      snapshot.attendance.length === 0 &&
      snapshot.meals.length === 0 &&
      snapshot.growth.length === 0 &&
      snapshot.feedback.length === 0 &&
      snapshot.health.length === 0 &&
      snapshot.taskCheckIns.length === 0 &&
      snapshot.interventionCards.length === 0 &&
      snapshot.consultations.length === 0 &&
      snapshot.mobileDrafts.length === 0 &&
      snapshot.reminders.length === 0 &&
      snapshot.tasks.length === 0
    );
  }, []);

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          if (active) {
            setCurrentUser(UNAUTHENTICATED_USER);
          }
          return;
        }
        const data = (await response.json()) as { ok?: boolean; user?: User | null };
        if (!active) {
          return;
        }
        setCurrentUser(data.ok && data.user ? data.user : UNAUTHENTICATED_USER);
      } catch {
        if (active) {
          setCurrentUser(UNAUTHENTICATED_USER);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let active = true;
    setDataLoading(true);

    const loadSnapshotForUser = async () => {
      if (!isAuthenticated) {
        lastSyncedSnapshotKeyRef.current = null;
        applySnapshot(emptyInstitutionSnapshot());
        if (active) {
          setDataLoading(false);
        }
        return;
      }

      if (isDemoUser) {
        lastSyncedSnapshotKeyRef.current = null;
        const rawDemoSnapshot = readScopedSnapshot(
          currentStorageNamespace ?? `demo:${currentUser.id}`,
          buildFreshDemoSnapshot(getLocalToday())
        );
        const demoSnapshot =
          normalizeAppStateSnapshot(rawDemoSnapshot) ?? buildFreshDemoSnapshot(getLocalToday());
        applySnapshot(scopeSnapshotForSessionUser(hydrateDemoSnapshotForToday(demoSnapshot), currentUser));
        if (active) {
          setDataLoading(false);
        }
        return;
      }

      if (!currentStorageNamespace) {
        lastSyncedSnapshotKeyRef.current = null;
        applySnapshot(emptyInstitutionSnapshot());
        if (active) {
          setDataLoading(false);
        }
        return;
      }

      const fallbackSnapshot = emptyInstitutionSnapshot();
      const localSnapshot = readScopedSnapshot(currentStorageNamespace, fallbackSnapshot);
      applySnapshot(scopeSnapshotForSessionUser(localSnapshot, currentUser));
      lastSyncedSnapshotKeyRef.current = null;

      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          ok?: boolean;
          snapshot?: AppStateSnapshot | null;
          isDemo?: boolean;
        };
        if (!active || !data.ok || data.isDemo) {
          return;
        }
        if (!data.snapshot || isSnapshotEffectivelyEmpty(data.snapshot)) {
          return;
        }

        const scopedSnapshot = scopeSnapshotForSessionUser(data.snapshot, currentUser);
        applySnapshot(scopedSnapshot);
        lastSyncedSnapshotKeyRef.current = JSON.stringify(scopedSnapshot);
      } catch {
        // Remote sync remains optional during local development.
      } finally {
        if (active) {
          setDataLoading(false);
        }
      }
    };

    void loadSnapshotForUser();

    return () => {
      active = false;
    };
  }, [authLoading, applySnapshot, currentStorageNamespace, currentUser, isAuthenticated, isDemoUser, isSnapshotEffectivelyEmpty]);

  const persistAppSnapshotNow = useCallback(
    async (override?: Partial<AppStateSnapshot>): Promise<PersistAppSnapshotResult> => {
      const snapshot = buildSnapshotWithOverride(override);
      const snapshotKey = JSON.stringify(snapshot);
      const persistedAt = new Date().toISOString();

      if (currentStorageNamespace) {
        writeScopedSnapshot(currentStorageNamespace, snapshot);
      }

      if (!isNormalUser) {
        return {
          status: "local_only",
          message: isDemoUser
            ? "当前账号仅做本地 fallback 保存。"
            : "当前账号仅保留本地状态。",
          persistedAt,
        };
      }

      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot }),
        });

        if (response.ok) {
          lastSyncedSnapshotKeyRef.current = snapshotKey;
          return {
            status: "saved",
            message: "已确认并保存。",
            persistedAt,
          };
        }

        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        return {
          status: "failed",
          message: "远端保存失败，已保留本地。",
          persistedAt,
          error: data?.error ?? "remote_snapshot_save_failed",
        };
      } catch (error) {
        return {
          status: "failed",
          message: "远端保存失败，已保留本地。",
          persistedAt,
          error:
            error instanceof Error
              ? error.message
              : "remote_snapshot_save_failed",
        };
      }
    },
    [
      buildSnapshotWithOverride,
      currentStorageNamespace,
      isDemoUser,
      isNormalUser,
    ]
  );

  useEffect(() => {
    if (authLoading || dataLoading || !currentStorageNamespace) {
      return;
    }

    writeScopedSnapshot(currentStorageNamespace, remoteSnapshot);
  }, [authLoading, currentStorageNamespace, dataLoading, remoteSnapshot]);

  useEffect(() => {
    if (authLoading || dataLoading || !isNormalUser || lastSyncedSnapshotKeyRef.current === remoteSnapshotKey) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: remoteSnapshot }),
        });

        if (response.ok) {
          lastSyncedSnapshotKeyRef.current = remoteSnapshotKey;
        }
      } catch {
        // Keep local persistence available if remote sync fails.
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [authLoading, dataLoading, isNormalUser, remoteSnapshot, remoteSnapshotKey]);

  const visibleChildren = useMemo(() => filterChildrenByUser(childrenList, currentUser), [childrenList, currentUser]);
  const visibleChildIds = useMemo(() => visibleChildren.map((child) => child.id), [visibleChildren]);
  const visibleChildIdSet = useMemo(() => new Set(visibleChildIds), [visibleChildIds]);
  const attendanceRecordsByDate = useMemo(
    () => attendanceRecords.reduce<Map<string, AttendanceRecord[]>>((map, record) => {
      map.set(record.date, [...(map.get(record.date) ?? []), record]);
      return map;
    }, new Map<string, AttendanceRecord[]>()),
    [attendanceRecords]
  );
  const todayAttendanceRecords = useMemo(
    () => attendanceRecords.filter((record) => record.date === TODAY),
    [attendanceRecords]
  );
  const todayAttendanceMap = useMemo(
    () => new Map(todayAttendanceRecords.map((record) => [record.childId, record] as const)),
    [todayAttendanceRecords]
  );
  const todayMealRecordsMap = useMemo(
    () => groupRecordsByChildId(mealRecords.filter((record) => record.date === TODAY)),
    [mealRecords]
  );
  const weeklyMealRecordsMap = useMemo(
    () => groupRecordsByChildId(mealRecords.filter((record) => isInLastDays(record.date, 7))),
    [mealRecords]
  );
  const todayGrowthRecordsMap = useMemo(
    () => groupRecordsByChildId(growthRecords.filter((record) => normalizeLocalDate(record.createdAt) === TODAY)),
    [growthRecords]
  );
  const weeklyGrowthRecordsMap = useMemo(
    () => groupRecordsByChildId(growthRecords.filter((record) => isInLastDays(record.createdAt, 7))),
    [growthRecords]
  );
  const todayFeedbackMap = useMemo(
    () => groupRecordsByChildId(guardianFeedbacks.filter((feedback) => feedback.date === TODAY)),
    [guardianFeedbacks]
  );
  const weeklyFeedbackMap = useMemo(
    () =>
      groupRecordsByChildId(
        guardianFeedbacks
          .filter((feedback) => isInLastDays(feedback.date, 7))
          .sort((left, right) => right.date.localeCompare(left.date))
      ),
    [guardianFeedbacks]
  );
  const todayHealthCheckMap = useMemo(
    () => new Map(healthCheckRecords.filter((record) => record.date === TODAY).map((record) => [record.childId, record] as const)),
    [healthCheckRecords]
  );
  const visibleWeeklyMealRecords = useMemo(
    () => visibleChildIds.flatMap((childId) => weeklyMealRecordsMap.get(childId) ?? []),
    [visibleChildIds, weeklyMealRecordsMap]
  );
  const weeklyAttentionGrowthCountMap = useMemo(
    () => new Map(
      Array.from(weeklyGrowthRecordsMap.entries(), ([childId, records]) => [
        childId,
        records.filter((record) => record.needsAttention).length,
      ] as const)
    ),
    [weeklyGrowthRecordsMap]
  );
  const presentChildren = useMemo(() => visibleChildren.filter((child) => todayAttendanceMap.get(child.id)?.isPresent), [todayAttendanceMap, visibleChildren]);
  const visibleWeeklyTrendMap = useMemo(() => {
    const trends = new Map<string, WeeklyDietTrend>();

    visibleChildren.forEach((child) => {
      const weeklyRecords = weeklyMealRecordsMap.get(child.id) ?? [];
      trends.set(child.id, summarizeWeeklyDietRecords(weeklyRecords));
    });

    return trends;
  }, [visibleChildren, weeklyMealRecordsMap]);

  const getAttendanceByDate = useCallback((date: string, childId?: string) => {
    if (childId) {
      return (attendanceRecordsByDate.get(date) ?? []).filter((record) => record.childId === childId);
    }
    return (attendanceRecordsByDate.get(date) ?? []).filter((record) => visibleChildIdSet.has(record.childId));
  }, [attendanceRecordsByDate, visibleChildIdSet]);

  const getTodayAttendance = useCallback(() => getAttendanceByDate(TODAY), [getAttendanceByDate]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string; user?: User };
      if (!response.ok || !result.ok || !result.user) {
        return { ok: false, error: result.error ?? "登录失败，请检查账号和密码。" };
      }
      lastSyncedSnapshotKeyRef.current = null;
      setCurrentUser(result.user);
      return { ok: true, user: result.user };
    } catch {
      return { ok: false, error: "网络异常，请稍后重试。" };
    }
  }, []);

  const loginWithDemo = useCallback(async (accountId: string) => {
    try {
      const response = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string; user?: User };
      if (!response.ok || !result.ok || !result.user) {
        return { ok: false, error: result.error ?? "示例账号进入失败，请稍后重试。" };
      }
      lastSyncedSnapshotKeyRef.current = null;
      setCurrentUser(result.user);
      return { ok: true, user: result.user };
    } catch {
      return { ok: false, error: "网络异常，请稍后重试。" };
    }
  }, []);

  const register = useCallback(async (input: RegisterAccountInput & { confirmPassword: string }) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = (await response.json()) as { ok: boolean; error?: string; user?: User };
      if (!response.ok || !result.ok || !result.user) {
        return { ok: false, error: result.error ?? "注册失败，请稍后重试。" };
      }
      lastSyncedSnapshotKeyRef.current = null;
      setCurrentUser(result.user);
      return { ok: true, user: result.user };
    } catch {
      return { ok: false, error: "网络异常，请稍后重试。" };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      lastSyncedSnapshotKeyRef.current = null;
      setCurrentUser(UNAUTHENTICATED_USER);
      applySnapshot(emptyInstitutionSnapshot());
      setDataLoading(false);
    }
  }, [applySnapshot]);

  const addChild = useCallback((child: NewChildInput) => {
    const avatars = child.gender === "女" ? GIRL_AVATARS : BOY_AVATARS;
    setChildrenList((prev) => [
      ...prev,
      {
        ...child,
        id: createClientId("c"),
        avatar: avatars[Math.floor(Math.random() * avatars.length)],
      },
    ]);
  }, []);

  const removeChild = useCallback((id: string) => {
    setChildrenList((prev) => prev.filter((child) => child.id !== id));
    setAttendanceRecords((prev) => prev.filter((record) => record.childId !== id));
    setMealRecords((prev) => prev.filter((record) => record.childId !== id));
    setGrowthRecords((prev) => prev.filter((record) => record.childId !== id));
    setGuardianFeedbacks((prev) => prev.filter((record) => record.childId !== id));
    setHealthCheckRecords((prev) => prev.filter((record) => record.childId !== id));
    setTaskCheckInRecords((prev) => prev.filter((record) => record.childId !== id));
    setInterventionCards((prev) => prev.filter((card) => card.targetChildId !== id));
    setConsultations((prev) => prev.filter((item) => item.childId !== id));
    setMobileDrafts((prev) => prev.filter((draft) => draft.childId !== id));
    setReminders((prev) => prev.filter((reminder) => reminder.targetId !== id));
    setTasks((prev) => prev.filter((task) => task.childId !== id));
  }, []);

  const markAttendance = useCallback((input: Omit<AttendanceRecord, "id">) => {
    setAttendanceRecords((prev) => {
      const existing = prev.find((record) => record.childId === input.childId && record.date === input.date);
      if (!existing) {
        return [...prev, { ...input, id: createClientId("a") }];
      }
      return prev.map((record) => (record.id === existing.id ? { ...existing, ...input } : record));
    });
  }, []);

  const toggleTodayAttendance = useCallback((childId: string) => {
    const existing = todayAttendanceMap.get(childId);
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
  }, [markAttendance, todayAttendanceMap]);

  const upsertMealRecord = useCallback((input: UpsertMealRecordInput) => {
    setMealRecords((prev) => {
      const existing = prev.find(
        (record) =>
          record.childId === input.childId && record.date === input.date && record.meal === input.meal
      );
      const next: MealRecord = {
        ...(existing ?? { id: createClientId("m") }),
        ...input,
        nutritionScore: calcNutritionScore(input.foods, input.waterMl, input.preference),
        aiEvaluation: input.aiEvaluation ?? existing?.aiEvaluation,
      };
      if (!existing) return [...prev, next];
      return prev.map((record) => (record.id === existing.id ? next : record));
    });
  }, []);

  const previewBulkMealTemplate = useCallback((
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
  }, [presentChildren]);

  const bulkApplyMealTemplate = useCallback((input: BulkMealTemplateInput) => {
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
  }, [previewBulkMealTemplate, upsertMealRecord]);

  const addGrowthRecord = useCallback((input: AddGrowthRecordInput) => {
    setGrowthRecords((prev) => [
      {
        id: createClientId("g"),
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
  }, [currentUser.name, currentUser.role]);

  const addGuardianFeedback = useCallback((input: GuardianFeedbackInput) => {
    setGuardianFeedbacks((prev) => {
      const feedbackId = createClientId("fb");
      const normalized = normalizeParentStructuredFeedback(
        {
          ...input,
          feedbackId,
          id: feedbackId,
          createdBy: currentUser.name,
          createdByRole: currentUser.role,
        },
        {
          feedbackId,
          createdBy: currentUser.name,
          createdByRole: currentUser.role,
          submittedAt: input.submittedAt ?? input.date,
          allowGenerateId: false,
        }
      );

      if (!normalized) return prev;
      return normalizeGuardianFeedbackCollection([normalized, ...prev]) ?? [normalized, ...prev];
    });
  }, [currentUser.name, currentUser.role]);

  const upsertInterventionCard = useCallback((card: InterventionCard) => {
    setInterventionCards((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === card.id || item.targetChildId === card.targetChildId);
      if (existingIndex === -1) {
        return [card, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...card };
      return next;
    });
  }, []);

  const upsertTask = useCallback((task: CanonicalTask) => {
    setTasks((prev) => {
      const existingIndex = prev.findIndex((item) => item.taskId === task.taskId);
      if (existingIndex === -1) {
        return [task, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...task };
      return next;
    });
  }, []);

  const upsertConsultation = useCallback((consultation: ConsultationResult) => {
    setConsultations((prev) => {
      const existingIndex = prev.findIndex((item) => item.consultationId === consultation.consultationId);
      if (existingIndex === -1) {
        return [consultation, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = consultation;
      return next;
    });
  }, []);

  const saveMobileDraft = useCallback((draft: MobileDraft) => {
    setMobileDrafts((prev) => {
      const existingIndex = prev.findIndex((item) => item.draftId === draft.draftId);
      if (existingIndex === -1) {
        return [draft, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...draft };
      return next;
    });
  }, []);

  const markMobileDraftSyncStatus = useCallback((draftId: string, syncStatus: MobileDraftSyncStatus) => {
    setMobileDrafts((prev) =>
      prev.map((draft) =>
        draft.draftId === draftId
          ? { ...draft, syncStatus, syncedAt: syncStatus === "synced" ? new Date().toISOString() : draft.syncedAt }
          : draft
      )
    );
  }, []);

  const upsertReminder = useCallback((reminder: ReminderItem) => {
    setReminders((prev) => {
      const existingIndex = prev.findIndex((item) => item.reminderId === reminder.reminderId);
      if (existingIndex === -1) {
        return [reminder, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...reminder };
      return next;
    });
  }, []);

  const updateReminderStatus = useCallback((reminderId: string, status: ReminderItem["status"]) => {
    setReminders((prev) =>
      prev.map((reminder) => (reminder.reminderId === reminderId ? { ...reminder, status } : reminder))
    );
  }, []);

  const getTasksForChild = useCallback((childId: string, ownerRole?: TaskOwnerRole) => {
    return tasks
      .filter((task) => task.childId === childId && (!ownerRole || task.ownerRole === ownerRole))
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  }, [tasks]);

  const getActiveTask = useCallback((childId: string, ownerRole?: TaskOwnerRole) => {
    return pickActiveTask(tasks, childId, ownerRole);
  }, [tasks]);

  const getChildInterventionCard = useCallback((childId: string) => {
    return interventionCards.find((card) => card.targetChildId === childId);
  }, [interventionCards]);

  const getConsultationsForChild = useCallback((childId: string) => {
    return consultations
      .filter((item) => item.childId === childId)
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  }, [consultations]);

  const getLatestConsultationForChild = useCallback((childId: string) => {
    return consultations
      .filter((item) => item.childId === childId)
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0];
  }, [consultations]);

  const getLatestConsultations = useCallback(() => {
    return [...consultations].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  }, [consultations]);

  const getTodayHealthCheck = useCallback((childId: string) => {
    return todayHealthCheckMap.get(childId);
  }, [todayHealthCheckMap]);

  const upsertHealthCheck = useCallback((input: Omit<HealthCheckRecord, "id" | "date" | "checkedBy" | "checkedByRole"> & { date?: string }) => {
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
          id: createClientId("hc"),
          date: input.date || TODAY,
          checkedBy: currentUser.name,
          checkedByRole: currentUser.role,
        },
        ...prev,
      ];
    });
  }, [currentUser.name, currentUser.role]);

  const getTaskCheckIns = useCallback((childId: string, date?: string) => {
    return taskCheckInRecords.filter((record) => record.childId === childId && (!date || record.date === date));
  }, [taskCheckInRecords]);

  const checkInTask = useCallback((childId: string, taskId: string, date: string) => {
    setTaskCheckInRecords((prev) => {
      const exists = prev.some((r) => r.childId === childId && r.taskId === taskId && r.date === date);
      if (exists) return prev;
      return [...prev, { id: createClientId("tc"), childId, taskId, date }];
    });
  }, []);

  const getTodayMealRecords = useCallback((childIds?: string[]) => {
    const ids = childIds ?? visibleChildIds;
    return ids.flatMap((childId) => todayMealRecordsMap.get(childId) ?? []);
  }, [todayMealRecordsMap, visibleChildIds]);

  const getWeeklyDietTrend = useCallback((childId?: string): WeeklyDietTrend => {
    if (childId) {
      const cachedTrend = visibleWeeklyTrendMap.get(childId);
      if (cachedTrend) {
        return cachedTrend;
      }

      const weeklyRecords = weeklyMealRecordsMap.get(childId) ?? [];
      return summarizeWeeklyDietRecords(weeklyRecords);
    }

    return summarizeWeeklyDietRecords(visibleWeeklyMealRecords);
  }, [visibleWeeklyMealRecords, visibleWeeklyTrendMap, weeklyMealRecordsMap]);

  const adminBoardData = useMemo<AdminBoardData>(() => {
    const scopeChildren = currentUser.institutionId
      ? childrenList.filter((child) => child.institutionId === currentUser.institutionId)
      : visibleChildren;

    const highAttentionChildren = scopeChildren
      .map((child) => {
        const count = weeklyAttentionGrowthCountMap.get(child.id) ?? 0;
        return { childId: child.id, childName: child.name, count };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const lowHydrationChildren = scopeChildren
      .map((child) => ({
        childId: child.id,
        childName: child.name,
        hydrationAvg: visibleWeeklyTrendMap.get(child.id)?.hydrationAvg ?? getWeeklyDietTrend(child.id).hydrationAvg,
      }))
      .sort((a, b) => a.hydrationAvg - b.hydrationAvg)
      .slice(0, 5);

    const lowVegTrendChildren = scopeChildren
      .map((child) => ({
        childId: child.id,
        childName: child.name,
        vegetableDays: visibleWeeklyTrendMap.get(child.id)?.vegetableDays ?? getWeeklyDietTrend(child.id).vegetableDays,
      }))
      .sort((a, b) => a.vegetableDays - b.vegetableDays)
      .slice(0, 5);

    return { highAttentionChildren, lowHydrationChildren, lowVegTrendChildren };
  }, [childrenList, currentUser.institutionId, getWeeklyDietTrend, visibleChildren, visibleWeeklyTrendMap, weeklyAttentionGrowthCountMap]);

  const smartInsights = useMemo(() => {
    const insights: SmartInsight[] = [];
    const todayAttendance = todayAttendanceRecords.filter((record) => visibleChildIdSet.has(record.childId));
    const todayPresent = todayAttendance.filter((item) => item.isPresent).length;
    const todayMeals = visibleChildIds.reduce((sum, childId) => sum + (todayMealRecordsMap.get(childId)?.length ?? 0), 0);

    visibleChildren.forEach((child) => {
      const ageBand = getAgeBandFromBirthDate(child.birthDate);
      const childGrowth = weeklyGrowthRecordsMap.get(child.id) ?? [];
      const childMeals = weeklyMealRecordsMap.get(child.id) ?? [];
      const byDay = new Map<string, MealRecord[]>();

      childMeals.forEach((record) => {
        const key = `${record.childId}-${record.date}`;
        byDay.set(key, [...(byDay.get(key) ?? []), record]);
      });

      let vegetableDays = 0;
      let monotonyDays = 0;
      byDay.forEach((records) => {
        const categories = new Set(records.flatMap((record) => record.foods.map((food) => food.category)));
        if (categories.has("蔬果")) vegetableDays += 1;

        const names = new Set(records.flatMap((record) => record.foods.map((food) => food.name)));
        if (names.size <= 3) monotonyDays += 1;
      });

      if (monotonyDays >= 3) {
        insights.push({
          id: `ins-monotony-${child.id}`,
          childId: child.id,
          level: "warning",
          title: `${child.name} 最近饮食偏单一`,
          description: "连续多天食物种类较少，建议在加餐加入不同颜色蔬果和优质蛋白。",
          tags: ["饮食", "单一"],
        });
      }

      if (vegetableDays <= 2) {
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

    insights.unshift({
      id: "ins-role-ready",
      level: "success",
      title: "角色权限模型已就绪",
      description: "已支持家长/教师/机构管理员的前端数据权限视图，可继续扩展更细粒度的访问控制。",
      tags: ["Auth", "Access", currentUser.role],
    });

    insights.unshift({
      id: "ins-operation",
      level: todayPresent > 0 ? "success" : "info",
      title: `今日运营概况：出勤 ${todayPresent} 人，饮食记录 ${todayMeals} 条`,
      description: "可继续推进‘批量录入→例外处理→家长反馈’闭环流程。",
      tags: ["运营", "闭环"],
    });

    return insights.slice(0, 10);
  }, [currentUser.role, todayAttendanceRecords, todayMealRecordsMap, visibleChildIdSet, visibleChildIds, visibleChildren, weeklyGrowthRecordsMap, weeklyMealRecordsMap]);

  const getSmartInsights = useCallback(() => smartInsights, [smartInsights]);

  const parentFeedData = useMemo(() => {
    const parentChildren = currentUser.role === "家长"
      ? visibleChildren
      : visibleChildren.filter((child) => Boolean(child.parentUserId));

    return parentChildren.map((child) => {
      const todayMeals = todayMealRecordsMap.get(child.id) ?? [];
      const todayGrowth = todayGrowthRecordsMap.get(child.id) ?? [];
      const weeklyGrowth = weeklyGrowthRecordsMap.get(child.id) ?? [];
      const suggestions = smartInsights.filter((insight) => !insight.childId || insight.childId === child.id);
      const feedbacks = todayFeedbackMap.get(child.id) ?? [];
      const recentFeedbacks = weeklyFeedbackMap.get(child.id) ?? [];

      return {
        child,
        todayMeals,
        todayGrowth,
        weeklyGrowth,
        weeklyTrend: visibleWeeklyTrendMap.get(child.id) ?? getWeeklyDietTrend(child.id),
        suggestions,
        feedbacks,
        recentFeedbacks,
        latestFeedback: recentFeedbacks[0],
        hasFeedbackToday: feedbacks.length > 0,
        mediaGallery: buildParentMediaGallery(child.id, weeklyGrowth, todayMeals),
      };
    });
  }, [currentUser.role, getWeeklyDietTrend, smartInsights, todayFeedbackMap, todayGrowthRecordsMap, todayMealRecordsMap, visibleChildren, visibleWeeklyTrendMap, weeklyFeedbackMap, weeklyGrowthRecordsMap]);

  const getParentFeed = useCallback(() => parentFeedData, [parentFeedData]);

  const getAdminBoardData = useCallback((): AdminBoardData => adminBoardData, [adminBoardData]);

  const resetDemoData = useCallback(async () => {
    if (!isDemoUser) {
      return { remoteSynced: false };
    }

    const snapshot = buildFreshDemoSnapshot(getLocalToday());
    lastSyncedSnapshotKeyRef.current = null;
    applySnapshot(snapshot);
    return { remoteSynced: false };
  }, [applySnapshot, isDemoUser]);

  const contextValue = useMemo<AppContextType>(() => ({
    demoAccounts,
    currentUser,
    isAuthenticated,
    authLoading,
    loginWithDemo,
    register,
    login,
    logout,
    children: childrenList,
    visibleChildren,
    attendanceRecords,
    getAttendanceByDate,
    getTodayAttendance,
    markAttendance,
    toggleTodayAttendance,
    healthCheckRecords,
    todayHealthCheckMap,
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
    interventionCards,
    consultations,
    mobileDrafts,
    reminders,
    tasks,
    upsertInterventionCard,
    upsertConsultation,
    upsertTask,
    saveMobileDraft,
    markMobileDraftSyncStatus,
    persistAppSnapshotNow,
    upsertReminder,
    updateReminderStatus,
    getTasksForChild,
    getActiveTask,
    getChildInterventionCard,
    getConsultationsForChild,
    getLatestConsultationForChild,
    getLatestConsultations,
    getTodayMealRecords,
    getWeeklyDietTrend,
    getSmartInsights,
    getParentFeed,
    getAdminBoardData,
    resetDemoData,
  }), [
    demoAccounts,
    currentUser,
    isAuthenticated,
    authLoading,
    loginWithDemo,
    register,
    login,
    logout,
    childrenList,
    visibleChildren,
    attendanceRecords,
    getAttendanceByDate,
    getTodayAttendance,
    markAttendance,
    toggleTodayAttendance,
    healthCheckRecords,
    todayHealthCheckMap,
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
    interventionCards,
    consultations,
    mobileDrafts,
    reminders,
    tasks,
    upsertInterventionCard,
    upsertConsultation,
    upsertTask,
    saveMobileDraft,
    markMobileDraftSyncStatus,
    persistAppSnapshotNow,
    upsertReminder,
    updateReminderStatus,
    getTasksForChild,
    getActiveTask,
    getChildInterventionCard,
    getConsultationsForChild,
    getLatestConsultationForChild,
    getLatestConsultations,
    getTodayMealRecords,
    getWeeklyDietTrend,
    getSmartInsights,
    getParentFeed,
    getAdminBoardData,
    resetDemoData,
  ]);

  return (
    <AppContext.Provider
      value={contextValue}
    >
      {authLoading || dataLoading ? (
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
