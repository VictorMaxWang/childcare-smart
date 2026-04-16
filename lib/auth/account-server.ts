import {
  DATABASE_URL_CONFIG_ERROR_MESSAGE,
  DatabaseConfigError,
  dbQuery,
  decodeDatabaseJson,
  encodeDatabaseJson,
  withDbTransaction,
  type DatabaseConnection,
} from "@/lib/db/server";
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

const ROLE_PARENT = "\u5bb6\u957f" as AccountRole;
const ROLE_TEACHER = "\u6559\u5e08" as AccountRole;
const ROLE_ADMIN = "\u673a\u6784\u7ba1\u7406\u5458" as AccountRole;

const REQUIRED_CREDENTIALS_ERROR = "\u8bf7\u8f93\u5165\u8d26\u53f7\u548c\u5bc6\u7801\u3002";
const INVALID_CREDENTIALS_ERROR = "\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef\u3002";
const DATABASE_QUERY_FAILED_ERROR = "\u6570\u636e\u5e93\u8bbf\u95ee\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
const USERNAME_TOO_SHORT_ERROR = "\u8d26\u53f7\u81f3\u5c11\u9700\u8981 2 \u4e2a\u5b57\u7b26\u3002";
const PASSWORD_TOO_SHORT_ERROR = "\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d\u3002";
const INVALID_ROLE_ERROR = "\u7528\u6237\u7c7b\u578b\u65e0\u6548\u3002";
const PARENT_CHILD_REQUIRED_ERROR = "\u5bb6\u957f\u6ce8\u518c\u9700\u8981\u8865\u5145\u5b69\u5b50\u57fa\u7840\u4fe1\u606f\u3002";
const DUPLICATE_USERNAME_ERROR = "\u8be5\u8d26\u53f7\u5df2\u88ab\u6ce8\u518c\u3002";
const CREATE_ACCOUNT_FAILED_ERROR = "\u521b\u5efa\u8d26\u53f7\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
const MYSQL_DUPLICATE_KEY_ERROR_CODE = "ER_DUP_ENTRY";
const MYSQL_DUPLICATE_KEY_ERROR_NUMBER = 1062;

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
  const childIdsValue = decodeDatabaseJson<unknown[]>(row.child_ids) ?? row.child_ids;

  return {
    id: row.id,
    username: row.username_normalized,
    name: row.display_name,
    role: row.role,
    avatar: row.avatar || getDefaultAvatarForRole(row.role),
    institutionId: row.institution_id,
    className: row.class_name || undefined,
    childIds: parseChildIds(childIdsValue),
    accountKind: "normal",
  };
}

function validateRole(role: string): role is AccountRole {
  return role === ROLE_PARENT || role === ROLE_TEACHER || role === ROLE_ADMIN;
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  if (code === MYSQL_DUPLICATE_KEY_ERROR_CODE) {
    return true;
  }

  const errno = (error as { errno?: unknown }).errno;
  return errno === MYSQL_DUPLICATE_KEY_ERROR_NUMBER;
}

async function getAppUserById(userId: string) {
  try {
    const { rows } = await dbQuery<AppUserRow>(
      `
        select
          id,
          username_normalized,
          display_name,
          password_hash,
          role,
          avatar,
          institution_id,
          class_name,
          child_ids,
          is_demo
        from app_users
        where id = ?
        limit 1
      `,
      [userId]
    );

    return rows[0] ?? null;
  } catch (error) {
    console.error("[AUTH] Failed to load app user by id", error);
    throw error;
  }
}

async function getAppUserByUsername(username: string) {
  try {
    const { rows } = await dbQuery<AppUserRow>(
      `
        select
          id,
          username_normalized,
          display_name,
          password_hash,
          role,
          avatar,
          institution_id,
          class_name,
          child_ids,
          is_demo
        from app_users
        where username_normalized = ?
        limit 1
      `,
      [normalizeUsername(username)]
    );

    return { row: rows[0] ?? null, error: null } as const;
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return { row: null, error: DATABASE_URL_CONFIG_ERROR_MESSAGE } as const;
    }

    console.error("[AUTH] Failed to load app user by username", error);
    return { row: null, error: DATABASE_QUERY_FAILED_ERROR } as const;
  }
}

async function insertAppUser(connection: DatabaseConnection, row: AppUserRow) {
  await connection.execute(
    `
      insert into app_users (
        id,
        username_normalized,
        display_name,
        password_hash,
        role,
        avatar,
        institution_id,
        class_name,
        child_ids,
        is_demo
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.id,
      row.username_normalized,
      row.display_name,
      row.password_hash,
      row.role,
      row.avatar,
      row.institution_id,
      row.class_name,
      encodeDatabaseJson(row.child_ids),
      row.is_demo,
    ]
  );
}

async function upsertInstitutionSnapshot(
  connection: DatabaseConnection,
  institutionId: string,
  snapshot: unknown,
  updatedBy: string
) {
  const encodedSnapshot = encodeDatabaseJson(snapshot);

  await connection.execute(
    `
      insert into app_state_snapshots (institution_id, snapshot, updated_by)
      values (?, ?, ?)
      on duplicate key update
        snapshot = ?,
        updated_by = ?
    `,
    [institutionId, encodedSnapshot, updatedBy, encodedSnapshot, updatedBy]
  );
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
    return { ok: false, status: 400, error: REQUIRED_CREDENTIALS_ERROR };
  }

  const { row, error } = await getAppUserByUsername(normalized);
  if (error) {
    return { ok: false, status: 503, error };
  }
  if (!row) {
    return { ok: false, status: 401, error: INVALID_CREDENTIALS_ERROR };
  }

  const verified = await verifyPassword(password, row.password_hash);
  if (!verified) {
    return { ok: false, status: 401, error: INVALID_CREDENTIALS_ERROR };
  }

  return { ok: true, data: mapDbUserToSessionUser(row) };
}

export async function registerNormalAccount(input: RegisterAccountInput): Promise<AccountActionResult<SessionUser>> {
  const username = normalizeUsername(input.username);
  const password = input.password ?? "";
  if (username.length < 2) {
    return { ok: false, status: 400, error: USERNAME_TOO_SHORT_ERROR };
  }
  if (password.length < 6) {
    return { ok: false, status: 400, error: PASSWORD_TOO_SHORT_ERROR };
  }
  if (!validateRole(input.role)) {
    return { ok: false, status: 400, error: INVALID_ROLE_ERROR };
  }

  if (input.role === ROLE_PARENT) {
    if (!input.child?.name?.trim() || !input.child.birthDate || !input.child.gender) {
      return { ok: false, status: 400, error: PARENT_CHILD_REQUIRED_ERROR };
    }
  }

  const exists = await getAppUserByUsername(username);
  if (exists.row) {
    return { ok: false, status: 409, error: DUPLICATE_USERNAME_ERROR };
  }
  if (exists.error) {
    return { ok: false, status: 503, error: exists.error };
  }

  const userId = createId("u");
  const institutionId = createId("inst");
  const displayName = input.username.trim();
  const avatar = getDefaultAvatarForRole(input.role);
  const className = input.role === ROLE_TEACHER ? (input.className?.trim() || DEFAULT_TEACHER_CLASS_NAME) : null;

  const starter =
    input.role === ROLE_PARENT && input.child
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

  try {
    await withDbTransaction(async (connection) => {
      await insertAppUser(connection, row);
      await upsertInstitutionSnapshot(connection, institutionId, snapshot, userId);
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return { ok: false, status: 503, error: DATABASE_URL_CONFIG_ERROR_MESSAGE };
    }

    if (isDuplicateKeyError(error)) {
      return { ok: false, status: 409, error: DUPLICATE_USERNAME_ERROR };
    }

    console.error("[AUTH] Failed to create app user", error);
    return {
      ok: false,
      status: 500,
      error: CREATE_ACCOUNT_FAILED_ERROR,
    };
  }

  return {
    ok: true,
    data: mapDbUserToSessionUser(row),
  };
}
