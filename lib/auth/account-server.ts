import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_TEACHER_CLASS_NAME,
  getDefaultAvatarForRole,
  getDemoAccountById,
  normalizeUsername,
  type AccountRole,
  type RegisterAccountInput,
  type SessionUser,
} from "@/lib/auth/accounts";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { emptyInstitutionSnapshot, parentStarterSnapshot } from "@/lib/persistence/bootstrap";
import { getSessionUserId } from "@/lib/auth/session";

type AppUserRow = {
  id: string;
  username_normalized: string;
  display_name: string;
  password_hash: string;
  role: AccountRole;
  avatar: string | null;
  institution_id: string;
  class_name: string | null;
  child_ids: unknown;
  is_demo: boolean | null;
};

export type AccountActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

function createId(prefix: string) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function parseChildIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function mapDbUserToSessionUser(row: AppUserRow): SessionUser {
  return {
    id: row.id,
    username: row.username_normalized,
    name: row.display_name,
    role: row.role,
    avatar: row.avatar || getDefaultAvatarForRole(row.role),
    institutionId: row.institution_id,
    className: row.class_name || undefined,
    childIds: parseChildIds(row.child_ids),
    accountKind: "normal",
  };
}

async function getAppUserById(userId: string) {
  const supabase = getServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_users")
    .select("id,username_normalized,display_name,password_hash,role,avatar,institution_id,class_name,child_ids,is_demo")
    .eq("id", userId)
    .maybeSingle<AppUserRow>();

  if (error) {
    console.error("[AUTH] Failed to load app user by id", error);
    return null;
  }

  return data ?? null;
}

async function getAppUserByUsername(username: string) {
  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return { row: null, error: "未配置 Supabase" } as const;
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("id,username_normalized,display_name,password_hash,role,avatar,institution_id,class_name,child_ids,is_demo")
    .eq("username_normalized", normalizeUsername(username))
    .maybeSingle<AppUserRow>();

  if (error) {
    console.error("[AUTH] Failed to load app user by username", error);
    return { row: null, error: "账号查询失败，请稍后重试。" } as const;
  }

  return { row: data ?? null, error: null } as const;
}

function validateRole(role: string): role is AccountRole {
  return role === "家长" || role === "教师" || role === "机构管理员";
}

export async function resolveSessionUserById(userId: string) {
  const demoUser = getDemoAccountById(userId);
  if (demoUser) {
    return demoUser;
  }

  const row = await getAppUserById(userId);
  return row ? mapDbUserToSessionUser(row) : null;
}

export async function getCurrentSessionUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return resolveSessionUserById(userId);
}

export async function authenticateNormalAccount(username: string, password: string): Promise<AccountActionResult<SessionUser>> {
  const normalized = normalizeUsername(username);
  if (!normalized || !password) {
    return { ok: false, status: 400, error: "请输入账号和密码。" };
  }

  const { row, error } = await getAppUserByUsername(normalized);
  if (error) {
    return { ok: false, status: 503, error };
  }
  if (!row) {
    return { ok: false, status: 401, error: "账号或密码错误" };
  }

  const verified = await verifyPassword(password, row.password_hash);
  if (!verified) {
    return { ok: false, status: 401, error: "账号或密码错误" };
  }

  return { ok: true, data: mapDbUserToSessionUser(row) };
}

export async function registerNormalAccount(input: RegisterAccountInput): Promise<AccountActionResult<SessionUser>> {
  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return { ok: false, status: 503, error: "未配置 Supabase，暂时无法注册普通账号。" };
  }

  const username = normalizeUsername(input.username);
  const password = input.password ?? "";
  if (username.length < 2) {
    return { ok: false, status: 400, error: "账号至少需要 2 个字符。" };
  }
  if (password.length < 6) {
    return { ok: false, status: 400, error: "密码至少需要 6 位。" };
  }
  if (!validateRole(input.role)) {
    return { ok: false, status: 400, error: "用户类型无效。" };
  }

  if (input.role === "家长") {
    if (!input.child?.name?.trim() || !input.child.birthDate || !input.child.gender) {
      return { ok: false, status: 400, error: "家长注册需要补充孩子基础信息。" };
    }
  }

  const exists = await getAppUserByUsername(username);
  if (exists.row) {
    return { ok: false, status: 409, error: "该账号已被注册。" };
  }
  if (exists.error) {
    return { ok: false, status: 503, error: exists.error };
  }

  const userId = createId("u");
  const institutionId = createId("inst");
  const displayName = input.username.trim();
  const avatar = getDefaultAvatarForRole(input.role);
  const className = input.role === "教师" ? (input.className?.trim() || DEFAULT_TEACHER_CLASS_NAME) : null;

  const starter =
    input.role === "家长" && input.child
      ? parentStarterSnapshot({
          institutionId,
          parentUserId: userId,
          parentName: displayName,
          guardianPhone: input.child.guardianPhone,
          childName: input.child.name,
          childBirthDate: input.child.birthDate,
          childGender: input.child.gender,
          childHeightCm: input.child.heightCm,
          childWeightKg: input.child.weightKg,
        })
      : null;

  const snapshot = starter?.snapshot ?? emptyInstitutionSnapshot();
  const childIds = starter ? [starter.childId] : [];
  const passwordHash = await hashPassword(password);

  const row: AppUserRow = {
    id: userId,
    username_normalized: username,
    display_name: displayName,
    password_hash: passwordHash,
    role: input.role,
    avatar,
    institution_id: institutionId,
    class_name: className,
    child_ids: childIds,
    is_demo: false,
  };

  const { error: insertUserError } = await supabase.from("app_users").insert({
    id: row.id,
    username_normalized: row.username_normalized,
    display_name: row.display_name,
    password_hash: row.password_hash,
    role: row.role,
    avatar: row.avatar,
    institution_id: row.institution_id,
    class_name: row.class_name,
    child_ids: row.child_ids,
    is_demo: row.is_demo,
  });

  if (insertUserError) {
    console.error("[AUTH] Failed to create app user", insertUserError);
    return { ok: false, status: 500, error: "创建账号失败，请稍后重试。" };
  }

  const { error: insertSnapshotError } = await supabase.from("app_state_snapshots").upsert(
    {
      institution_id: institutionId,
      snapshot,
      updated_by: userId,
    },
    {
      onConflict: "institution_id",
      ignoreDuplicates: false,
    }
  );

  if (insertSnapshotError) {
    console.error("[AUTH] Failed to create starter snapshot", insertSnapshotError);
    await supabase.from("app_users").delete().eq("id", userId);
    return { ok: false, status: 500, error: "初始化账号数据失败，请稍后重试。" };
  }

  return {
    ok: true,
    data: mapDbUserToSessionUser(row),
  };
}
