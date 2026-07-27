import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
} from "mysql2/promise";

import { getDatabasePool } from "@/lib/db/server";

const LEASE_MS = 60_000;
const RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_SUBMISSION_ATTEMPTS = 2;
const EXPIRED_CLEANUP_BATCH_SIZE = 100;
const DEFAULT_DATABASE_BUDGET_MS = 5_000;
const MAX_RESULT_JSON_BYTES = 1_000_000;
const AUDIO_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface VivoAsrTaskIdentity {
  institutionId: string;
  userId: string;
  providerModel: string;
  audioDigest: string;
  mimeType: string;
}

export interface VivoAsrTaskOperation {
  nowMs?: number;
  deadlineAtMs?: number;
}

export type VivoAsrTaskClaimAction =
  | "submit"
  | "resume"
  | "wait"
  | "ready"
  | "blocked";

export interface VivoAsrTaskClaim {
  action: VivoAsrTaskClaimAction;
  leaseToken: string | null;
  requestId: string;
  sessionId: string;
  taskId: string | null;
  resultJson: unknown | null;
  lastErrorReason: string | null;
}

export interface VivoAsrTaskStore {
  claim(
    identity: VivoAsrTaskIdentity,
    operation?: VivoAsrTaskOperation
  ): Promise<VivoAsrTaskClaim>;
  markRunDispatching(
    identity: VivoAsrTaskIdentity,
    leaseToken: string,
    operation?: VivoAsrTaskOperation
  ): Promise<boolean>;
  markRunning(
    identity: VivoAsrTaskIdentity,
    leaseToken: string,
    taskId: string,
    operation?: VivoAsrTaskOperation
  ): Promise<boolean>;
  markPending(
    identity: VivoAsrTaskIdentity,
    leaseToken: string,
    taskId: string,
    reason: string,
    operation?: VivoAsrTaskOperation
  ): Promise<boolean>;
  markReady(
    identity: VivoAsrTaskIdentity,
    leaseToken: string,
    taskId: string,
    resultJson: unknown,
    operation?: VivoAsrTaskOperation
  ): Promise<boolean>;
  markRetryable(
    identity: VivoAsrTaskIdentity,
    leaseToken: string,
    reason: string,
    operation?: VivoAsrTaskOperation
  ): Promise<boolean>;
  markBlocked(
    identity: VivoAsrTaskIdentity,
    leaseToken: string,
    reason: string,
    operation?: VivoAsrTaskOperation
  ): Promise<boolean>;
}

type StoredStatus =
  | "waiting"
  | "submitting"
  | "retryable"
  | "run-dispatching"
  | "running"
  | "ready"
  | "blocked";

type StoredTask = {
  status: StoredStatus | string;
  leaseToken: string | null;
  leaseExpiresAtMs: number | null;
  requestId: string | null;
  sessionId: string | null;
  taskId: string | null;
  attemptCount: number;
  resultJson: unknown | null;
  lastErrorReason: string | null;
  expiresAtMs: number;
};

type VivoAsrTaskRow = {
  status: string;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
  request_id: string | null;
  session_id: string | null;
  task_id: string | null;
  attempt_count: number;
  result_json: unknown | null;
  last_error_reason: string | null;
  expires_at: Date | string;
};

type SqlValue = string | number | Date | null;
type ConnectionLifecycle = {
  destroyed: boolean;
};

function safeIdentifier(value: string, field: string, maxLength = 191) {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new Error(
      `${field} is required, must be printable, and must not exceed ${maxLength} characters`
    );
  }
  return normalized;
}

function safeReason(value: string) {
  const normalized = value.replace(/\s+/gu, " ").trim().slice(0, 500);
  return normalized || "Vivo ASR task state changed without a reason";
}

function normalizeIdentity(identity: VivoAsrTaskIdentity) {
  const audioDigest = identity.audioDigest.trim().toLowerCase();
  if (!AUDIO_DIGEST_PATTERN.test(audioDigest)) {
    throw new Error("audioDigest must be a SHA-256 hex digest");
  }
  return {
    institutionId: safeIdentifier(
      identity.institutionId,
      "institutionId"
    ),
    userId: safeIdentifier(identity.userId, "userId"),
    providerModel: safeIdentifier(
      identity.providerModel,
      "providerModel"
    ),
    audioDigest,
    mimeType: safeIdentifier(
      identity.mimeType.toLowerCase(),
      "mimeType",
      127
    ),
  } satisfies VivoAsrTaskIdentity;
}

function buildTaskKey(identity: VivoAsrTaskIdentity) {
  const normalized = normalizeIdentity(identity);
  return createHash("sha256")
    .update(
      [
        normalized.institutionId,
        normalized.userId,
        normalized.providerModel,
        normalized.audioDigest,
        normalized.mimeType,
      ].join("\u001f"),
      "utf8"
    )
    .digest("hex");
}

function normalizeLeaseToken(value: string) {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("Vivo ASR lease token is invalid");
  }
  return normalized;
}

function normalizeTaskId(value: string) {
  return safeIdentifier(value, "taskId");
}

function cloneJson<T>(value: T): T {
  const serialized = serializeResultJson(value);
  return JSON.parse(serialized) as T;
}

function serializeResultJson(value: unknown) {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("Vivo ASR resultJson must be valid JSON");
  }
  if (serialized === undefined) {
    throw new Error("Vivo ASR resultJson must be valid JSON");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_RESULT_JSON_BYTES) {
    throw new Error("Vivo ASR resultJson exceeds the 1 MB limit");
  }
  return serialized;
}

function decodeResultJson(value: unknown) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) {
    return decodeResultJson(value.toString("utf8"));
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  try {
    return cloneJson(value);
  } catch {
    return null;
  }
}

function asEpochMs(value: Date | string | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStoredTask(rows: unknown): StoredTask | null {
  const row = Array.isArray(rows)
    ? (rows[0] as VivoAsrTaskRow | undefined)
    : undefined;
  if (!row) return null;
  return {
    status: row.status,
    leaseToken: row.lease_token,
    leaseExpiresAtMs: asEpochMs(row.lease_expires_at),
    requestId: row.request_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    attemptCount: Number(row.attempt_count) || 0,
    resultJson: decodeResultJson(row.result_json),
    lastErrorReason: row.last_error_reason,
    expiresAtMs: asEpochMs(row.expires_at) ?? 0,
  };
}

function resolveNow(operation?: VivoAsrTaskOperation) {
  const nowMs = operation?.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) {
    throw new Error("Vivo ASR task nowMs must be finite");
  }
  return nowMs;
}

function assertOperationActive(operation?: VivoAsrTaskOperation) {
  if (
    typeof operation?.deadlineAtMs === "number" &&
    operation.deadlineAtMs <= Date.now()
  ) {
    throw new Error("Vivo ASR task database deadline exhausted");
  }
}

function withDefaultDatabaseDeadline(
  operation: VivoAsrTaskOperation = {}
) {
  assertOperationActive(operation);
  return {
    ...operation,
    deadlineAtMs:
      operation.deadlineAtMs ??
      Date.now() + DEFAULT_DATABASE_BUDGET_MS,
  } satisfies VivoAsrTaskOperation;
}

function newWaitingTask(nowMs: number): StoredTask {
  return {
    status: "waiting",
    leaseToken: null,
    leaseExpiresAtMs: null,
    requestId: null,
    sessionId: null,
    taskId: null,
    attemptCount: 0,
    resultJson: null,
    lastErrorReason: null,
    expiresAtMs: nowMs + RETENTION_MS,
  };
}

function publicClaim(
  action: VivoAsrTaskClaimAction,
  state: StoredTask,
  leaseToken: string | null = null,
  fallbackReason: string | null = null
): VivoAsrTaskClaim {
  if (!state.requestId || !state.sessionId) {
    throw new Error(
      "Vivo ASR task is missing its durable request identity"
    );
  }
  return {
    action,
    leaseToken,
    requestId: state.requestId,
    sessionId: state.sessionId,
    taskId: state.taskId,
    resultJson:
      action === "ready" && state.resultJson !== null
        ? cloneJson(state.resultJson)
        : action === "ready"
          ? null
          : null,
    lastErrorReason: state.lastErrorReason ?? fallbackReason,
  };
}

function passiveClaim(state: StoredTask, nowMs: number) {
  if (state.status === "ready") {
    return publicClaim("ready", state);
  }
  if (state.status === "blocked") {
    return publicClaim(
      "blocked",
      state,
      null,
      "Vivo ASR task is blocked"
    );
  }
  if (state.status === "run-dispatching") {
    if ((state.leaseExpiresAtMs ?? 0) > nowMs) {
      return publicClaim("wait", state);
    }
    return publicClaim(
      "blocked",
      state,
      null,
      "Vivo ASR /run dispatch outcome is uncertain; automatic resubmission is blocked"
    );
  }
  if (state.status === "running") {
    if (!state.taskId) {
      return publicClaim(
        "blocked",
        state,
        null,
        "Vivo ASR running task is missing its provider task id"
      );
    }
    return publicClaim("wait", state);
  }
  if (state.status === "submitting") {
    if ((state.leaseExpiresAtMs ?? 0) > nowMs) {
      return publicClaim("wait", state);
    }
    if (state.attemptCount >= MAX_SUBMISSION_ATTEMPTS) {
      return publicClaim(
        "blocked",
        state,
        null,
        "Vivo ASR submission retry budget is exhausted"
      );
    }
    return publicClaim("wait", state);
  }
  if (
    ["waiting", "retryable"].includes(state.status) &&
    state.attemptCount >= MAX_SUBMISSION_ATTEMPTS
  ) {
    return publicClaim(
      "blocked",
      state,
      null,
      "Vivo ASR submission retry budget is exhausted"
    );
  }
  return publicClaim(
    "wait",
    state,
    null,
    "Vivo ASR task is waiting for another worker"
  );
}

/**
 * 单元测试和无数据库的本地开发使用内存实现。
 * 每个 claim 在同一事件循环内先更新 Map，再返回结果，从而保持并发租约唯一。
 */
export class MemoryVivoAsrTaskStore implements VivoAsrTaskStore {
  private readonly tasks = new Map<string, StoredTask>();

  private cleanupExpired(nowMs: number) {
    let removed = 0;
    for (const [key, task] of this.tasks) {
      if (task.expiresAtMs > nowMs) continue;
      this.tasks.delete(key);
      removed += 1;
      if (removed >= EXPIRED_CLEANUP_BATCH_SIZE) break;
    }
  }

  async claim(
    rawIdentity: VivoAsrTaskIdentity,
    operation: VivoAsrTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const identity = normalizeIdentity(rawIdentity);
    const key = buildTaskKey(identity);
    const nowMs = resolveNow(operation);
    this.cleanupExpired(nowMs);
    let state = this.tasks.get(key);
    if (!state || state.expiresAtMs <= nowMs) {
      state = newWaitingTask(nowMs);
      this.tasks.set(key, state);
    }

    if (state.status === "ready" || state.status === "blocked") {
      return passiveClaim(state, nowMs);
    }
    if (state.status === "run-dispatching") {
      return passiveClaim(state, nowMs);
    }
    if (state.status === "running") {
      if (!state.taskId) return passiveClaim(state, nowMs);
      if ((state.leaseExpiresAtMs ?? 0) > nowMs) {
        return publicClaim("wait", state);
      }
      const leaseToken = randomUUID();
      state = {
        ...state,
        leaseToken,
        leaseExpiresAtMs: nowMs + LEASE_MS,
        expiresAtMs: nowMs + RETENTION_MS,
      };
      this.tasks.set(key, state);
      return publicClaim("resume", state, leaseToken);
    }

    const canSubmit =
      ["waiting", "retryable"].includes(state.status) ||
      (state.status === "submitting" &&
        (state.leaseExpiresAtMs ?? 0) <= nowMs);
    if (
      canSubmit &&
      state.attemptCount < MAX_SUBMISSION_ATTEMPTS
    ) {
      const leaseToken = randomUUID();
      state = {
        ...state,
        status: "submitting",
        leaseToken,
        leaseExpiresAtMs: nowMs + LEASE_MS,
        requestId: randomUUID(),
        sessionId: randomUUID(),
        taskId: null,
        attemptCount: state.attemptCount + 1,
        resultJson: null,
        lastErrorReason: null,
        expiresAtMs: nowMs + RETENTION_MS,
      };
      this.tasks.set(key, state);
      return publicClaim("submit", state, leaseToken);
    }
    return passiveClaim(state, nowMs);
  }

  async markRunDispatching(
    identity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    operation: VivoAsrTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = buildTaskKey(identity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const nowMs = resolveNow(operation);
    const current = this.tasks.get(key);
    if (!current || current.expiresAtMs <= nowMs) return false;
    if (
      current.status === "run-dispatching" &&
      current.leaseToken === leaseToken
    ) {
      return true;
    }
    if (
      current.status !== "submitting" ||
      current.leaseToken !== leaseToken
    ) {
      return false;
    }
    this.tasks.set(key, {
      ...current,
      status: "run-dispatching",
      leaseExpiresAtMs: nowMs + LEASE_MS,
      lastErrorReason: null,
      expiresAtMs: nowMs + RETENTION_MS,
    });
    return true;
  }

  async markRunning(
    identity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    rawTaskId: string,
    operation: VivoAsrTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = buildTaskKey(identity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const taskId = normalizeTaskId(rawTaskId);
    const nowMs = resolveNow(operation);
    const current = this.tasks.get(key);
    if (!current || current.expiresAtMs <= nowMs) return false;
    if (
      (current.status === "running" ||
        current.status === "ready") &&
      current.taskId === taskId
    ) {
      return true;
    }
    if (
      current.status !== "run-dispatching" ||
      current.leaseToken !== leaseToken ||
      (current.taskId !== null && current.taskId !== taskId)
    ) {
      return false;
    }
    this.tasks.set(key, {
      ...current,
      status: "running",
      taskId,
      leaseExpiresAtMs: nowMs + LEASE_MS,
      lastErrorReason: null,
      expiresAtMs: nowMs + RETENTION_MS,
    });
    return true;
  }

  async markPending(
    identity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    rawTaskId: string,
    reason: string,
    operation: VivoAsrTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = buildTaskKey(identity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const taskId = normalizeTaskId(rawTaskId);
    const nowMs = resolveNow(operation);
    const current = this.tasks.get(key);
    if (!current || current.expiresAtMs <= nowMs) return false;
    if (
      current.status === "running" &&
      current.taskId === taskId &&
      current.leaseToken === null
    ) {
      return true;
    }
    if (
      !["run-dispatching", "running"].includes(current.status) ||
      current.leaseToken !== leaseToken ||
      (current.taskId !== null && current.taskId !== taskId)
    ) {
      return false;
    }
    this.tasks.set(key, {
      ...current,
      status: "running",
      taskId,
      leaseToken: null,
      leaseExpiresAtMs: null,
      lastErrorReason: safeReason(reason),
      expiresAtMs: nowMs + RETENTION_MS,
    });
    return true;
  }

  async markReady(
    identity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    rawTaskId: string,
    resultJson: unknown,
    operation: VivoAsrTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = buildTaskKey(identity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const taskId = normalizeTaskId(rawTaskId);
    const normalizedResult = cloneJson(resultJson);
    const nowMs = resolveNow(operation);
    const current = this.tasks.get(key);
    if (!current || current.expiresAtMs <= nowMs) return false;
    if (current.status === "ready" && current.taskId === taskId) {
      return true;
    }
    if (
      !["run-dispatching", "running"].includes(current.status) ||
      current.leaseToken !== leaseToken ||
      (current.taskId !== null && current.taskId !== taskId)
    ) {
      return false;
    }
    this.tasks.set(key, {
      ...current,
      status: "ready",
      taskId,
      leaseToken: null,
      leaseExpiresAtMs: null,
      resultJson: normalizedResult,
      lastErrorReason: null,
      expiresAtMs: nowMs + RETENTION_MS,
    });
    return true;
  }

  async markRetryable(
    identity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    reason: string,
    operation: VivoAsrTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = buildTaskKey(identity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const nowMs = resolveNow(operation);
    const current = this.tasks.get(key);
    if (!current || current.expiresAtMs <= nowMs) return false;
    if (
      ["retryable", "blocked"].includes(current.status) &&
      current.leaseToken === null
    ) {
      return true;
    }
    if (
      current.status !== "submitting" ||
      current.leaseToken !== leaseToken
    ) {
      return false;
    }
    this.tasks.set(key, {
      ...current,
      status:
        current.attemptCount < MAX_SUBMISSION_ATTEMPTS
          ? "retryable"
          : "blocked",
      leaseToken: null,
      leaseExpiresAtMs: null,
      lastErrorReason: safeReason(reason),
      expiresAtMs: nowMs + RETENTION_MS,
    });
    return true;
  }

  async markBlocked(
    identity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    reason: string,
    operation: VivoAsrTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = buildTaskKey(identity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const nowMs = resolveNow(operation);
    const current = this.tasks.get(key);
    if (!current || current.expiresAtMs <= nowMs) return false;
    if (current.status === "blocked" && current.leaseToken === null) {
      return true;
    }
    if (
      !["submitting", "run-dispatching", "running"].includes(
        current.status
      ) ||
      current.leaseToken !== leaseToken
    ) {
      return false;
    }
    this.tasks.set(key, {
      ...current,
      status: "blocked",
      leaseToken: null,
      leaseExpiresAtMs: null,
      lastErrorReason: safeReason(reason),
      expiresAtMs: nowMs + RETENTION_MS,
    });
    return true;
  }
}

function resolveQueryTimeoutMs(operation: VivoAsrTaskOperation) {
  assertOperationActive(operation);
  const remainingMs = Math.floor(
    (operation.deadlineAtMs ?? Date.now()) - Date.now()
  );
  return Math.max(
    1,
    Math.min(DEFAULT_DATABASE_BUDGET_MS, remainingMs)
  );
}

async function waitForPromiseWithDeadline<T>(
  pending: Promise<T>,
  operation: VivoAsrTaskOperation
) {
  assertOperationActive(operation);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error("Vivo ASR task database deadline exhausted")
        ),
      resolveQueryTimeoutMs(operation)
    );
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function acquireConnection(
  pool: Pool,
  operation: VivoAsrTaskOperation
) {
  const pending = pool.getConnection();
  try {
    return await waitForPromiseWithDeadline(pending, operation);
  } catch (error) {
    // 连接可能在超时后才从池中取出，届时立即归还，避免泄漏连接槽位。
    void pending.then(
      (connection) => connection.release(),
      () => undefined
    );
    throw error;
  }
}

function destroyConnection(
  connection: PoolConnection,
  lifecycle: ConnectionLifecycle
) {
  if (lifecycle.destroyed) return;
  lifecycle.destroyed = true;
  connection.destroy();
}

async function executeOnConnectionWithBudget(
  connection: PoolConnection,
  lifecycle: ConnectionLifecycle,
  sql: string,
  values: SqlValue[],
  operation: VivoAsrTaskOperation
) {
  const timeoutMs = resolveQueryTimeoutMs(operation);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    destroyConnection(connection, lifecycle);
  }, timeoutMs);
  try {
    return await connection.execute(
      { sql, timeout: timeoutMs },
      values
    );
  } catch (error) {
    if (timedOut || (operation.deadlineAtMs ?? 0) <= Date.now()) {
      throw new Error("Vivo ASR task database deadline exhausted");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function executeWithBudget(
  pool: Pool,
  sql: string,
  values: SqlValue[],
  operation: VivoAsrTaskOperation
) {
  const connection = await acquireConnection(pool, operation);
  const lifecycle: ConnectionLifecycle = { destroyed: false };
  try {
    return await executeOnConnectionWithBudget(
      connection,
      lifecycle,
      sql,
      values,
      operation
    );
  } finally {
    if (!lifecycle.destroyed) connection.release();
  }
}

/**
 * 生产实现通过条件 UPDATE 竞争租约，不依赖单实例内存。
 * 每个公开方法共享一个截止时间，连接获取、DDL、写入和读回都消耗同一预算。
 */
export class DatabaseVivoAsrTaskStore implements VivoAsrTaskStore {
  private tableReady = false;
  private tableReadyPromise?: Promise<void>;

  constructor(private readonly pool: Pool = getDatabasePool()) {}

  private async ensureTable(operation: VivoAsrTaskOperation) {
    if (this.tableReady) return;
    if (!this.tableReadyPromise) {
      this.tableReadyPromise = executeWithBudget(
        this.pool,
        `
          create table if not exists vivo_asr_tasks (
            task_key char(64) character set ascii collate ascii_bin
              not null,
            institution_id varchar(191) not null,
            actor_user_id varchar(191) not null,
            provider_model varchar(191) not null,
            audio_digest char(64) character set ascii collate ascii_bin
              not null,
            mime_type varchar(127) not null,
            request_id char(36) character set ascii collate ascii_bin
              null,
            session_id char(36) character set ascii collate ascii_bin
              null,
            task_id varchar(191) null,
            status varchar(32) not null,
            attempt_count tinyint unsigned not null default 0,
            lease_token char(36) character set ascii collate ascii_bin
              null,
            lease_expires_at datetime(3) null,
            result_json json null,
            last_error_reason varchar(500) null,
            expires_at datetime(3) not null,
            created_at timestamp(3) not null default current_timestamp(3),
            updated_at timestamp(3) not null default current_timestamp(3)
              on update current_timestamp(3),
            primary key (task_key),
            key idx_vivo_asr_task_scope (
              institution_id, actor_user_id
            ),
            key idx_vivo_asr_task_due (
              status, lease_expires_at
            ),
            key idx_vivo_asr_task_expiry (expires_at)
          ) engine=InnoDB
            default charset=utf8mb4 collate=utf8mb4_unicode_ci
        `,
        [],
        operation
      )
        .then(() => {
          this.tableReady = true;
        })
        .catch((error) => {
          this.tableReadyPromise = undefined;
          throw error;
        });
    }
    await waitForPromiseWithDeadline(
      this.tableReadyPromise,
      operation
    );
  }

  private async ensureFreshRow(
    identity: VivoAsrTaskIdentity,
    nowMs: number,
    operation: VivoAsrTaskOperation
  ) {
    const key = buildTaskKey(identity);
    const expiresAt = new Date(nowMs + RETENTION_MS);
    await executeWithBudget(
      this.pool,
      `
        insert ignore into vivo_asr_tasks (
          task_key,
          institution_id,
          actor_user_id,
          provider_model,
          audio_digest,
          mime_type,
          status,
          attempt_count,
          expires_at
        )
        values (?, ?, ?, ?, ?, ?, 'waiting', 0, ?)
      `,
      [
        key,
        identity.institutionId,
        identity.userId,
        identity.providerModel,
        identity.audioDigest,
        identity.mimeType,
        expiresAt,
      ],
      operation
    );

    // 过期任务按同一 task_key 原位重建；旧租约令牌同时清空，迟到请求无法污染新任务。
    await executeWithBudget(
      this.pool,
      `
        update vivo_asr_tasks
        set
          institution_id = ?,
          actor_user_id = ?,
          provider_model = ?,
          audio_digest = ?,
          mime_type = ?,
          request_id = null,
          session_id = null,
          task_id = null,
          status = 'waiting',
          attempt_count = 0,
          lease_token = null,
          lease_expires_at = null,
          result_json = null,
          last_error_reason = null,
          expires_at = ?,
          created_at = ?
        where task_key = ?
          and expires_at <= ?
      `,
      [
        identity.institutionId,
        identity.userId,
        identity.providerModel,
        identity.audioDigest,
        identity.mimeType,
        expiresAt,
        new Date(nowMs),
        key,
        new Date(nowMs),
      ],
      operation
    );
  }

  private async cleanupExpired(
    nowMs: number,
    operation: VivoAsrTaskOperation
  ) {
    // 每次 claim 最多清理 100 行，既兑现 24 小时保留边界，也避免清理放大请求延迟。
    await executeWithBudget(
      this.pool,
      `
        delete from vivo_asr_tasks
        where expires_at <= ?
        order by expires_at
        limit 100
      `,
      [new Date(nowMs)],
      operation
    );
  }

  private async read(
    identity: VivoAsrTaskIdentity,
    operation: VivoAsrTaskOperation
  ) {
    const [rows] = await executeWithBudget(
      this.pool,
      `
        select
          status,
          lease_token,
          lease_expires_at,
          request_id,
          session_id,
          task_id,
          attempt_count,
          result_json,
          last_error_reason,
          expires_at
        from vivo_asr_tasks
        where task_key = ?
        limit 1
      `,
      [buildTaskKey(identity)],
      operation
    );
    return parseStoredTask(rows);
  }

  private async updateWithReadback(
    identity: VivoAsrTaskIdentity,
    sql: string,
    values: SqlValue[],
    operation: VivoAsrTaskOperation,
    confirmsCommit: (state: StoredTask | null) => boolean
  ) {
    try {
      const [resultRaw] = await executeWithBudget(
        this.pool,
        sql,
        values,
        operation
      );
      if ((resultRaw as ResultSetHeader).affectedRows === 1) {
        return true;
      }
      return confirmsCommit(await this.read(identity, operation));
    } catch (error) {
      // 自提交 UPDATE 超时可能已在服务端落盘；剩余预算允许时以精确状态读回消除未知结果。
      try {
        if (confirmsCommit(await this.read(identity, operation))) {
          return true;
        }
      } catch {
        // 保留原始写入错误，调用方仍可通过下一次 claim 读取 taskId 恢复。
      }
      throw error;
    }
  }

  async claim(
    rawIdentity: VivoAsrTaskIdentity,
    rawOperation: VivoAsrTaskOperation = {}
  ) {
    const operation = withDefaultDatabaseDeadline(rawOperation);
    const identity = normalizeIdentity(rawIdentity);
    const key = buildTaskKey(identity);
    const nowMs = resolveNow(operation);
    const now = new Date(nowMs);
    await this.ensureTable(operation);
    await this.cleanupExpired(nowMs, operation);
    await this.ensureFreshRow(identity, nowMs, operation);

    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(nowMs + LEASE_MS);
    const expiresAt = new Date(nowMs + RETENTION_MS);

    const [resumeRaw] = await executeWithBudget(
      this.pool,
      `
        update vivo_asr_tasks
        set
          lease_token = ?,
          lease_expires_at = ?,
          expires_at = ?
        where task_key = ?
          and status = 'running'
          and task_id is not null
          and (lease_expires_at is null or lease_expires_at <= ?)
      `,
      [leaseToken, leaseExpiresAt, expiresAt, key, now],
      operation
    );
    if ((resumeRaw as ResultSetHeader).affectedRows === 1) {
      const state = await this.read(identity, operation);
      if (
        !state ||
        state.status !== "running" ||
        state.leaseToken !== leaseToken ||
        !state.taskId
      ) {
        throw new Error("Vivo ASR resume lease disappeared");
      }
      return publicClaim("resume", state, leaseToken);
    }

    const requestId = randomUUID();
    const sessionId = randomUUID();
    const [submitRaw] = await executeWithBudget(
      this.pool,
      `
        update vivo_asr_tasks
        set
          status = 'submitting',
          attempt_count = attempt_count + 1,
          request_id = ?,
          session_id = ?,
          task_id = null,
          lease_token = ?,
          lease_expires_at = ?,
          result_json = null,
          last_error_reason = null,
          expires_at = ?
        where task_key = ?
          and task_id is null
          and attempt_count < ?
          and (
            (
              status in ('waiting', 'retryable')
              and (
                lease_expires_at is null
                or lease_expires_at <= ?
              )
            )
            or (
              status = 'submitting'
              and (
                lease_expires_at is null
                or lease_expires_at <= ?
              )
            )
          )
      `,
      [
        requestId,
        sessionId,
        leaseToken,
        leaseExpiresAt,
        expiresAt,
        key,
        MAX_SUBMISSION_ATTEMPTS,
        now,
        now,
      ],
      operation
    );
    if ((submitRaw as ResultSetHeader).affectedRows === 1) {
      const state = await this.read(identity, operation);
      if (
        !state ||
        state.status !== "submitting" ||
        state.leaseToken !== leaseToken
      ) {
        throw new Error("Vivo ASR submission lease disappeared");
      }
      return publicClaim("submit", state, leaseToken);
    }

    const state = await this.read(identity, operation);
    if (!state) {
      throw new Error("Vivo ASR task reservation disappeared");
    }
    return passiveClaim(state, nowMs);
  }

  async markRunDispatching(
    rawIdentity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    rawOperation: VivoAsrTaskOperation = {}
  ) {
    const operation = withDefaultDatabaseDeadline(rawOperation);
    const identity = normalizeIdentity(rawIdentity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const nowMs = resolveNow(operation);
    await this.ensureTable(operation);
    return this.updateWithReadback(
      identity,
      `
        update vivo_asr_tasks
        set
          status = 'run-dispatching',
          lease_expires_at = ?,
          last_error_reason = null,
          expires_at = ?
        where task_key = ?
          and status = 'submitting'
          and lease_token = ?
          and expires_at > ?
      `,
      [
        new Date(nowMs + LEASE_MS),
        new Date(nowMs + RETENTION_MS),
        buildTaskKey(identity),
        leaseToken,
        new Date(nowMs),
      ],
      operation,
      (state) =>
        state?.status === "run-dispatching" &&
        state.leaseToken === leaseToken
    );
  }

  async markRunning(
    rawIdentity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    rawTaskId: string,
    rawOperation: VivoAsrTaskOperation = {}
  ) {
    const operation = withDefaultDatabaseDeadline(rawOperation);
    const identity = normalizeIdentity(rawIdentity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const taskId = normalizeTaskId(rawTaskId);
    const nowMs = resolveNow(operation);
    await this.ensureTable(operation);
    return this.updateWithReadback(
      identity,
      `
        update vivo_asr_tasks
        set
          status = 'running',
          task_id = ?,
          lease_expires_at = ?,
          last_error_reason = null,
          expires_at = ?
        where task_key = ?
          and status in ('run-dispatching', 'running')
          and lease_token = ?
          and (task_id is null or task_id = ?)
          and expires_at > ?
      `,
      [
        taskId,
        new Date(nowMs + LEASE_MS),
        new Date(nowMs + RETENTION_MS),
        buildTaskKey(identity),
        leaseToken,
        taskId,
        new Date(nowMs),
      ],
      operation,
      (state) =>
        ["running", "ready"].includes(state?.status ?? "") &&
        state?.taskId === taskId
    );
  }

  async markPending(
    rawIdentity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    rawTaskId: string,
    reason: string,
    rawOperation: VivoAsrTaskOperation = {}
  ) {
    const operation = withDefaultDatabaseDeadline(rawOperation);
    const identity = normalizeIdentity(rawIdentity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const taskId = normalizeTaskId(rawTaskId);
    const normalizedReason = safeReason(reason);
    const nowMs = resolveNow(operation);
    await this.ensureTable(operation);
    return this.updateWithReadback(
      identity,
      `
        update vivo_asr_tasks
        set
          status = 'running',
          task_id = ?,
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = ?,
          expires_at = ?
        where task_key = ?
          and status in ('run-dispatching', 'running')
          and lease_token = ?
          and (task_id is null or task_id = ?)
          and expires_at > ?
      `,
      [
        taskId,
        normalizedReason,
        new Date(nowMs + RETENTION_MS),
        buildTaskKey(identity),
        leaseToken,
        taskId,
        new Date(nowMs),
      ],
      operation,
      (state) =>
        state?.status === "running" &&
        state.taskId === taskId &&
        state.leaseToken === null
    );
  }

  async markReady(
    rawIdentity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    rawTaskId: string,
    resultJson: unknown,
    rawOperation: VivoAsrTaskOperation = {}
  ) {
    const operation = withDefaultDatabaseDeadline(rawOperation);
    const identity = normalizeIdentity(rawIdentity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const taskId = normalizeTaskId(rawTaskId);
    const serializedResult = serializeResultJson(resultJson);
    const nowMs = resolveNow(operation);
    await this.ensureTable(operation);
    return this.updateWithReadback(
      identity,
      `
        update vivo_asr_tasks
        set
          status = 'ready',
          task_id = ?,
          result_json = ?,
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = null,
          expires_at = ?
        where task_key = ?
          and status in ('run-dispatching', 'running')
          and lease_token = ?
          and (task_id is null or task_id = ?)
          and expires_at > ?
      `,
      [
        taskId,
        serializedResult,
        new Date(nowMs + RETENTION_MS),
        buildTaskKey(identity),
        leaseToken,
        taskId,
        new Date(nowMs),
      ],
      operation,
      (state) =>
        state?.status === "ready" && state.taskId === taskId
    );
  }

  async markRetryable(
    rawIdentity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    reason: string,
    rawOperation: VivoAsrTaskOperation = {}
  ) {
    const operation = withDefaultDatabaseDeadline(rawOperation);
    const identity = normalizeIdentity(rawIdentity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const normalizedReason = safeReason(reason);
    const nowMs = resolveNow(operation);
    await this.ensureTable(operation);
    return this.updateWithReadback(
      identity,
      `
        update vivo_asr_tasks
        set
          status = if(
            attempt_count < ?,
            'retryable',
            'blocked'
          ),
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = ?,
          expires_at = ?
        where task_key = ?
          and status = 'submitting'
          and lease_token = ?
          and task_id is null
          and expires_at > ?
      `,
      [
        MAX_SUBMISSION_ATTEMPTS,
        normalizedReason,
        new Date(nowMs + RETENTION_MS),
        buildTaskKey(identity),
        leaseToken,
        new Date(nowMs),
      ],
      operation,
      (state) =>
        ["retryable", "blocked"].includes(state?.status ?? "") &&
        state?.leaseToken === null
    );
  }

  async markBlocked(
    rawIdentity: VivoAsrTaskIdentity,
    rawLeaseToken: string,
    reason: string,
    rawOperation: VivoAsrTaskOperation = {}
  ) {
    const operation = withDefaultDatabaseDeadline(rawOperation);
    const identity = normalizeIdentity(rawIdentity);
    const leaseToken = normalizeLeaseToken(rawLeaseToken);
    const normalizedReason = safeReason(reason);
    const nowMs = resolveNow(operation);
    await this.ensureTable(operation);
    return this.updateWithReadback(
      identity,
      `
        update vivo_asr_tasks
        set
          status = 'blocked',
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = ?,
          expires_at = ?
        where task_key = ?
          and status in (
            'submitting',
            'run-dispatching',
            'running'
          )
          and lease_token = ?
          and expires_at > ?
      `,
      [
        normalizedReason,
        new Date(nowMs + RETENTION_MS),
        buildTaskKey(identity),
        leaseToken,
        new Date(nowMs),
      ],
      operation,
      (state) =>
        state?.status === "blocked" &&
        state.leaseToken === null
    );
  }
}

type VivoAsrTaskGlobals = typeof globalThis & {
  __vivoAsrTaskMemoryStore?: MemoryVivoAsrTaskStore;
  __vivoAsrTaskDatabaseStore?: DatabaseVivoAsrTaskStore;
  __vivoAsrTaskTestStore?: VivoAsrTaskStore;
};

/**
 * 有 DATABASE_URL 或生产运行时默认使用 MySQL；测试可通过 reset 注入独立内存实例。
 */
export function getVivoAsrTaskStore(): VivoAsrTaskStore {
  const globals = globalThis as VivoAsrTaskGlobals;
  if (globals.__vivoAsrTaskTestStore) {
    return globals.__vivoAsrTaskTestStore;
  }
  if (
    process.env.DATABASE_URL?.trim() ||
    process.env.NODE_ENV === "production"
  ) {
    globals.__vivoAsrTaskDatabaseStore ??=
      new DatabaseVivoAsrTaskStore();
    return globals.__vivoAsrTaskDatabaseStore;
  }
  globals.__vivoAsrTaskMemoryStore ??= new MemoryVivoAsrTaskStore();
  return globals.__vivoAsrTaskMemoryStore;
}

export function resetVivoAsrTaskStoreForTests(
  store: VivoAsrTaskStore = new MemoryVivoAsrTaskStore()
) {
  const globals = globalThis as VivoAsrTaskGlobals;
  globals.__vivoAsrTaskTestStore = store;
  globals.__vivoAsrTaskMemoryStore =
    store instanceof MemoryVivoAsrTaskStore ? store : undefined;
  globals.__vivoAsrTaskDatabaseStore = undefined;
  return store;
}
