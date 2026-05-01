import { getRoleHomePath, type AccountRole } from "../auth/accounts";

export type PrimaryNavIconKey =
  | "overview"
  | "role-home"
  | "children"
  | "health"
  | "growth"
  | "diet"
  | "parent"
  | "screen"
  | "ai"
  | "consultation"
  | "file"
  | "feedback"
  | "storybook"
  | "reminders";

export interface PrimaryNavItem {
  href: string;
  label: string;
  icon: PrimaryNavIconKey;
}

export type PrimaryNavGroupKey = "workspace" | "records" | "collaboration";

export interface PrimaryNavGroup {
  key: PrimaryNavGroupKey;
  label: string;
  items: PrimaryNavItem[];
}

export interface PrimaryNavOptions {
  childId?: string;
}

const OVERVIEW_ITEM: PrimaryNavItem = { href: "/", label: "数据总览", icon: "overview" };
const CHILDREN_ITEM: PrimaryNavItem = { href: "/children", label: "幼儿档案", icon: "children" };
const HEALTH_ITEM: PrimaryNavItem = { href: "/health", label: "晨检与健康", icon: "health" };
const GROWTH_ITEM: PrimaryNavItem = { href: "/growth", label: "成长行为", icon: "growth" };
const DIET_ITEM: PrimaryNavItem = { href: "/diet", label: "饮食记录", icon: "diet" };
const ADMIN_HOME_ITEM: PrimaryNavItem = { href: "/admin", label: "园所首页", icon: "role-home" };
const ADMIN_AGENT_ITEM: PrimaryNavItem = { href: "/admin/agent", label: "AI 助手", icon: "ai" };
const ADMIN_WEEKLY_ITEM: PrimaryNavItem = {
  href: "/admin/agent?action=weekly-report",
  label: "周报分析",
  icon: "screen",
};
const TEACHER_HOME_ITEM: PrimaryNavItem = {
  href: "/teacher",
  label: "教师工作台",
  icon: "role-home",
};
const TEACHER_AGENT_ITEM: PrimaryNavItem = { href: "/teacher/agent", label: "AI 助手", icon: "ai" };
const TEACHER_CONSULTATION_ITEM: PrimaryNavItem = {
  href: "/teacher/high-risk-consultation",
  label: "风险会诊",
  icon: "consultation",
};
const TEACHER_HEALTH_FILE_ITEM: PrimaryNavItem = {
  href: "/teacher/health-file-bridge",
  label: "健康材料",
  icon: "file",
};

function parentPath(path: string, childId?: string) {
  if (!childId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}child=${encodeURIComponent(childId)}`;
}

function buildParentHomeItem(childId?: string): PrimaryNavItem {
  return {
    href: parentPath("/parent", childId),
    label: "家长首页",
    icon: "parent",
  };
}

function buildParentAgentItem(childId?: string): PrimaryNavItem {
  return {
    href: parentPath("/parent/agent", childId),
    label: "AI 建议",
    icon: "ai",
  };
}

function buildParentFeedbackItem(childId?: string): PrimaryNavItem {
  return {
    href: `${parentPath("/parent/agent", childId)}#feedback`,
    label: "家园沟通",
    icon: "feedback",
  };
}

function buildParentGrowthItem(childId?: string): PrimaryNavItem {
  return {
    href: parentPath("/growth", childId),
    label: "成长档案",
    icon: "growth",
  };
}

function buildParentStorybookItem(childId?: string): PrimaryNavItem {
  return {
    href: parentPath("/parent/storybook", childId),
    label: "成长绘本",
    icon: "storybook",
  };
}

function buildParentHealthItem(childId?: string): PrimaryNavItem {
  return {
    href: parentPath("/health", childId),
    label: "健康管理",
    icon: "health",
  };
}

function buildParentDietItem(childId?: string): PrimaryNavItem {
  return {
    href: parentPath("/diet", childId),
    label: "营养餐谱",
    icon: "diet",
  };
}

function buildParentReminderItem(childId?: string): PrimaryNavItem {
  return {
    href: parentPath("/parent/reminders", childId),
    label: "日常提醒",
    icon: "reminders",
  };
}

const ADMIN_NAV_ITEMS: PrimaryNavItem[] = [
  ADMIN_HOME_ITEM,
  ADMIN_AGENT_ITEM,
  ADMIN_WEEKLY_ITEM,
  CHILDREN_ITEM,
  HEALTH_ITEM,
  GROWTH_ITEM,
  DIET_ITEM,
  OVERVIEW_ITEM,
];

const TEACHER_NAV_ITEMS: PrimaryNavItem[] = [
  TEACHER_HOME_ITEM,
  TEACHER_AGENT_ITEM,
  TEACHER_CONSULTATION_ITEM,
  TEACHER_HEALTH_FILE_ITEM,
  CHILDREN_ITEM,
  HEALTH_ITEM,
  GROWTH_ITEM,
  DIET_ITEM,
];

export function getRoleStandaloneHomeItem(role: AccountRole, options: PrimaryNavOptions = {}): PrimaryNavItem | null {
  const roleHomePath = getRoleHomePath(role);

  if (roleHomePath === "/admin") {
    return ADMIN_HOME_ITEM;
  }

  if (roleHomePath === "/teacher") {
    return TEACHER_HOME_ITEM;
  }

  if (roleHomePath === "/parent") {
    return buildParentHomeItem(options.childId);
  }

  return null;
}

export function buildPrimaryNavItems(role: AccountRole, options: PrimaryNavOptions = {}): PrimaryNavItem[] {
  const roleHomePath = getRoleHomePath(role);

  if (roleHomePath === "/admin") {
    return [...ADMIN_NAV_ITEMS];
  }

  if (roleHomePath === "/teacher") {
    return [...TEACHER_NAV_ITEMS];
  }

  return [
    buildParentHomeItem(options.childId),
    buildParentFeedbackItem(options.childId),
    buildParentGrowthItem(options.childId),
    buildParentStorybookItem(options.childId),
    buildParentHealthItem(options.childId),
    buildParentDietItem(options.childId),
    buildParentReminderItem(options.childId),
    buildParentAgentItem(options.childId),
  ];
}

export function buildPrimaryNavGroups(role: AccountRole, options: PrimaryNavOptions = {}): PrimaryNavGroup[] {
  const items = buildPrimaryNavItems(role, options);
  const groups: PrimaryNavGroup[] = [
    { key: "workspace", label: "工作台", items: [] },
    { key: "records", label: "业务记录", items: [] },
    { key: "collaboration", label: "协同入口", items: [] },
  ];
  const groupMap = new Map(groups.map((group) => [group.key, group]));

  items.forEach((item) => {
    const group = groupMap.get(getPrimaryNavGroupKey(item));
    group?.items.push(item);
  });

  return groups.filter((group) => group.items.length > 0);
}

export function isPrimaryNavItemActive(pathname: string, href: string) {
  const current = parseNavLocation(pathname);
  const target = parseNavLocation(href);
  const hrefHasQuery = href.includes("?");

  if (target.path === "/") {
    return current.path === "/";
  }

  if (target.path === "/admin" || target.path === "/teacher" || target.path === "/parent") {
    return current.path === target.path;
  }

  if (hrefHasQuery) {
    if (current.path !== target.path) return false;

    for (const [key, value] of target.searchParams.entries()) {
      if (current.searchParams.get(key) !== value) return false;
    }

    return true;
  }

  if (target.path === "/admin/agent" && current.searchParams.has("action")) {
    return false;
  }

  return current.path === target.path || current.path.startsWith(`${target.path}/`);
}

function getPrimaryNavGroupKey(item: PrimaryNavItem): PrimaryNavGroupKey {
  const path = stripUrlPath(item.href);

  if (["/children", "/health", "/growth", "/diet"].includes(path)) {
    return "records";
  }

  if (
    path.startsWith("/parent") ||
    path.includes("agent") ||
    path.includes("consultation") ||
    path.includes("health-file")
  ) {
    return "collaboration";
  }

  return "workspace";
}

function stripUrlPath(value: string) {
  return parseNavLocation(value).path;
}

function parseNavLocation(value: string) {
  const raw = value || "/";
  const withoutHash = raw.split("#")[0] ?? raw;
  const [pathValue, searchValue = ""] = withoutHash.split("?");

  return {
    path: pathValue || "/",
    searchParams: new URLSearchParams(searchValue),
  };
}
