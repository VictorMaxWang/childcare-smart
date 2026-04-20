import { getRoleHomePath, type AccountRole } from "../auth/accounts";

export type PrimaryNavIconKey =
  | "overview"
  | "role-home"
  | "children"
  | "health"
  | "growth"
  | "diet"
  | "parent"
  | "screen";

export interface PrimaryNavItem {
  href: string;
  label: string;
  icon: PrimaryNavIconKey;
}

const OVERVIEW_ITEM: PrimaryNavItem = { href: "/", label: "Overview", icon: "overview" };
const CHILDREN_ITEM: PrimaryNavItem = { href: "/children", label: "Children", icon: "children" };
const HEALTH_ITEM: PrimaryNavItem = { href: "/health", label: "Health", icon: "health" };
const GROWTH_ITEM: PrimaryNavItem = { href: "/growth", label: "Growth", icon: "growth" };
const DIET_ITEM: PrimaryNavItem = { href: "/diet", label: "Diet", icon: "diet" };
const PARENT_ITEM: PrimaryNavItem = { href: "/parent", label: "Parents", icon: "parent" };
const INSTITUTION_SCREEN_ITEM: PrimaryNavItem = {
  href: "/teacher",
  label: "Institution Screen",
  icon: "screen",
};
const ADMIN_HOME_ITEM: PrimaryNavItem = { href: "/admin", label: "Admin Home", icon: "role-home" };
const TEACHER_HOME_ITEM: PrimaryNavItem = {
  href: "/teacher",
  label: "Teacher Workspace",
  icon: "role-home",
};
const PARENT_HOME_ITEM: PrimaryNavItem = {
  href: "/parent",
  label: "Parent Home",
  icon: "parent",
};

const ADMIN_NAV_ITEMS: PrimaryNavItem[] = [
  OVERVIEW_ITEM,
  ADMIN_HOME_ITEM,
  CHILDREN_ITEM,
  HEALTH_ITEM,
  GROWTH_ITEM,
  DIET_ITEM,
  PARENT_ITEM,
  INSTITUTION_SCREEN_ITEM,
];

const TEACHER_NAV_ITEMS: PrimaryNavItem[] = [
  OVERVIEW_ITEM,
  TEACHER_HOME_ITEM,
  CHILDREN_ITEM,
  HEALTH_ITEM,
  GROWTH_ITEM,
  DIET_ITEM,
  PARENT_ITEM,
];

const PARENT_NAV_ITEMS: PrimaryNavItem[] = [PARENT_HOME_ITEM];

export function getRoleStandaloneHomeItem(role: AccountRole): PrimaryNavItem | null {
  const roleHomePath = getRoleHomePath(role);

  if (roleHomePath === "/admin") {
    return ADMIN_HOME_ITEM;
  }

  if (roleHomePath === "/teacher") {
    return TEACHER_HOME_ITEM;
  }

  if (roleHomePath === "/parent") {
    return PARENT_HOME_ITEM;
  }

  return null;
}

export function buildPrimaryNavItems(role: AccountRole): PrimaryNavItem[] {
  const roleHomePath = getRoleHomePath(role);

  if (roleHomePath === "/admin") {
    return [...ADMIN_NAV_ITEMS];
  }

  if (roleHomePath === "/teacher") {
    return [...TEACHER_NAV_ITEMS];
  }

  return [...PARENT_NAV_ITEMS];
}

export function isPrimaryNavItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
