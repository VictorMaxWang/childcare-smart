export type AccountKind = "demo" | "normal";
export type AccountRole = "家长" | "教师" | "机构管理员";

export interface SessionUser {
  id: string;
  username?: string;
  name: string;
  role: AccountRole;
  avatar: string;
  institutionId: string;
  className?: string;
  childIds?: string[];
  accountKind: AccountKind;
}

export interface DemoAccount extends SessionUser {
  description: string;
}

export interface ParentRegistrationChildInput {
  name: string;
  birthDate: string;
  gender: "男" | "女";
  heightCm?: number;
  weightKg?: number;
  guardianPhone?: string;
}

export interface RegisterAccountInput {
  username: string;
  password: string;
  role: AccountRole;
  className?: string;
  child?: ParentRegistrationChildInput;
}

export const DEFAULT_TEACHER_CLASS_NAME = "新注册班";
export const DEFAULT_PARENT_CHILD_CLASS_NAME = "待分班";
export const DEMO_INSTITUTION_ID = "inst-1";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "u-admin",
    name: "陈园长",
    username: "demo-admin",
    role: "机构管理员",
    avatar: "🧑‍💼",
    institutionId: DEMO_INSTITUTION_ID,
    accountKind: "demo",
    description: "园长端 · 全园汇总、风险看板与管理视角",
  },
  {
    id: "u-teacher",
    name: "李老师",
    username: "demo-teacher-li",
    role: "教师",
    avatar: "👩‍🏫",
    institutionId: DEMO_INSTITUTION_ID,
    className: "向阳班",
    accountKind: "demo",
    description: "教师端 · 向阳班晨检、饮食、成长记录",
  },
  {
    id: "u-teacher2",
    name: "周老师",
    username: "demo-teacher-zhou",
    role: "教师",
    avatar: "👩‍🏫",
    institutionId: DEMO_INSTITUTION_ID,
    className: "晨曦班",
    accountKind: "demo",
    description: "教师端 · 晨曦班班级运营与复查跟进",
  },
  {
    id: "u-parent",
    name: "林妈妈",
    username: "demo-parent-lin",
    role: "家长",
    avatar: "👩",
    institutionId: DEMO_INSTITUTION_ID,
    childIds: ["c-1"],
    accountKind: "demo",
    description: "家长端 · 查看孩子近 7 天饮食、晨检与反馈",
  },
];

const DEMO_ACCOUNT_MAP = new Map(DEMO_ACCOUNTS.map((account) => [account.id, account] as const));

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function getDefaultAvatarForRole(role: AccountRole) {
  if (role === "教师") return "👩‍🏫";
  if (role === "机构管理员") return "🧑‍💼";
  return "👩";
}

export function getDefaultLandingPath(role: AccountRole) {
  if (role === "教师") return "/teacher";
  if (role === "家长") return "/parent";
  return "/";
}

export function getDemoAccountById(accountId: string) {
  return DEMO_ACCOUNT_MAP.get(accountId) ?? null;
}

export function isDemoAccountId(accountId: string) {
  return DEMO_ACCOUNT_MAP.has(accountId);
}
