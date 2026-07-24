import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { ApiExtendedSnapshot } from "@/lib/api/types";
import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import {
  decodeDatabaseJson,
  encodeDatabaseJson,
  withDbTransaction,
  type DatabaseConnection,
} from "@/lib/db/server";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import { ApiRouteError } from "@/lib/server/api-errors";

const ROLE_ADMIN = "机构管理员" as const;
const ROLE_TEACHER = "教师" as const;
const ROLE_PARENT = "家长" as const;
const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const REQUIRED_PARENT_CONSENTS = new Set([
  "guardian_authorization",
  "terms_of_service",
  "child_privacy_policy",
]);
const ITEM_ID_KEYS = [
  "id",
  "feedbackId",
  "consultationId",
  "draftId",
  "reminderId",
  "taskId",
  "messageId",
  "conversationId",
  "materialId",
  "menuId",
  "storybookId",
  "teacherId",
  "reportId",
  "attachmentId",
  "auditId",
] as const;

export type BindableMemberRole = Extract<AccountRole, "教师" | "家长">;

export type MemberInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface MemberInvitationRecord {
  invitationId: string;
  institutionId: string;
  role: BindableMemberRole;
  classId: string;
  className: string;
  teacherId?: string;
  codeHash: string;
  status: MemberInvitationStatus;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
}

export interface MembershipRecord {
  userId: string;
  institutionId: string;
  role: AccountRole;
  classId?: string;
  status: "active";
  authzVersion: number;
  createdBy: string;
  joinedAt: Date;
}

export interface InstitutionMembershipDependencies {
  runInTransaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T>;
  createId(prefix: string): string;
  generateCode(): string;
  hashCode(code: string): string;
  now(): Date;
  ensureClass(
    connection: DatabaseConnection,
    institutionId: string,
    className: string,
    proposedClassId: string,
    createdBy: string
  ): Promise<{ classId: string; institutionId: string; name: string }>;
  insertInvitation(
    connection: DatabaseConnection,
    invitation: MemberInvitationRecord
  ): Promise<void>;
  loadInvitationForUpdate(
    connection: DatabaseConnection,
    codeHash: string
  ): Promise<MemberInvitationRecord | null>;
  markInvitationAccepted(
    connection: DatabaseConnection,
    invitationId: string,
    userId: string,
    acceptedAt: Date
  ): Promise<void>;
  loadUserForUpdate(
    connection: DatabaseConnection,
    userId: string
  ): Promise<{
    id: string;
    role: AccountRole;
    display_name: string;
    institution_id: string;
    class_name: string | null;
    child_ids: unknown;
    is_demo: boolean | null;
  } | null>;
  loadMembershipForUpdate(
    connection: DatabaseConnection,
    userId: string
  ): Promise<MembershipRecord | null>;
  loadSnapshotForUpdate(
    connection: DatabaseConnection,
    institutionId: string
  ): Promise<unknown | null>;
  saveSnapshot(
    connection: DatabaseConnection,
    institutionId: string,
    snapshot: ApiExtendedSnapshot,
    updatedBy: string
  ): Promise<void>;
  loadConsentTypesForChildrenForUpdate(
    connection: DatabaseConnection,
    userId: string,
    childIds: string[]
  ): Promise<Array<{ childId: string; consentType: string }>>;
  moveConsentRecords(
    connection: DatabaseConnection,
    userId: string,
    childIds: string[],
    institutionId: string
  ): Promise<void>;
  upsertMembership(
    connection: DatabaseConnection,
    membership: MembershipRecord
  ): Promise<void>;
  updateUserProjection(
    connection: DatabaseConnection,
    userId: string,
    institutionId: string,
    className: string | null,
    childIds: string[]
  ): Promise<void>;
  upsertTeacherAssignment(
    connection: DatabaseConnection,
    assignment: {
      userId: string;
      institutionId: string;
      classId: string;
      assignedBy: string;
      assignedAt: Date;
    }
  ): Promise<void>;
  upsertChildBinding(
    connection: DatabaseConnection,
    binding: {
      userId: string;
      institutionId: string;
      classId: string;
      childId: string;
      createdBy: string;
      createdAt: Date;
    }
  ): Promise<void>;
  appendAuthorizationAudit(
    connection: DatabaseConnection,
    event: {
      eventId: string;
      institutionId: string;
      actorUserId: string;
      subjectUserId: string;
      action: string;
      metadata: Record<string, unknown>;
      createdAt: Date;
    }
  ): Promise<void>;
}

export interface CreateMemberInvitationInput {
  role: BindableMemberRole;
  className: string;
  teacherId?: string;
}

export interface AcceptMemberInvitationInput {
  code: string;
}

type AppUserBindingRow = Awaited<
  ReturnType<InstitutionMembershipDependencies["loadUserForUpdate"]>
>;

function createId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function generateCode() {
  const compact = randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase();
  return compact.match(/.{1,4}/g)?.join("-") ?? compact;
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashCode(code: string) {
  return createHash("sha256").update(normalizeCode(code), "utf8").digest("hex");
}

function parseStringArray(value: unknown) {
  const decoded = decodeDatabaseJson<unknown[]>(value) ?? value;
  return Array.isArray(decoded)
    ? decoded.filter((item): item is string => typeof item === "string")
    : [];
}

function asDate(value: unknown) {
  if (value instanceof Date) return value;
  const parsed = new Date(typeof value === "string" || typeof value === "number" ? value : "");
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function requireNormalDirector(session: SessionUser) {
  if (session.accountKind !== "normal" || session.role !== ROLE_ADMIN) {
    throw new ApiRouteError("forbidden_scope", "仅真实机构管理员账号可以创建成员邀请码。");
  }
}

function requireBindableSession(session: SessionUser) {
  if (
    session.accountKind !== "normal" ||
    (session.role !== ROLE_TEACHER && session.role !== ROLE_PARENT)
  ) {
    throw new ApiRouteError("forbidden_scope", "当前账号不能接受教师或家长邀请码。");
  }
}

function normalizeClassName(value: unknown) {
  const className = typeof value === "string" ? value.trim() : "";
  if (!className || className.length > 100) {
    throw new ApiRouteError("invalid_request", "请填写 1 至 100 个字符的班级名称。");
  }
  return className;
}

function normalizeInviteRole(value: unknown): BindableMemberRole {
  if (value === ROLE_TEACHER || value === ROLE_PARENT) return value;
  throw new ApiRouteError("invalid_request", "邀请码角色必须是教师或家长。");
}

function readItemId(item: unknown) {
  if (!item || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  for (const key of ITEM_ID_KEYS) {
    if (typeof record[key] === "string" && record[key]) return `${key}:${record[key]}`;
  }
  return "";
}

function rewriteWorkspaceValue(
  value: unknown,
  sourceInstitutionId: string,
  targetInstitutionId: string,
  classId: string,
  className: string
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      rewriteWorkspaceValue(
        item,
        sourceInstitutionId,
        targetInstitutionId,
        classId,
        className
      )
    );
  }
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "institutionId" && item === sourceInstitutionId) {
      next[key] = targetInstitutionId;
    } else if (key === "classId" && typeof item === "string") {
      next[key] = classId;
    } else if (key === "className" && typeof item === "string") {
      next[key] = className;
    } else {
      next[key] = rewriteWorkspaceValue(
        item,
        sourceInstitutionId,
        targetInstitutionId,
        classId,
        className
      );
    }
  }
  return next;
}

function mergeCollection(target: unknown[], source: unknown[], collectionName: string) {
  const result = structuredClone(target);
  const byId = new Map<string, unknown>();

  for (const item of result) {
    const id = readItemId(item);
    if (id) byId.set(id, item);
  }

  for (const item of source) {
    const id = readItemId(item);
    if (!id) {
      const encoded = JSON.stringify(item);
      if (!result.some((candidate) => JSON.stringify(candidate) === encoded)) {
        result.push(structuredClone(item));
      }
      continue;
    }

    const existing = byId.get(id);
    if (!existing) {
      const cloned = structuredClone(item);
      result.push(cloned);
      byId.set(id, cloned);
      continue;
    }

    if (JSON.stringify(existing) !== JSON.stringify(item)) {
      throw new ApiRouteError(
        "conflict",
        `迁移 ${collectionName} 时发现重复 ID，请联系管理员人工核对。`
      );
    }
  }

  return result;
}

/**
 * 将个人注册空间复制进机构主快照。源快照不在这里修改或删除，
 * 这样线上迁移失败或需要人工复核时仍保留完整回滚证据。
 */
function mergePersonalWorkspace(params: {
  source: ApiExtendedSnapshot;
  target: ApiExtendedSnapshot;
  sourceInstitutionId: string;
  targetInstitutionId: string;
  classId: string;
  className: string;
}) {
  const rewritten = rewriteWorkspaceValue(
    params.source,
    params.sourceInstitutionId,
    params.targetInstitutionId,
    params.classId,
    params.className
  ) as ApiExtendedSnapshot;
  const next = structuredClone(params.target) as ApiExtendedSnapshot & Record<string, unknown>;

  for (const [key, sourceValue] of Object.entries(rewritten)) {
    if (!Array.isArray(sourceValue)) continue;
    const targetValue = next[key];
    if (!Array.isArray(targetValue)) continue;
    next[key] = mergeCollection(targetValue, sourceValue, key);
  }

  next.updatedAt = new Date().toISOString();
  return next as ApiExtendedSnapshot;
}

function validatePersonalWorkspace(
  snapshot: ApiExtendedSnapshot,
  session: SessionUser
) {
  const workspace = snapshot.meta?.workspace;
  const expectedKind = session.role === ROLE_PARENT ? "family" : "teacher_trial";
  if (
    !workspace ||
    workspace.ownerUserId !== session.id ||
    workspace.institutionId !== session.institutionId ||
    workspace.kind !== expectedKind
  ) {
    throw new ApiRouteError(
      "conflict",
      "该账号已不属于可自动迁移的个人注册空间，请由管理员人工复核。"
    );
  }
}

function ensureCompleteParentConsent(
  childIds: string[],
  consentRows: Array<{ childId: string; consentType: string }>
) {
  for (const childId of childIds) {
    const types = new Set(
      consentRows
        .filter((item) => item.childId === childId)
        .map((item) => item.consentType)
    );
    if ([...REQUIRED_PARENT_CONSENTS].some((type) => !types.has(type))) {
      throw new ApiRouteError(
        "needs_confirmation",
        "孩子档案缺少完整的监护人授权、服务协议或儿童隐私同意，暂不能迁入机构。"
      );
    }
  }
}

function sourceOwnedChildren(
  snapshot: ApiExtendedSnapshot,
  user: NonNullable<AppUserBindingRow>
) {
  const projectedIds = new Set(parseStringArray(user.child_ids));
  const owned = snapshot.children.filter(
    (child) => child.parentUserId === user.id || projectedIds.has(child.id)
  );
  if (owned.length !== snapshot.children.length) {
    throw new ApiRouteError(
      "conflict",
      "家庭空间包含不属于当前家长的孩子档案，不能自动迁移。"
    );
  }
  return owned;
}

async function defaultEnsureClass(
  connection: DatabaseConnection,
  institutionId: string,
  className: string,
  proposedClassId: string,
  createdBy: string
) {
  await connection.execute(
    `
      insert into institutions (id, status, created_by)
      values (?, 'active', ?)
      on duplicate key update
        status = 'active',
        updated_at = current_timestamp
    `,
    [institutionId, createdBy]
  );
  await connection.execute(
    `
      insert into institution_classes (id, institution_id, name, status)
      values (?, ?, ?, 'active')
      on duplicate key update
        status = 'active',
        updated_at = current_timestamp
    `,
    [proposedClassId, institutionId, className]
  );
  const [rows] = await connection.execute(
    `
      select id, institution_id, name
      from institution_classes
      where institution_id = ? and name = ?
      limit 1
      for update
    `,
    [institutionId, className]
  );
  const row = Array.isArray(rows)
    ? (rows[0] as { id?: unknown; institution_id?: unknown; name?: unknown } | undefined)
    : undefined;
  if (
    !row ||
    typeof row.id !== "string" ||
    typeof row.institution_id !== "string" ||
    typeof row.name !== "string"
  ) {
    throw new ApiRouteError("server_error", "班级关系创建失败。");
  }
  return { classId: row.id, institutionId: row.institution_id, name: row.name };
}

const defaultDependencies: InstitutionMembershipDependencies = {
  runInTransaction: withDbTransaction,
  createId,
  generateCode,
  hashCode,
  now: () => new Date(),
  ensureClass: defaultEnsureClass,
  async insertInvitation(connection, invitation) {
    await connection.execute(
      `
        insert into member_invitations (
          id,
          institution_id,
          target_role,
          class_id,
          class_name,
          teacher_id,
          code_hash,
          status,
          created_by,
          expires_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        invitation.invitationId,
        invitation.institutionId,
        invitation.role,
        invitation.classId,
        invitation.className,
        invitation.teacherId ?? null,
        invitation.codeHash,
        invitation.status,
        invitation.createdBy,
        invitation.expiresAt,
      ]
    );
  },
  async loadInvitationForUpdate(connection, codeHashValue) {
    const [rows] = await connection.execute(
      `
        select
          id,
          institution_id,
          target_role,
          class_id,
          class_name,
          teacher_id,
          code_hash,
          status,
          created_by,
          created_at,
          expires_at,
          accepted_by,
          accepted_at
        from member_invitations
        where code_hash = ?
        limit 1
        for update
      `,
      [codeHashValue]
    );
    const row = Array.isArray(rows)
      ? (rows[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!row) return null;
    return {
      invitationId: String(row.id),
      institutionId: String(row.institution_id),
      role: row.target_role as BindableMemberRole,
      classId: String(row.class_id),
      className: String(row.class_name),
      teacherId: typeof row.teacher_id === "string" ? row.teacher_id : undefined,
      codeHash: String(row.code_hash),
      status: row.status as MemberInvitationStatus,
      createdBy: String(row.created_by),
      createdAt: asDate(row.created_at),
      expiresAt: asDate(row.expires_at),
      acceptedBy: typeof row.accepted_by === "string" ? row.accepted_by : undefined,
      acceptedAt: row.accepted_at ? asDate(row.accepted_at) : undefined,
    };
  },
  async markInvitationAccepted(connection, invitationId, userId, acceptedAt) {
    await connection.execute(
      `
        update member_invitations
        set status = 'accepted', accepted_by = ?, accepted_at = ?
        where id = ? and status = 'pending'
      `,
      [userId, acceptedAt, invitationId]
    );
  },
  async loadUserForUpdate(connection, userId) {
    const [rows] = await connection.execute(
      `
        select id, role, display_name, institution_id, class_name, child_ids, is_demo
        from app_users
        where id = ?
        limit 1
        for update
      `,
      [userId]
    );
    const row = Array.isArray(rows)
      ? (rows[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      role: row.role as AccountRole,
      display_name: String(row.display_name),
      institution_id: String(row.institution_id),
      class_name: typeof row.class_name === "string" ? row.class_name : null,
      child_ids: decodeDatabaseJson(row.child_ids) ?? row.child_ids,
      is_demo: Boolean(row.is_demo),
    };
  },
  async loadMembershipForUpdate(connection, userId) {
    const [rows] = await connection.execute(
      `
        select user_id, institution_id, role, class_id, status, authz_version, created_by, joined_at
        from institution_memberships
        where user_id = ?
        limit 1
        for update
      `,
      [userId]
    );
    const row = Array.isArray(rows)
      ? (rows[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!row) return null;
    return {
      userId: String(row.user_id),
      institutionId: String(row.institution_id),
      role: row.role as AccountRole,
      classId: typeof row.class_id === "string" ? row.class_id : undefined,
      status: "active",
      authzVersion: Number(row.authz_version) || 1,
      createdBy: String(row.created_by),
      joinedAt: asDate(row.joined_at),
    };
  },
  async loadSnapshotForUpdate(connection, institutionId) {
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
    const row = Array.isArray(rows)
      ? (rows[0] as { snapshot?: unknown } | undefined)
      : undefined;
    return decodeDatabaseJson(row?.snapshot) ?? row?.snapshot ?? null;
  },
  async saveSnapshot(connection, institutionId, snapshot, updatedBy) {
    const encoded = encodeDatabaseJson(snapshot);
    await connection.execute(
      `
        insert into app_state_snapshots (institution_id, snapshot, updated_by)
        values (?, ?, ?)
        on duplicate key update
          snapshot = ?,
          updated_by = ?
      `,
      [institutionId, encoded, updatedBy, encoded, updatedBy]
    );
  },
  async loadConsentTypesForChildrenForUpdate(connection, userId, childIds) {
    if (childIds.length === 0) return [];
    const placeholders = childIds.map(() => "?").join(", ");
    const [rows] = await connection.execute(
      `
        select child_id, consent_type
        from consent_records
        where user_id = ? and child_id in (${placeholders})
        for update
      `,
      [userId, ...childIds]
    );
    return Array.isArray(rows)
      ? (rows as Array<Record<string, unknown>>).map((row) => ({
          childId: String(row.child_id),
          consentType: String(row.consent_type),
        }))
      : [];
  },
  async moveConsentRecords(connection, userId, childIds, institutionId) {
    if (childIds.length === 0) return;
    const placeholders = childIds.map(() => "?").join(", ");
    await connection.execute(
      `
        update consent_records
        set institution_id = ?
        where user_id = ? and child_id in (${placeholders})
      `,
      [institutionId, userId, ...childIds]
    );
  },
  async upsertMembership(connection, membership) {
    await connection.execute(
      `
        insert into institution_memberships (
          user_id,
          institution_id,
          role,
          class_id,
          status,
          authz_version,
          created_by,
          joined_at
        )
        values (?, ?, ?, ?, 'active', ?, ?, ?)
        on duplicate key update
          institution_id = ?,
          role = ?,
          class_id = ?,
          status = 'active',
          authz_version = authz_version + 1,
          updated_at = current_timestamp
      `,
      [
        membership.userId,
        membership.institutionId,
        membership.role,
        membership.classId ?? null,
        membership.authzVersion,
        membership.createdBy,
        membership.joinedAt,
        membership.institutionId,
        membership.role,
        membership.classId ?? null,
      ]
    );
  },
  async updateUserProjection(
    connection,
    userId,
    institutionId,
    className,
    childIds
  ) {
    await connection.execute(
      `
        update app_users
        set institution_id = ?, class_name = ?, child_ids = ?
        where id = ?
      `,
      [institutionId, className, encodeDatabaseJson(childIds), userId]
    );
  },
  async upsertTeacherAssignment(connection, assignment) {
    await connection.execute(
      `
        insert into teacher_class_assignments (
          user_id,
          institution_id,
          class_id,
          status,
          assigned_by,
          assigned_at
        )
        values (?, ?, ?, 'active', ?, ?)
        on duplicate key update
          institution_id = ?,
          class_id = ?,
          status = 'active',
          assigned_by = ?,
          assigned_at = ?,
          updated_at = current_timestamp
      `,
      [
        assignment.userId,
        assignment.institutionId,
        assignment.classId,
        assignment.assignedBy,
        assignment.assignedAt,
        assignment.institutionId,
        assignment.classId,
        assignment.assignedBy,
        assignment.assignedAt,
      ]
    );
  },
  async upsertChildBinding(connection, binding) {
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
        binding.childId,
        binding.institutionId,
        binding.classId,
        binding.createdBy,
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
        values (?, ?, ?, 'active', ?, ?)
        on duplicate key update
          status = 'active',
          created_by = ?,
          linked_at = ?,
          updated_at = current_timestamp
      `,
      [
        binding.institutionId,
        binding.userId,
        binding.childId,
        binding.createdBy,
        binding.createdAt,
        binding.createdBy,
        binding.createdAt,
      ]
    );
  },
  async appendAuthorizationAudit(connection, event) {
    await connection.execute(
      `
        insert into authorization_audit_events (
          id,
          institution_id,
          actor_user_id,
          subject_user_id,
          action,
          metadata,
          created_at
        )
        values (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        event.eventId,
        event.institutionId,
        event.actorUserId,
        event.subjectUserId,
        event.action,
        encodeDatabaseJson(event.metadata),
        event.createdAt,
      ]
    );
  },
};

export async function createMemberInvitation(
  session: SessionUser,
  input: CreateMemberInvitationInput,
  dependencies: InstitutionMembershipDependencies = defaultDependencies
): Promise<{
  invitationId: string;
  code: string;
  role: BindableMemberRole;
  classId: string;
  className: string;
  expiresAt: string;
}> {
  requireNormalDirector(session);
  const role = normalizeInviteRole(input.role);
  const className = normalizeClassName(input.className);
  const teacherId =
    typeof input.teacherId === "string" && input.teacherId.trim()
      ? input.teacherId.trim()
      : undefined;
  const code = dependencies.generateCode();
  const codeHashValue = dependencies.hashCode(code);
  const now = dependencies.now();
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);

  return dependencies.runInTransaction(async (connection) => {
    const classRow = await dependencies.ensureClass(
      connection,
      session.institutionId,
      className,
      dependencies.createId("class"),
      session.id
    );
    const invitation: MemberInvitationRecord = {
      invitationId: dependencies.createId("invite"),
      institutionId: session.institutionId,
      role,
      classId: classRow.classId,
      className: classRow.name,
      teacherId,
      codeHash: codeHashValue,
      status: "pending",
      createdBy: session.id,
      createdAt: now,
      expiresAt,
    };

    if (teacherId) {
      const rawSnapshot = await dependencies.loadSnapshotForUpdate(
        connection,
        session.institutionId
      );
      const snapshot = normalizeExtendedSnapshot(rawSnapshot, session);
      const teacher = snapshot.teachers.find((item) => item.teacherId === teacherId);
      if (!teacher) {
        throw new ApiRouteError("not_found", "待绑定的教师档案不存在。");
      }
      if (teacher.userId) {
        throw new ApiRouteError("conflict", "该教师档案已经绑定登录账号。");
      }
    }

    await dependencies.upsertMembership(connection, {
      userId: session.id,
      institutionId: session.institutionId,
      role: session.role,
      classId: undefined,
      status: "active",
      authzVersion: 1,
      createdBy: session.id,
      joinedAt: now,
    });
    await dependencies.insertInvitation(connection, invitation);
    await dependencies.appendAuthorizationAudit(connection, {
      eventId: dependencies.createId("authz"),
      institutionId: session.institutionId,
      actorUserId: session.id,
      subjectUserId: session.id,
      action: "member_invitation_created",
      metadata: {
        invitationId: invitation.invitationId,
        targetRole: role,
        classId: invitation.classId,
        teacherId: teacherId ?? null,
      },
      createdAt: now,
    });

    return {
      invitationId: invitation.invitationId,
      code,
      role,
      classId: invitation.classId,
      className: invitation.className,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function acceptMemberInvitation(
  session: SessionUser,
  input: AcceptMemberInvitationInput,
  dependencies: InstitutionMembershipDependencies = defaultDependencies
): Promise<{
  institutionId: string;
  role: BindableMemberRole;
  classId: string;
  className: string;
  childIds: string[];
  migratedChildCount: number;
}> {
  requireBindableSession(session);
  const normalizedCode = normalizeCode(
    typeof input.code === "string" ? input.code : ""
  );
  if (normalizedCode.length < 8 || normalizedCode.length > 32) {
    throw new ApiRouteError("invalid_request", "请输入有效的机构邀请码。");
  }
  const codeHashValue = dependencies.hashCode(normalizedCode);
  const now = dependencies.now();

  return dependencies.runInTransaction(async (connection) => {
    const invitation = await dependencies.loadInvitationForUpdate(
      connection,
      codeHashValue
    );
    if (!invitation) {
      throw new ApiRouteError("not_found", "邀请码不存在或已失效。");
    }
    if (invitation.role !== session.role) {
      throw new ApiRouteError("forbidden_scope", "邀请码角色与当前账号角色不一致。");
    }
    if (invitation.status === "accepted") {
      if (invitation.acceptedBy !== session.id) {
        throw new ApiRouteError("conflict", "邀请码已被其他账号使用。");
      }
    } else if (invitation.status !== "pending") {
      throw new ApiRouteError("conflict", "邀请码已失效。");
    }
    if (invitation.expiresAt.getTime() <= now.getTime()) {
      throw new ApiRouteError("conflict", "邀请码已过期，请联系园长重新生成。");
    }

    const user = await dependencies.loadUserForUpdate(connection, session.id);
    if (!user || user.is_demo || user.role !== session.role) {
      throw new ApiRouteError("forbidden_scope", "当前登录账号与邀请码角色不匹配。");
    }

    const membership = await dependencies.loadMembershipForUpdate(
      connection,
      session.id
    );
    if (
      membership &&
      membership.status === "active" &&
      membership.institutionId !== invitation.institutionId
    ) {
      throw new ApiRouteError(
        "conflict",
        "该账号已经加入其他正式机构，不能自动迁移。"
      );
    }

    const targetRaw = await dependencies.loadSnapshotForUpdate(
      connection,
      invitation.institutionId
    );
    if (!targetRaw) {
      throw new ApiRouteError("not_found", "目标机构数据空间不存在。");
    }
    const targetSession: SessionUser = {
      ...session,
      id: invitation.createdBy,
      name: "机构管理员",
      role: ROLE_ADMIN,
      institutionId: invitation.institutionId,
      className: undefined,
      childIds: [],
    };
    let targetSnapshot = normalizeExtendedSnapshot(targetRaw, targetSession);
    let childIds: string[] = [];

    if (session.institutionId !== invitation.institutionId) {
      const sourceRaw = await dependencies.loadSnapshotForUpdate(
        connection,
        session.institutionId
      );
      if (!sourceRaw) {
        throw new ApiRouteError("not_found", "当前账号的个人注册空间不存在。");
      }
      const sourceSnapshot = normalizeExtendedSnapshot(sourceRaw, session);
      validatePersonalWorkspace(sourceSnapshot, session);

      if (session.role === ROLE_PARENT) {
        const ownedChildren = sourceOwnedChildren(sourceSnapshot, user);
        childIds = ownedChildren.map((child) => child.id);
      } else if (sourceSnapshot.children.length > 0) {
        throw new ApiRouteError(
          "conflict",
          "教师试用空间包含幼儿数据，不能自动迁入正式机构。"
        );
      }

      targetSnapshot = mergePersonalWorkspace({
        source: sourceSnapshot,
        target: targetSnapshot,
        sourceInstitutionId: session.institutionId,
        targetInstitutionId: invitation.institutionId,
        classId: invitation.classId,
        className: invitation.className,
      });
    } else {
      childIds = parseStringArray(user.child_ids);
    }

    if (session.role === ROLE_PARENT && childIds.length > 0) {
      const consentRows =
        await dependencies.loadConsentTypesForChildrenForUpdate(
          connection,
          session.id,
          childIds
        );
      ensureCompleteParentConsent(childIds, consentRows);
    }

    // 先建立成员关系，再写教师分班或监护关系，以满足数据库复合外键。
    await dependencies.upsertMembership(connection, {
      userId: session.id,
      institutionId: invitation.institutionId,
      role: session.role,
      classId: invitation.classId,
      status: "active",
      authzVersion: (membership?.authzVersion ?? 0) + 1,
      createdBy: invitation.createdBy,
      joinedAt: now,
    });

    if (session.role === ROLE_TEACHER) {
      const teacherIndex = invitation.teacherId
        ? targetSnapshot.teachers.findIndex(
            (item) => item.teacherId === invitation.teacherId
          )
        : targetSnapshot.teachers.findIndex((item) => item.userId === session.id);
      const timestamp = now.toISOString();
      if (teacherIndex >= 0) {
        const existing = targetSnapshot.teachers[teacherIndex];
        if (existing.userId && existing.userId !== session.id) {
          throw new ApiRouteError("conflict", "该教师档案已绑定其他登录账号。");
        }
        targetSnapshot.teachers[teacherIndex] = {
          ...existing,
          userId: session.id,
          institutionId: invitation.institutionId,
          className: invitation.className,
          updatedAt: timestamp,
        };
      } else {
        targetSnapshot.teachers.unshift({
          teacherId: dependencies.createId("teacher"),
          userId: session.id,
          name: user.display_name,
          institutionId: invitation.institutionId,
          className: invitation.className,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      await dependencies.upsertTeacherAssignment(connection, {
        userId: session.id,
        institutionId: invitation.institutionId,
        classId: invitation.classId,
        assignedBy: invitation.createdBy,
        assignedAt: now,
      });
    } else {
      for (const childId of childIds) {
        const child = targetSnapshot.children.find((item) => item.id === childId);
        if (!child) {
          throw new ApiRouteError("conflict", "迁移后的孩子档案不完整。");
        }
        child.parentUserId = session.id;
        child.institutionId = invitation.institutionId;
        child.classId = invitation.classId;
        child.className = invitation.className;
        await dependencies.upsertChildBinding(connection, {
          userId: session.id,
          institutionId: invitation.institutionId,
          classId: invitation.classId,
          childId,
          createdBy: invitation.createdBy,
          createdAt: now,
        });
      }
      await dependencies.moveConsentRecords(
        connection,
        session.id,
        childIds,
        invitation.institutionId
      );
    }

    targetSnapshot.updatedAt = now.toISOString();
    await dependencies.saveSnapshot(
      connection,
      invitation.institutionId,
      targetSnapshot,
      session.id
    );
    await dependencies.updateUserProjection(
      connection,
      session.id,
      invitation.institutionId,
      session.role === ROLE_TEACHER ? invitation.className : null,
      childIds
    );
    await dependencies.markInvitationAccepted(
      connection,
      invitation.invitationId,
      session.id,
      now
    );
    await dependencies.appendAuthorizationAudit(connection, {
      eventId: dependencies.createId("authz"),
      institutionId: invitation.institutionId,
      actorUserId: session.id,
      subjectUserId: session.id,
      action: "member_invitation_accepted",
      metadata: {
        invitationId: invitation.invitationId,
        role: session.role,
        classId: invitation.classId,
        migratedChildCount: childIds.length,
        sourceInstitutionId: session.institutionId,
      },
      createdAt: now,
    });

    return {
      institutionId: invitation.institutionId,
      role: invitation.role,
      classId: invitation.classId,
      className: invitation.className,
      childIds,
      migratedChildCount: childIds.length,
    };
  });
}
