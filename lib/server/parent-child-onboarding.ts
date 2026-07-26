import "server-only";

import { DEFAULT_PARENT_CHILD_CLASS_NAME, getRoleHomePath, type SessionUser } from "@/lib/auth/accounts";
import type { ApiChild, ApiChildInput, ApiExtendedSnapshot, ApiParentChildOnboardingInput } from "@/lib/api/types";
import {
  DATABASE_URL_CONFIG_ERROR_MESSAGE,
  DatabaseConfigError,
  decodeDatabaseJson,
  encodeDatabaseJson,
  getDatabasePool,
  withDbTransaction,
  type DatabaseConnection,
} from "@/lib/db/server";
import { registrationWorkspaceSnapshot } from "@/lib/persistence/bootstrap";
import { createApiId, normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import { ApiRouteError } from "@/lib/server/api-errors";
import { logSecurityEvent } from "@/lib/server/security-log";
import { validateChildOnboardingInput } from "@/lib/parent/child-onboarding";

export const CHILD_ONBOARDING_POLICY_VERSION = "2026-07-04-child-onboarding-v1";
export const CHILD_ONBOARDING_CONSENT_TYPES = [
  "guardian_authorization",
  "terms_of_service",
  "child_privacy_policy",
] as const;

const CONSENT_RECORDS_STORAGE_PROBE_SQL = "select 1 from consent_records limit 0";

export interface ParentChildOnboardingRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface ParentChildOnboardingConsentRecord {
  id: string;
  institutionId: string;
  userId: string;
  childId: string;
  consentType: (typeof CHILD_ONBOARDING_CONSENT_TYPES)[number];
  policyVersion: string;
  agreedAt: Date;
  ip: string | null;
  userAgent: string | null;
}

type ParentAppUserRow = {
  id: string;
  role: SessionUser["role"];
  institution_id: string;
  child_ids: unknown;
  is_demo: boolean | number | string | null;
};

export type ParentChildOnboardingDependencies = {
  ensureConsentRecordsStorage: () => Promise<void>;
  runInTransaction: typeof withDbTransaction;
  loadParentUserForUpdate: (
    connection: DatabaseConnection,
    userId: string
  ) => Promise<ParentAppUserRow | null>;
  loadSnapshotForUpdate: (connection: DatabaseConnection, institutionId: string) => Promise<unknown | null>;
  saveSnapshot: (
    connection: DatabaseConnection,
    institutionId: string,
    snapshot: ApiExtendedSnapshot,
    updatedBy: string
  ) => Promise<void>;
  updateUserChildIds: (
    connection: DatabaseConnection,
    userId: string,
    childIds: string[]
  ) => Promise<void>;
  insertConsentRecord: (
    connection: DatabaseConnection,
    record: ParentChildOnboardingConsentRecord
  ) => Promise<void>;
  upsertChildAuthorization: (
    connection: DatabaseConnection,
    authorization: {
      userId: string;
      institutionId: string;
      classId: string;
      childId: string;
    }
  ) => Promise<void>;
  createId: typeof createApiId;
  now: () => Date;
};

function isParentRole(role: SessionUser["role"]) {
  return getRoleHomePath(role) === "/parent";
}

function isDemoFlag(value: ParentAppUserRow["is_demo"]) {
  return value === true || value === 1 || value === "1";
}

function parseChildIds(value: unknown) {
  const parsed = decodeDatabaseJson<unknown[]>(value) ?? value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function clipString(value: string | null | undefined, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function resolveBirthDate(
  input: ApiParentChildOnboardingInput & { consentAccepted: true },
  now: Date
) {
  if (input.birthDate) {
    return input.birthDate;
  }

  const ageMonth = typeof input.ageMonth === "number" ? input.ageMonth : 0;
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCMonth(date.getUTCMonth() - ageMonth);
  return date.toISOString().slice(0, 10);
}

function createMinimalParentChild(params: {
  childId: string;
  input: ApiParentChildOnboardingInput & { consentAccepted: true };
  session: SessionUser;
  nowIso: string;
}): ApiChild {
  const gender: ApiChildInput["gender"] = params.input.gender ?? "女";

  return {
    id: params.childId,
    name: params.input.name?.trim() || params.input.nickname?.trim() || "未命名幼儿",
    nickname: params.input.nickname?.trim() || undefined,
    birthDate: resolveBirthDate(params.input, new Date(params.nowIso)),
    gender,
    allergies: [],
    heightCm: 0,
    weightKg: 0,
    guardians: [],
    institutionId: params.session.institutionId,
    classId: params.session.classId,
    className: params.session.className || DEFAULT_PARENT_CHILD_CLASS_NAME,
    specialNotes: "",
    avatar: gender === "男" ? "👦" : "👧",
    parentUserId: params.session.id,
    createdAt: params.nowIso,
    updatedAt: params.nowIso,
  };
}

async function defaultLoadParentUserForUpdate(connection: DatabaseConnection, userId: string) {
  const [rows] = await connection.execute(
    `
      select
        id,
        role,
        institution_id,
        child_ids,
        is_demo
      from app_users
      where id = ?
      limit 1
      for update
    `,
    [userId]
  );

  return Array.isArray(rows) ? ((rows as ParentAppUserRow[])[0] ?? null) : null;
}

async function defaultLoadSnapshotForUpdate(connection: DatabaseConnection, institutionId: string) {
  const [rows] = await connection.execute(
    `
      select snapshot
      from app_state_snapshots
      where institution_id = ?
      limit 1
      for update
    `,
    [institutionId]
  );

  const row = Array.isArray(rows) ? (rows as Array<{ snapshot?: unknown }>)[0] : null;
  return decodeDatabaseJson<unknown>(row?.snapshot) ?? row?.snapshot ?? null;
}

async function defaultSaveSnapshot(
  connection: DatabaseConnection,
  institutionId: string,
  snapshot: ApiExtendedSnapshot,
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

async function defaultUpdateUserChildIds(
  connection: DatabaseConnection,
  userId: string,
  childIds: string[]
) {
  await connection.execute(
    `
      update app_users
      set child_ids = ?
      where id = ?
    `,
    [encodeDatabaseJson(childIds), userId]
  );
}

async function defaultInsertConsentRecord(
  connection: DatabaseConnection,
  record: ParentChildOnboardingConsentRecord
) {
  await connection.execute(
    `
      insert into consent_records (
        id,
        institution_id,
        user_id,
        child_id,
        consent_type,
        policy_version,
        agreed_at,
        ip,
        user_agent
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      record.id,
      record.institutionId,
      record.userId,
      record.childId,
      record.consentType,
      record.policyVersion,
      record.agreedAt,
      record.ip,
      record.userAgent,
    ]
  );
}

async function defaultUpsertChildAuthorization(
  connection: DatabaseConnection,
  authorization: {
    userId: string;
    institutionId: string;
    classId: string;
    childId: string;
  }
) {
  await connection.execute(
    `
      insert into child_registry (child_id, institution_id, class_id, status, created_by)
      values (?, ?, ?, 'active', ?)
      on duplicate key update
        class_id = if(institution_id = values(institution_id), values(class_id), class_id),
        status = 'active',
        updated_at = current_timestamp
    `,
    [
      authorization.childId,
      authorization.institutionId,
      authorization.classId,
      authorization.userId,
    ]
  );
  await connection.execute(
    `
      insert into guardian_child_links (
        institution_id,
        user_id,
        child_id,
        status,
        created_by,
        linked_at
      )
      values (?, ?, ?, 'active', ?, current_timestamp)
      on duplicate key update
        status = 'active',
        updated_at = current_timestamp
    `,
    [
      authorization.institutionId,
      authorization.userId,
      authorization.childId,
      authorization.userId,
    ]
  );
}

let consentRecordsStorageReady: Promise<void> | null = null;

async function defaultEnsureConsentRecordsStorage() {
  if (!consentRecordsStorageReady) {
    consentRecordsStorageReady = getDatabasePool()
      // 生产应用账号只需要 DML 权限；DDL 由版本化 migration 负责。
      .execute(CONSENT_RECORDS_STORAGE_PROBE_SQL)
      .then(() => undefined)
      .catch((error) => {
        consentRecordsStorageReady = null;
        throw error;
      });
  }

  await consentRecordsStorageReady;
}

export const defaultParentChildOnboardingDependencies: ParentChildOnboardingDependencies = {
  ensureConsentRecordsStorage: defaultEnsureConsentRecordsStorage,
  runInTransaction: withDbTransaction,
  loadParentUserForUpdate: defaultLoadParentUserForUpdate,
  loadSnapshotForUpdate: defaultLoadSnapshotForUpdate,
  saveSnapshot: defaultSaveSnapshot,
  updateUserChildIds: defaultUpdateUserChildIds,
  insertConsentRecord: defaultInsertConsentRecord,
  upsertChildAuthorization: defaultUpsertChildAuthorization,
  createId: createApiId,
  now: () => new Date(),
};

export async function createParentChildWithConsent(
  session: SessionUser,
  input: ApiParentChildOnboardingInput,
  requestMeta: ParentChildOnboardingRequestMeta = {},
  dependencies: ParentChildOnboardingDependencies = defaultParentChildOnboardingDependencies
) {
  if (!isParentRole(session.role)) {
    throw new ApiRouteError("forbidden_scope", "仅家长账号可以创建孩子成长档案。", 403);
  }

  if (session.accountKind !== "normal") {
    throw new ApiRouteError("forbidden_scope", "示例账号不能写入真实孩子档案。", 403);
  }

  const validated = validateChildOnboardingInput(input);
  if (!validated.ok) {
    throw new ApiRouteError("invalid_request", validated.error, 400);
  }

  try {
    await dependencies.ensureConsentRecordsStorage();

    return await dependencies.runInTransaction(async (connection) => {
      const parentRow = await dependencies.loadParentUserForUpdate(connection, session.id);
      if (!parentRow) {
        throw new ApiRouteError("unauthorized", "当前家长账号不存在。", 401);
      }
      if (!isParentRole(parentRow.role)) {
        throw new ApiRouteError("forbidden_scope", "当前账号不是家长账号。", 403);
      }
      if (parentRow.institution_id !== session.institutionId) {
        throw new ApiRouteError("forbidden_scope", "不能跨机构创建孩子档案。", 403);
      }
      if (isDemoFlag(parentRow.is_demo)) {
        throw new ApiRouteError("forbidden_scope", "示例账号不能写入真实孩子档案。", 403);
      }

      const now = dependencies.now();
      const nowIso = now.toISOString();
      const rawSnapshot =
        (await dependencies.loadSnapshotForUpdate(connection, session.institutionId)) ??
        registrationWorkspaceSnapshot({
          institutionId: session.institutionId,
          ownerUserId: session.id,
          ownerRole: session.role,
          createdAt: nowIso,
        });
      const snapshot = normalizeExtendedSnapshot(rawSnapshot, session);
      const childId = dependencies.createId("c");
      const classBinding = session.classId
        ? {
            classId: session.classId,
            className: session.className || DEFAULT_PARENT_CHILD_CLASS_NAME,
          }
        : null;
      const child = createMinimalParentChild({
        childId,
        input: validated.payload,
        session: {
          ...session,
          classId: classBinding?.classId,
          className: classBinding?.className || DEFAULT_PARENT_CHILD_CLASS_NAME,
        },
        nowIso,
      });
      const childIds = uniqueStrings([...parseChildIds(parentRow.child_ids), child.id]);
      const requestIp = clipString(requestMeta.ip, 64);
      const userAgent = clipString(requestMeta.userAgent, 512);

      snapshot.children = [child, ...snapshot.children];
      snapshot.updatedAt = nowIso;
      await dependencies.saveSnapshot(connection, session.institutionId, snapshot, session.id);
      await dependencies.updateUserChildIds(connection, session.id, childIds);
      // 新注册家长尚未接受机构邀请时没有 membership/class 外键；此时只写个人家庭空间。
      // 接受邀请后由 institution-membership 迁移逻辑补齐 child_registry 与监护关系。
      if (classBinding) {
        await dependencies.upsertChildAuthorization(connection, {
          userId: session.id,
          institutionId: session.institutionId,
          classId: classBinding.classId,
          childId: child.id,
        });
      }

      for (const consentType of CHILD_ONBOARDING_CONSENT_TYPES) {
        await dependencies.insertConsentRecord(connection, {
          id: dependencies.createId("consent"),
          institutionId: session.institutionId,
          userId: session.id,
          childId: child.id,
          consentType,
          policyVersion: CHILD_ONBOARDING_POLICY_VERSION,
          agreedAt: new Date(now.getTime()),
          ip: requestIp,
          userAgent,
        });
      }

      return child;
    });
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }
    if (error instanceof DatabaseConfigError) {
      throw new ApiRouteError("provider_unavailable", DATABASE_URL_CONFIG_ERROR_MESSAGE, 503);
    }

    logSecurityEvent("error", "parent.child_onboarding.create_failed", { error });
    throw new ApiRouteError("server_error", "孩子成长档案创建失败，请稍后重试。", 500);
  }
}
