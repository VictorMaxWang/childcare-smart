"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isRole } from "@/lib/auth/roles";
import { isSupabaseRuntimeEnabled } from "@/lib/runtime/mode";

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

function getToday() {
  return new Date().toISOString().split("T")[0];
}

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
  switchUser: (userId: string) => void;

  children: Child[];
  visibleChildren: Child[];

  attendanceRecords: AttendanceRecord[];
  getAttendanceByDate: (date: string, childId?: string) => AttendanceRecord[];
  getTodayAttendance: () => AttendanceRecord[];
  markAttendance: (input: Omit<AttendanceRecord, "id">) => void;
  toggleTodayAttendance: (childId: string, absenceReason?: string) => void;

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

function mapProfileToUser(profile: Record<string, unknown>, fallbackId: string, fallbackName: string): User {
  const roleRaw = String(profile.role ?? "");
  const role: Role = isRole(roleRaw) ? roleRaw : "教师";
  return {
    id: String(profile.id ?? fallbackId),
    name: String(profile.name ?? fallbackName),
    role,
    avatar: String(profile.avatar ?? "👤"),
    institutionId: String(profile.institution_id ?? "inst-1"),
    className: profile.class_name ? String(profile.class_name) : undefined,
  };
}

function mapDbChildToChild(row: Record<string, unknown>): Child {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    nickname: row.nickname ? String(row.nickname) : undefined,
    birthDate: String(row.birth_date ?? TODAY),
    gender: String(row.gender) === "女" ? "女" : "男",
    allergies: Array.isArray(row.allergies) ? row.allergies.map((a) => String(a)) : [],
    heightCm: Number(row.height_cm ?? 0),
    weightKg: Number(row.weight_kg ?? 0),
    guardians: Array.isArray(row.guardians)
      ? row.guardians.map((g) => ({
          name: String((g as Record<string, unknown>).name ?? ""),
          relation: String((g as Record<string, unknown>).relation ?? ""),
          phone: String((g as Record<string, unknown>).phone ?? ""),
        }))
      : [],
    institutionId: String(row.institution_id ?? "inst-1"),
    className: String(row.class_name ?? ""),
    specialNotes: String(row.special_notes ?? ""),
    avatar: String(row.avatar ?? "🧒"),
    parentUserId: row.parent_user_id ? String(row.parent_user_id) : undefined,
  };
}

function mapDbAttendanceRecord(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(row.id ?? `a-${Date.now()}`),
    childId: String(row.child_id ?? ""),
    date: String(row.date ?? TODAY),
    isPresent: Boolean(row.is_present),
    checkInAt: row.check_in_at ? String(row.check_in_at) : undefined,
    checkOutAt: row.check_out_at ? String(row.check_out_at) : undefined,
    absenceReason: row.absence_reason ? String(row.absence_reason) : undefined,
  };
}

function mapDbHealthCheckRecord(row: Record<string, unknown>): HealthCheckRecord {
  const checkedByRoleRaw = String(row.checked_by_role ?? "教师");
  return {
    id: String(row.id ?? `hc-${Date.now()}`),
    childId: String(row.child_id ?? ""),
    date: String(row.date ?? TODAY),
    temperature: Number(row.temperature ?? 36.5),
    mood: String(row.mood ?? ""),
    handMouthEye: String(row.hand_mouth_eye) === "异常" ? "异常" : "正常",
    isAbnormal: Boolean(row.is_abnormal),
    remark: row.remark ? String(row.remark) : undefined,
    checkedBy: row.checked_by ? String(row.checked_by) : "",
    checkedByRole: isRole(checkedByRoleRaw) ? checkedByRoleRaw : "教师",
  };
}

function mapDbMealRecord(row: Record<string, unknown>): MealRecord {
  const foods = Array.isArray(row.foods)
    ? row.foods.map((food) => ({
        id: String((food as Record<string, unknown>).id ?? `f-${Date.now()}`),
        name: String((food as Record<string, unknown>).name ?? ""),
        category: String((food as Record<string, unknown>).category ?? "其他") as FoodCategory,
        amount: String((food as Record<string, unknown>).amount ?? ""),
      }))
    : [];
  const recordedByRoleRaw = String(row.recorded_by_role ?? "教师");
  const preference = String(row.preference ?? "正常") as PreferenceStatus;
  const waterMl = Number(row.water_ml ?? 0);
  return {
    id: String(row.id ?? `m-${Date.now()}`),
    childId: String(row.child_id ?? ""),
    date: String(row.date ?? TODAY),
    meal: String(row.meal ?? "早餐") as MealType,
    foods,
    intakeLevel: String(row.intake_level ?? "适中") as IntakeLevel,
    preference,
    allergyReaction: row.allergy_reaction ? String(row.allergy_reaction) : undefined,
    waterMl,
    nutritionScore: Number(row.nutrition_score ?? calcNutritionScore(foods, waterMl, preference)),
    recordedBy: row.recorded_by ? String(row.recorded_by) : "",
    recordedByRole: isRole(recordedByRoleRaw) ? recordedByRoleRaw : "教师",
  };
}

function mapDbGrowthRecord(row: Record<string, unknown>): GrowthRecord {
  const recorderRoleRaw = String(row.recorder_role ?? "教师");
  return {
    id: String(row.id ?? `g-${Date.now()}`),
    childId: String(row.child_id ?? ""),
    createdAt: String(row.created_at_text ?? TODAY),
    recorder: String(row.recorder ?? ""),
    recorderRole: isRole(recorderRoleRaw) ? recorderRoleRaw : "教师",
    category: String(row.category ?? "情绪表现") as BehaviorCategory,
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
    selectedIndicators: Array.isArray(row.selected_indicators)
      ? row.selected_indicators.map((item) => String(item))
      : undefined,
    description: String(row.description ?? ""),
    needsAttention: Boolean(row.needs_attention),
    followUpAction: row.follow_up_action ? String(row.follow_up_action) : undefined,
    reviewDate: row.review_date ? String(row.review_date) : undefined,
    reviewStatus: String(row.review_status ?? "") === "待复查" ? "待复查" : "已完成",
  };
}

function mapDbGuardianFeedback(row: Record<string, unknown>): GuardianFeedback {
  const createdByRoleRaw = String(row.created_by_role ?? "家长");
  return {
    id: String(row.id ?? `fb-${Date.now()}`),
    childId: String(row.child_id ?? ""),
    date: String(row.date ?? TODAY),
    status: String(row.status ?? "已知晓") as CollaborationStatus,
    content: String(row.content ?? ""),
    createdBy: row.created_by ? String(row.created_by) : "",
    createdByRole: isRole(createdByRoleRaw) ? createdByRoleRaw : "家长",
  };
}

function mapDbTaskCheckInRecord(row: Record<string, unknown>): TaskCheckInRecord {
  return {
    id: String(row.id ?? `tc-${Date.now()}`),
    childId: String(row.child_id ?? ""),
    taskId: String(row.task_id ?? ""),
    date: String(row.date ?? TODAY),
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
  const diff = startOfDay(getToday()) - startOfDay(pureDate);
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
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState(INITIAL_USERS[1].id);
  const [childrenList, setChildrenList] = useState<Child[]>(INITIAL_CHILDREN);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE);
  const [mealRecords, setMealRecords] = useState<MealRecord[]>(normalizeRecords(INITIAL_MEALS));
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>(INITIAL_GROWTH);
  const [guardianFeedbacks, setGuardianFeedbacks] = useState<GuardianFeedback[]>(INITIAL_FEEDBACKS);
  const [healthCheckRecords, setHealthCheckRecords] = useState<HealthCheckRecord[]>(INITIAL_HEALTH_CHECKS);
  const [taskCheckInRecords, setTaskCheckInRecords] = useState<TaskCheckInRecord[]>(INITIAL_TASK_CHECKINS);
  const hasSupabaseEnv = isSupabaseRuntimeEnabled();

  useEffect(() => {
    if (!hasSupabaseEnv) return;

    let active = true;

    async function hydrateFromSupabase() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser || !active) return;

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("id,name,role,avatar,institution_id,class_name")
          .eq("id", authUser.id)
          .single();

        const mappedUser = mapProfileToUser(
          (profile as Record<string, unknown>) ?? {},
          authUser.id,
          authUser.email ?? "未命名用户"
        );

        if (!active) return;

        setUsers([mappedUser]);
        setCurrentUserId(mappedUser.id);

        let childrenQuery = supabase.from("children").select("*");
        if (mappedUser.role === "家长") {
          childrenQuery = childrenQuery.eq("parent_user_id", mappedUser.id);
        } else if (mappedUser.role === "教师") {
          childrenQuery = childrenQuery
            .eq("institution_id", mappedUser.institutionId)
            .eq("class_name", mappedUser.className ?? "");
        } else {
          childrenQuery = childrenQuery.eq("institution_id", mappedUser.institutionId);
        }

        const { data: dbChildren } = await childrenQuery;
        if (!active || !dbChildren) return;

        const mappedChildren = dbChildren.map((row) => mapDbChildToChild(row as Record<string, unknown>));
        const childIds = mappedChildren.map((child) => child.id);

        if (mappedUser.role === "家长") {
          setUsers([{ ...mappedUser, childIds }]);
        }

        setChildrenList(mappedChildren);

        if (childIds.length === 0) {
          setAttendanceRecords([]);
          setHealthCheckRecords([]);
          setMealRecords([]);
          setGrowthRecords([]);
          setGuardianFeedbacks([]);
          setTaskCheckInRecords([]);
          return;
        }

        const [attendanceRes, healthRes, mealRes, growthRes, feedbackRes, taskRes] = await Promise.all([
          supabase.from("attendance_records").select("*").in("child_id", childIds),
          supabase.from("health_checks").select("*").in("child_id", childIds),
          supabase.from("meal_records").select("*").in("child_id", childIds),
          supabase.from("growth_records").select("*").in("child_id", childIds),
          supabase.from("guardian_feedbacks").select("*").in("child_id", childIds),
          supabase.from("task_checkins").select("*").in("child_id", childIds),
        ]);

        if (!active) return;

        setAttendanceRecords(
          Array.isArray(attendanceRes.data)
            ? attendanceRes.data.map((row) => mapDbAttendanceRecord(row as Record<string, unknown>))
            : []
        );
        setHealthCheckRecords(
          Array.isArray(healthRes.data)
            ? healthRes.data.map((row) => mapDbHealthCheckRecord(row as Record<string, unknown>))
            : []
        );
        setMealRecords(
          Array.isArray(mealRes.data)
            ? mealRes.data.map((row) => mapDbMealRecord(row as Record<string, unknown>))
            : []
        );
        setGrowthRecords(
          Array.isArray(growthRes.data)
            ? growthRes.data.map((row) => mapDbGrowthRecord(row as Record<string, unknown>))
            : []
        );
        setGuardianFeedbacks(
          Array.isArray(feedbackRes.data)
            ? feedbackRes.data.map((row) => mapDbGuardianFeedback(row as Record<string, unknown>))
            : []
        );
        setTaskCheckInRecords(
          Array.isArray(taskRes.data)
            ? taskRes.data.map((row) => mapDbTaskCheckInRecord(row as Record<string, unknown>))
            : []
        );
      } catch {
        // Keep mock data fallback when Supabase is not configured or unavailable.
      }
    }

    hydrateFromSupabase();

    return () => {
      active = false;
    };
  }, [hasSupabaseEnv]);

  const currentUser = users.find((user) => user.id === currentUserId) ?? users[0];
  const visibleChildren = useMemo(() => filterChildrenByUser(childrenList, currentUser), [childrenList, currentUser]);

  const getAttendanceByDate = (date: string, childId?: string) => {
    const ids = childId ? [childId] : visibleChildren.map((child) => child.id);
    return attendanceRecords.filter((record) => record.date === date && ids.includes(record.childId));
  };

  const getTodayAttendance = () => getAttendanceByDate(getToday());

  const presentChildren = visibleChildren.filter((child) => {
    const todayAttendance = attendanceRecords.find(
      (record) => record.childId === child.id && record.date === getToday()
    );
    return todayAttendance?.isPresent;
  });

  const switchUser = (userId: string) => {
    // In Supabase auth mode, current identity should come from session/profile instead of demo switching.
    if (hasSupabaseEnv) return;
    setCurrentUserId(userId);
  };

  const addChild = (child: NewChildInput) => {
    const avatars = child.gender === "女" ? GIRL_AVATARS : BOY_AVATARS;
    const childId = `c-${Date.now()}`;
    const avatar = avatars[Math.floor(Math.random() * avatars.length)];

    setChildrenList((prev) => [
      ...prev,
      {
        ...child,
        id: childId,
        avatar,
      },
    ]);

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("children").insert({
          id: childId,
          name: child.name,
          nickname: child.nickname ?? null,
          birth_date: child.birthDate,
          gender: child.gender,
          allergies: child.allergies,
          height_cm: child.heightCm,
          weight_kg: child.weightKg,
          guardians: child.guardians,
          institution_id: child.institutionId,
          class_name: child.className,
          special_notes: child.specialNotes,
          avatar,
          parent_user_id: child.parentUserId ?? null,
        });
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
  };

  const removeChild = (id: string) => {
    setChildrenList((prev) => prev.filter((child) => child.id !== id));
    setAttendanceRecords((prev) => prev.filter((record) => record.childId !== id));
    setMealRecords((prev) => prev.filter((record) => record.childId !== id));
    setGrowthRecords((prev) => prev.filter((record) => record.childId !== id));
    setGuardianFeedbacks((prev) => prev.filter((record) => record.childId !== id));

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("children").delete().eq("id", id);
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
  };

  const markAttendance = (input: Omit<AttendanceRecord, "id">) => {
    const recordId = `a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const existing = attendanceRecords.find((record) => record.childId === input.childId && record.date === input.date);
    const syncId = existing?.id ?? recordId;

    setAttendanceRecords((prev) => {
      const existingInPrev = prev.find((record) => record.childId === input.childId && record.date === input.date);
      if (!existingInPrev) {
        return [...prev, { ...input, id: recordId }];
      }
      return prev.map((record) => (record.id === existingInPrev.id ? { ...existingInPrev, ...input } : record));
    });

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("attendance_records").upsert(
          {
            id: syncId,
            child_id: input.childId,
            date: input.date,
            is_present: input.isPresent,
            check_in_at: input.checkInAt ?? null,
            check_out_at: input.checkOutAt ?? null,
            absence_reason: input.absenceReason ?? null,
          },
          { onConflict: "child_id,date" }
        );
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
  };

  const toggleTodayAttendance = (childId: string, absenceReason?: string) => {
    const today = getToday();
    const existing = attendanceRecords.find((record) => record.childId === childId && record.date === today);
    if (!existing) {
      markAttendance({ childId, date: today, isPresent: true, checkInAt: "08:30", checkOutAt: "17:10" });
      return;
    }
    markAttendance({
      ...existing,
      isPresent: !existing.isPresent,
      absenceReason: existing.isPresent ? (absenceReason ?? "临时请假") : undefined,
      checkInAt: existing.isPresent ? undefined : "08:35",
      checkOutAt: existing.isPresent ? undefined : "17:15",
    });
  };

  const upsertMealRecord = (input: UpsertMealRecordInput) => {
    const recordId = `m-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const existing = mealRecords.find(
      (record) =>
        record.childId === input.childId && record.date === input.date && record.meal === input.meal
    );
    const syncId = existing?.id ?? recordId;

    setMealRecords((prev) => {
      const existingInPrev = prev.find(
        (record) =>
          record.childId === input.childId && record.date === input.date && record.meal === input.meal
      );
      const next: MealRecord = {
        ...(existingInPrev ?? { id: recordId }),
        ...input,
        nutritionScore: calcNutritionScore(input.foods, input.waterMl, input.preference),
      };
      if (!existingInPrev) return [...prev, next];
      return prev.map((record) => (record.id === existingInPrev.id ? next : record));
    });

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("meal_records").upsert(
          {
            id: syncId,
            child_id: input.childId,
            date: input.date,
            meal: input.meal,
            foods: input.foods,
            intake_level: input.intakeLevel,
            preference: input.preference,
            allergy_reaction: input.allergyReaction ?? null,
            water_ml: input.waterMl,
            nutrition_score: calcNutritionScore(input.foods, input.waterMl, input.preference),
            recorded_by: currentUser.id,
            recorded_by_role: currentUser.role,
          },
          { onConflict: "child_id,date,meal" }
        );
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
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
    const recordId = `g-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const createdAt = new Date().toLocaleString("zh-CN", { hour12: false });
    const reviewStatus = input.reviewStatus ?? (input.needsAttention ? "待复查" : "已完成");

    setGrowthRecords((prev) => [
      {
        id: recordId,
        childId: input.childId,
        createdAt,
        recorder: currentUser.name,
        recorderRole: currentUser.role,
        category: input.category,
        tags: input.tags,
        description: input.description,
        needsAttention: input.needsAttention,
        followUpAction: input.followUpAction,
        reviewDate: input.reviewDate,
        reviewStatus,
        selectedIndicators: input.selectedIndicators,
      },
      ...prev,
    ]);

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("growth_records").insert({
          id: recordId,
          child_id: input.childId,
          created_at_text: createdAt,
          recorder: currentUser.name,
          recorder_role: currentUser.role,
          category: input.category,
          tags: input.tags,
          selected_indicators: input.selectedIndicators ?? [],
          description: input.description,
          needs_attention: input.needsAttention,
          follow_up_action: input.followUpAction ?? null,
          review_date: input.reviewDate ?? null,
          review_status: reviewStatus,
        });
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
  };

  const addGuardianFeedback = (input: Omit<GuardianFeedback, "id" | "createdBy" | "createdByRole">) => {
    const feedbackId = `fb-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setGuardianFeedbacks((prev) => [
      {
        ...input,
        id: feedbackId,
        createdBy: currentUser.name,
        createdByRole: currentUser.role,
      },
      ...prev,
    ]);

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("guardian_feedbacks").insert({
          id: feedbackId,
          child_id: input.childId,
          date: input.date,
          status: input.status,
          content: input.content,
          created_by: currentUser.id,
          created_by_role: currentUser.role,
        });
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
  };

  const getTodayHealthCheck = (childId: string) => {
    return healthCheckRecords.find((record) => record.childId === childId && record.date === getToday());
  };

  const upsertHealthCheck = (input: Omit<HealthCheckRecord, "id" | "date" | "checkedBy" | "checkedByRole"> & { date?: string }) => {
    const date = input.date || getToday();
    const healthCheckId = `hc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const existing = healthCheckRecords.find((record) => record.childId === input.childId && record.date === date);
    const syncId = existing?.id ?? healthCheckId;

    setHealthCheckRecords((prev) => {
      const existingIndex = prev.findIndex((record) => record.childId === input.childId && record.date === date);
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...input };
        return next;
      }
      return [
        {
          ...input,
          id: healthCheckId,
          date,
          checkedBy: currentUser.name,
          checkedByRole: currentUser.role,
        },
        ...prev,
      ];
    });

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("health_checks").upsert(
          {
            id: syncId,
            child_id: input.childId,
            date,
            temperature: input.temperature,
            mood: input.mood,
            hand_mouth_eye: input.handMouthEye,
            is_abnormal: input.isAbnormal,
            remark: input.remark ?? null,
            checked_by: currentUser.id,
            checked_by_role: currentUser.role,
          },
          { onConflict: "child_id,date" }
        );
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
  };

  const getTaskCheckIns = (childId: string, date?: string) => {
    return taskCheckInRecords.filter((record) => record.childId === childId && (!date || record.date === date));
  };

  const checkInTask = (childId: string, taskId: string, date: string) => {
    const checkInId = `tc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const alreadyExists = taskCheckInRecords.some((r) => r.childId === childId && r.taskId === taskId && r.date === date);
    setTaskCheckInRecords((prev) => {
      const exists = prev.some((r) => r.childId === childId && r.taskId === taskId && r.date === date);
      if (exists) return prev;
      return [...prev, { id: checkInId, childId, taskId, date }];
    });

    if (alreadyExists) return;

    if (!hasSupabaseEnv) return;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.from("task_checkins").upsert(
          {
            id: checkInId,
            child_id: childId,
            task_id: taskId,
            date,
          },
          { onConflict: "child_id,task_id,date" }
        );
      } catch {
        // Keep optimistic local state even if remote sync fails.
      }
    })();
  };

  const getTodayMealRecords = (childIds?: string[]) => {
    const ids = childIds ?? visibleChildren.map((child) => child.id);
    return mealRecords.filter((record) => record.date === getToday() && ids.includes(record.childId));
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

    const today = getToday();
    return parentChildren.map((child) => {
      const todayMeals = mealRecords.filter((record) => record.childId === child.id && record.date === today);
      const todayGrowth = growthRecords.filter(
        (record) => record.childId === child.id && record.createdAt.startsWith(today)
      );
      const suggestions = getSmartInsights().filter((insight) => !insight.childId || insight.childId === child.id);
      const feedbacks = guardianFeedbacks.filter((feedback) => feedback.childId === child.id && feedback.date === today);

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
      {childNodes}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
