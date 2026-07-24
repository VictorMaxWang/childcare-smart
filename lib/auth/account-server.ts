import {
  DATABASE_URL_CONFIG_ERROR_MESSAGE,
  DatabaseConfigError,
  dbQuery,
  decodeDatabaseJson,
  encodeDatabaseJson,
  withDbTransaction,
  type DatabaseConnection,
  type DatabaseConfigErrorCode,
} from "@/lib/db/server";
import {
  DEFAULT_TEACHER_CLASS_NAME,
  getDefaultAvatarForRole,
  getDemoAccountById,
  normalizeUsername,
  type AccountRole,
  type LoginAccountInput,
  type RegisterAccountInput,
  type SessionUser,
} from "@/lib/auth/accounts";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { normalizePhone } from "@/lib/auth/phone";
import {
  applyMembershipProjection,
  loadMembershipProjection,
} from "@/lib/auth/membership-projection";
import { registrationWorkspaceSnapshot } from "@/lib/persistence/bootstrap";
import { getSessionUserId } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/server/security-log";

const ROLE_PARENT = "\u5bb6\u957f" as AccountRole;
const ROLE_TEACHER = "\u6559\u5e08" as AccountRole;
const ROLE_ADMIN = "\u673a\u6784\u7ba1\u7406\u5458" as AccountRole;

const LOGIN_REQUIRED_CREDENTIALS_ERROR = "\u8bf7\u8f93\u5165\u624b\u673a\u53f7\u548c\u5bc6\u7801\u3002";
const LOGIN_INVALID_CREDENTIALS_ERROR = "\u624b\u673a\u53f7\u6216\u5bc6\u7801\u9519\u8bef";
const LOGIN_INVALID_PHONE_ERROR = "\u624b\u673a\u53f7\u683c\u5f0f\u9519\u8bef";
const LOGIN_SERVICE_UNAVAILABLE_ERROR = "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528";
const DATABASE_QUERY_FAILED_ERROR = "\u6570\u636e\u5e93\u8bbf\u95ee\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
const REQUIRED_REGISTER_IDENTITY_ERROR = "\u8bf7\u8f93\u5165\u624b\u673a\u53f7\u6216\u8d26\u53f7\u3002";
const USERNAME_TOO_SHORT_ERROR = "\u8d26\u53f7\u81f3\u5c11\u9700\u8981 2 \u4e2a\u5b57\u7b26\u3002";
const PASSWORD_TOO_SHORT_ERROR = "\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d\u3002";
const INVALID_ROLE_ERROR = "\u7528\u6237\u7c7b\u578b\u65e0\u6548\u3002";
const INVALID_PHONE_ERROR = "\u624b\u673a\u53f7\u683c\u5f0f\u65e0\u6548\u3002";
const DUPLICATE_PHONE_ERROR = "\u8be5\u624b\u673a\u53f7\u5df2\u88ab\u6ce8\u518c\u3002";
const DUPLICATE_USERNAME_ERROR = "\u8be5\u8d26\u53f7\u5df2\u88ab\u6ce8\u518c\u3002";
const CREATE_ACCOUNT_FAILED_ERROR = "\u521b\u5efa\u8d26\u53f7\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
const MYSQL_DUPLICATE_KEY_ERROR_CODE = "ER_DUP_ENTRY";
const MYSQL_DUPLICATE_KEY_ERROR_NUMBER = 1062;
const MYSQL_BAD_FIELD_ERROR_CODE = "ER_BAD_FIELD_ERROR";
const MYSQL_BAD_FIELD_ERROR_NUMBER = 1054;

export type DatabaseRuntimeErrorCode =
  | "DATABASE_ACCESS_DENIED"
  | "DATABASE_CONNECT_TIMEOUT"
  | "DATABASE_CONNECTION_REFUSED"
  | "DATABASE_CONNECTION_LOST"
  | "DATABASE_HOST_NOT_FOUND"
  | "DATABASE_QUERY_FAILED"
  | "DATABASE_SSL_FAILED"
  | "DATABASE_UNKNOWN_DATABASE";

type AccountErrorCode = DatabaseConfigErrorCode | DatabaseRuntimeErrorCode;

type AppUserRow = {
  id: string;
  username_normalized: string;
  phone_normalized?: string | null;
  display_name: string;
  password_hash: string;
  role: AccountRole;
  avatar: string | null;
  institution_id: string;
  class_name: string | null;
  child_ids: unknown;
  is_demo: boolean | null;
};

type AppUserLookupResult = {
  row: AppUserRow | null;
  error: string | null;
  errorCode?: AccountErrorCode;
};

export type AccountActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; errorCode?: AccountErrorCode };

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

function normalizeAccountRole(role: unknown): AccountRole | null {
  if (typeof role !== "string") return null;

  const trimmedRole = role.trim();
  const normalizedRole = trimmedRole.toLowerCase();
  if (normalizedRole === "parent" || trimmedRole === ROLE_PARENT) return ROLE_PARENT;
  if (normalizedRole === "teacher" || trimmedRole === ROLE_TEACHER) return ROLE_TEACHER;
  if (normalizedRole === "admin" || normalizedRole === "institution_admin" || trimmedRole === ROLE_ADMIN) {
    return ROLE_ADMIN;
  }

  return null;
}

function maskPhoneForDisplay(phoneNormalized: string) {
  const nationalNumber = phoneNormalized.startsWith("+86") ? phoneNormalized.slice(3) : phoneNormalized;
  if (nationalNumber.length !== 11) return "手机号用户";

  return `${nationalNumber.slice(0, 3)}****${nationalNumber.slice(7)}`;
}

function resolveDisplayName(input: RegisterAccountInput, fallback: string) {
  return input.displayName?.trim() || fallback;
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

function isUnknownColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const code = (error as { code?: unknown }).code;
  if (code === MYSQL_BAD_FIELD_ERROR_CODE) {
    return true;
  }

  const errno = (error as { errno?: unknown }).errno;
  return errno === MYSQL_BAD_FIELD_ERROR_NUMBER;
}

export function resolveDatabaseRuntimeErrorCode(error: unknown): DatabaseRuntimeErrorCode {
  if (!error || typeof error !== "object") return "DATABASE_QUERY_FAILED";

  const code = (error as { code?: unknown }).code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DATABASE_HOST_NOT_FOUND";
  if (code === "ETIMEDOUT" || code === "PROTOCOL_SEQUENCE_TIMEOUT") return "DATABASE_CONNECT_TIMEOUT";
  if (code === "ECONNREFUSED") return "DATABASE_CONNECTION_REFUSED";
  if (code === "ECONNRESET" || code === "PROTOCOL_CONNECTION_LOST") return "DATABASE_CONNECTION_LOST";
  if (code === "ER_ACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR") return "DATABASE_ACCESS_DENIED";
  if (code === "ER_BAD_DB_ERROR") return "DATABASE_UNKNOWN_DATABASE";
  if (typeof code === "string" && code.toLowerCase().includes("ssl")) return "DATABASE_SSL_FAILED";

  const errno = (error as { errno?: unknown }).errno;
  if (errno === 1044 || errno === 1045) return "DATABASE_ACCESS_DENIED";
  if (errno === 1049) return "DATABASE_UNKNOWN_DATABASE";

  const message = (error as { message?: unknown }).message;
  if (typeof message === "string" && message.toLowerCase().includes("ssl")) return "DATABASE_SSL_FAILED";

  return "DATABASE_QUERY_FAILED";
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
    logSecurityEvent("error", "auth.account.load_by_id_failed", { error });
    throw error;
  }
}

async function getAppUserByUsername(username: string): Promise<AppUserLookupResult> {
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
      return { row: null, error: DATABASE_URL_CONFIG_ERROR_MESSAGE, errorCode: error.publicCode } as const;
    }

    logSecurityEvent("error", "auth.account.load_by_username_failed", { error });
    return { row: null, error: DATABASE_QUERY_FAILED_ERROR, errorCode: resolveDatabaseRuntimeErrorCode(error) } as const;
  }
}

export async function getAppUserByPhoneNormalized(phone: string): Promise<AppUserLookupResult> {
  let phoneNormalized: string;
  try {
    phoneNormalized = normalizePhone(phone);
  } catch {
    return { row: null, error: null } as const;
  }

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
        where phone_normalized = ?
        limit 1
      `,
      [phoneNormalized]
    );

    return { row: rows[0] ?? null, error: null } as const;
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return { row: null, error: DATABASE_URL_CONFIG_ERROR_MESSAGE, errorCode: error.publicCode } as const;
    }

    if (isUnknownColumnError(error)) {
      logSecurityEvent("warn", "auth.account.phone_lookup_column_missing", { error });
      return { row: null, error: null } as const;
    }

    logSecurityEvent("error", "auth.account.load_by_phone_failed", { error });
    return { row: null, error: DATABASE_QUERY_FAILED_ERROR, errorCode: resolveDatabaseRuntimeErrorCode(error) } as const;
  }
}

async function insertAppUser(connection: DatabaseConnection, row: AppUserRow, options?: { includePhoneNormalized?: boolean }) {
  if (options?.includePhoneNormalized) {
    await connection.execute(
      `
        insert into app_users (
          id,
          username_normalized,
          phone_normalized,
          display_name,
          password_hash,
          role,
          avatar,
          institution_id,
          class_name,
          child_ids,
          is_demo
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.username_normalized,
        row.phone_normalized ?? null,
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
    return;
  }

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

export async function insertAppUserWithPhoneFallback(connection: DatabaseConnection, row: AppUserRow) {
  try {
    await insertAppUser(connection, row, { includePhoneNormalized: Boolean(row.phone_normalized) });
  } catch (error) {
    if (row.phone_normalized && isUnknownColumnError(error)) {
      logSecurityEvent("warn", "auth.account.phone_insert_column_missing", { error });
      await insertAppUser(connection, row);
      return;
    }

    throw error;
  }
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
  if (!row) return null;
  const session = mapDbUserToSessionUser(row);
  const membership = await loadMembershipProjection(userId);
  return applyMembershipProjection(session, membership);
}

export async function getCurrentSessionUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return resolveSessionUserById(userId);
}

export type LoginNormalAccountDependencies = {
  getUserByPhoneNormalized: (phone: string) => Promise<AppUserLookupResult>;
  getUserByUsername: (username: string) => Promise<AppUserLookupResult>;
  verifyPassword: typeof verifyPassword;
};

const defaultLoginNormalAccountDependencies: LoginNormalAccountDependencies = {
  getUserByPhoneNormalized: getAppUserByPhoneNormalized,
  getUserByUsername: getAppUserByUsername,
  verifyPassword,
};

async function verifyLoginRow(
  row: AppUserRow | null,
  password: string,
  dependencies: LoginNormalAccountDependencies
): Promise<AccountActionResult<SessionUser> | null> {
  if (!row) return null;

  const verified = await dependencies.verifyPassword(password, row.password_hash);
  if (!verified) {
    return { ok: false, status: 401, error: LOGIN_INVALID_CREDENTIALS_ERROR };
  }

  return { ok: true, data: mapDbUserToSessionUser(row) };
}

async function lookupUsernameCandidates(
  candidates: string[],
  password: string,
  dependencies: LoginNormalAccountDependencies
): Promise<AccountActionResult<SessionUser> | null> {
  const uniqueCandidates = [...new Set(candidates.map(normalizeUsername).filter(Boolean))];

  for (const candidate of uniqueCandidates) {
    const { row, error } = await dependencies.getUserByUsername(candidate);
    if (error) {
      return { ok: false, status: 503, error: LOGIN_SERVICE_UNAVAILABLE_ERROR };
    }

    const verified = await verifyLoginRow(row, password, dependencies);
    if (verified) return verified;
  }

  return null;
}

export async function authenticateLoginAccountWithDependencies(
  input: LoginAccountInput,
  dependencies: LoginNormalAccountDependencies = defaultLoginNormalAccountDependencies
): Promise<AccountActionResult<SessionUser>> {
  const password = typeof input.password === "string" ? input.password : "";
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const rawUsername = typeof input.username === "string" ? input.username.trim() : "";

  if (!password || (!rawPhone && !rawUsername)) {
    return { ok: false, status: 400, error: LOGIN_REQUIRED_CREDENTIALS_ERROR };
  }

  if (rawPhone) {
    let phoneNormalized: string;
    try {
      phoneNormalized = normalizePhone(rawPhone);
    } catch {
      return { ok: false, status: 400, error: LOGIN_INVALID_PHONE_ERROR };
    }

    const phoneLookup = await dependencies.getUserByPhoneNormalized(phoneNormalized);
    if (phoneLookup.error) {
      return { ok: false, status: 503, error: LOGIN_SERVICE_UNAVAILABLE_ERROR };
    }

    const phoneVerified = await verifyLoginRow(phoneLookup.row, password, dependencies);
    if (phoneVerified) return phoneVerified;

    const fallbackVerified = await lookupUsernameCandidates([phoneNormalized, rawPhone], password, dependencies);
    if (fallbackVerified) return fallbackVerified;

    return { ok: false, status: 401, error: LOGIN_INVALID_CREDENTIALS_ERROR };
  }

  const usernameVerified = await lookupUsernameCandidates([rawUsername], password, dependencies);
  if (usernameVerified) return usernameVerified;

  return { ok: false, status: 401, error: LOGIN_INVALID_CREDENTIALS_ERROR };
}

export async function authenticateNormalAccount(username: string, password: string): Promise<AccountActionResult<SessionUser>> {
  return authenticateLoginAccountWithDependencies({ username, password });
}

export type RegisterNormalAccountDependencies = {
  createId: typeof createId;
  getUserByPhoneNormalized: (phone: string) => Promise<AppUserLookupResult>;
  getUserByUsername: (username: string) => Promise<AppUserLookupResult>;
  hashPassword: typeof hashPassword;
  insertAppUser: typeof insertAppUserWithPhoneFallback;
  runInTransaction: typeof withDbTransaction;
  upsertInstitutionSnapshot: typeof upsertInstitutionSnapshot;
};

type NormalizedRegisterInput = {
  className: string | null;
  displayName: string;
  duplicateUsernameCandidates: string[];
  password: string;
  phoneNormalized: string | null;
  role: AccountRole;
  username: string;
};

const defaultRegisterNormalAccountDependencies: RegisterNormalAccountDependencies = {
  createId,
  getUserByPhoneNormalized: getAppUserByPhoneNormalized,
  getUserByUsername: getAppUserByUsername,
  hashPassword,
  insertAppUser: insertAppUserWithPhoneFallback,
  runInTransaction: withDbTransaction,
  upsertInstitutionSnapshot,
};

function normalizeRegisterInput(input: RegisterAccountInput): AccountActionResult<NormalizedRegisterInput> {
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const rawUsername = typeof input.username === "string" ? input.username.trim() : "";
  if (!rawPhone && !rawUsername) {
    return { ok: false, status: 400, error: REQUIRED_REGISTER_IDENTITY_ERROR };
  }

  const role = normalizeAccountRole(input.role);
  if (!role) {
    return { ok: false, status: 400, error: INVALID_ROLE_ERROR };
  }

  const password = typeof input.password === "string" ? input.password : "";
  if (!password.trim() || password.length < 6) {
    return { ok: false, status: 400, error: PASSWORD_TOO_SHORT_ERROR };
  }

  if (rawPhone) {
    let phoneNormalized: string;
    try {
      phoneNormalized = normalizePhone(rawPhone);
    } catch {
      return { ok: false, status: 400, error: INVALID_PHONE_ERROR };
    }

    const duplicateUsernameCandidates = [...new Set([phoneNormalized, rawPhone].map(normalizeUsername).filter(Boolean))];
    return {
      ok: true,
      data: {
        className: role === ROLE_TEACHER ? (input.className?.trim() || DEFAULT_TEACHER_CLASS_NAME) : null,
        displayName: resolveDisplayName(input, maskPhoneForDisplay(phoneNormalized)),
        duplicateUsernameCandidates,
        password,
        phoneNormalized,
        role,
        username: phoneNormalized,
      },
    };
  }

  const username = normalizeUsername(rawUsername);
  if (username.length < 2) {
    return { ok: false, status: 400, error: USERNAME_TOO_SHORT_ERROR };
  }

  return {
    ok: true,
    data: {
      className: role === ROLE_TEACHER ? (input.className?.trim() || DEFAULT_TEACHER_CLASS_NAME) : null,
      displayName: resolveDisplayName(input, rawUsername),
      duplicateUsernameCandidates: [username],
      password,
      phoneNormalized: null,
      role,
      username,
    },
  };
}

async function ensureNoDuplicateRegistration(
  normalized: NormalizedRegisterInput,
  dependencies: RegisterNormalAccountDependencies
): Promise<AccountActionResult<null>> {
  if (normalized.phoneNormalized) {
    const phoneExists = await dependencies.getUserByPhoneNormalized(normalized.phoneNormalized);
    if (phoneExists.row) {
      return { ok: false, status: 409, error: DUPLICATE_PHONE_ERROR };
    }
    if (phoneExists.error) {
      return { ok: false, status: 503, error: phoneExists.error, errorCode: phoneExists.errorCode };
    }

    for (const candidate of normalized.duplicateUsernameCandidates) {
      const usernameExists = await dependencies.getUserByUsername(candidate);
      if (usernameExists.row) {
        return { ok: false, status: 409, error: DUPLICATE_PHONE_ERROR };
      }
      if (usernameExists.error) {
        return { ok: false, status: 503, error: usernameExists.error, errorCode: usernameExists.errorCode };
      }
    }

    return { ok: true, data: null };
  }

  const exists = await dependencies.getUserByUsername(normalized.username);
  if (exists.row) {
    return { ok: false, status: 409, error: DUPLICATE_USERNAME_ERROR };
  }
  if (exists.error) {
    return { ok: false, status: 503, error: exists.error, errorCode: exists.errorCode };
  }

  return { ok: true, data: null };
}

export async function registerNormalAccountWithDependencies(
  input: RegisterAccountInput,
  dependencies: RegisterNormalAccountDependencies
): Promise<AccountActionResult<SessionUser>> {
  const normalized = normalizeRegisterInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const duplicate = await ensureNoDuplicateRegistration(normalized.data, dependencies);
  if (!duplicate.ok) {
    return duplicate;
  }

  const userId = dependencies.createId("u");
  const institutionId = dependencies.createId("inst");
  const avatar = getDefaultAvatarForRole(normalized.data.role);
  const snapshot = registrationWorkspaceSnapshot({
    institutionId,
    ownerUserId: userId,
    ownerRole: normalized.data.role,
  });
  const passwordHash = await dependencies.hashPassword(normalized.data.password);

  const row: AppUserRow = {
    id: userId,
    username_normalized: normalized.data.username,
    phone_normalized: normalized.data.phoneNormalized,
    display_name: normalized.data.displayName,
    password_hash: passwordHash,
    role: normalized.data.role,
    avatar,
    institution_id: institutionId,
    class_name: normalized.data.className,
    child_ids: [],
    is_demo: false,
  };

  try {
    await dependencies.runInTransaction(async (connection) => {
      await dependencies.insertAppUser(connection, row);
      await dependencies.upsertInstitutionSnapshot(connection, institutionId, snapshot, userId);
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return { ok: false, status: 503, error: DATABASE_URL_CONFIG_ERROR_MESSAGE, errorCode: error.publicCode };
    }

    if (isDuplicateKeyError(error)) {
      return { ok: false, status: 409, error: normalized.data.phoneNormalized ? DUPLICATE_PHONE_ERROR : DUPLICATE_USERNAME_ERROR };
    }

    logSecurityEvent("error", "auth.account.create_failed", { error });
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

export async function registerNormalAccount(input: RegisterAccountInput): Promise<AccountActionResult<SessionUser>> {
  return registerNormalAccountWithDependencies(input, defaultRegisterNormalAccountDependencies);
}
