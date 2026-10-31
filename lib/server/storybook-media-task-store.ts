import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
} from "mysql2/promise";

import { getDatabasePool } from "@/lib/db/server";
import { ApiRouteError } from "@/lib/server/api-errors";

const SUBMISSION_LEASE_MS = 60_000;
const POLL_LEASE_MS = 30_000;
const POLL_INTERVAL_MS = 3_000;
const DEFAULT_QUERY_TIMEOUT_MS = 5_000;
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]{8,160}$/u;
const MEDIA_KEY_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const CHANNEL_PROVIDER = {
  image: ["dashscope-qwen-image", "maas-z-image"],
  audio: ["vivo-story-tts", "maas-tts"],
} as const;
const MAX_ATTEMPTS = {
  image: 2,
  // provider 失败仍只调用一次；稳定 key 找回失败且媒体持久化瞬时失败时，最多再合成一次。
  audio: 2,
} as const;

export type StorybookMediaTaskChannel = keyof typeof CHANNEL_PROVIDER;

export function canRetryStorybookMediaSubmission(
  channel: StorybookMediaTaskChannel,
  attemptCount: number
) {
  return attemptCount < MAX_ATTEMPTS[channel];
}

export interface StorybookMediaTaskIdentity {
  institutionId: string;
  userId: string;
  childId: string;
  storybookId: string;
  sceneIndex: number;
  channel: StorybookMediaTaskChannel;
  provider: (typeof CHANNEL_PROVIDER)[StorybookMediaTaskChannel][number];
  providerModel: string;
  inputDigest: string;
}

export interface StorybookMediaTaskOperation {
  nowMs?: number;
  deadlineAtMs?: number;
  signal?: AbortSignal;
}

export type StorybookMediaTaskClaimAction =
  | "submit"
  | "wait"
  | "poll"
  | "ready"
  | "blocked";

export interface StorybookMediaTaskClaim {
  action: StorybookMediaTaskClaimAction;
  leaseToken: string | null;
  taskId: string | null;
  submittedAtMs: number | null;
  attemptCount: number;
  pollErrorCount: number;
  nextRetryAtMs: number | null;
  mediaKey: string | null;
  lastErrorReason: string | null;
}

/** 私有上游成果回执，只供媒体保存器读取，绝不混入公开claim/诊断响应。 */
export interface StorybookMediaProviderReceipt {
  version: 1;
  model: string;
  requestId: string | null;
  contentType: string;
  kind: "url" | "base64";
  data: string;
  receivedAtMs: number;
}
export type StorybookMediaReceiptClaim = { action: "none" | "wait" } | {
  action: "resume";
  leaseToken: string;
  receipt: StorybookMediaProviderReceipt;
};

export interface StorybookMediaTaskStore {
  /** 只读任务状态，不创建提交行、不领取租约，也不增加生成次数。 */
  inspect?(identity: StorybookMediaTaskIdentity, operation?: StorybookMediaTaskOperation): Promise<StorybookMediaTaskClaim | null>;
  saveProviderReceipt?(
    identity: StorybookMediaTaskIdentity, leaseToken: string, receipt: StorybookMediaProviderReceipt,
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  claimProviderReceipt?(
    identity: StorybookMediaTaskIdentity, operation?: StorybookMediaTaskOperation
  ): Promise<StorybookMediaReceiptClaim>;
  claim(
    identity: StorybookMediaTaskIdentity,
    operation?: StorybookMediaTaskOperation
  ): Promise<StorybookMediaTaskClaim>;
  markAsyncSubmitted(
    identity: StorybookMediaTaskIdentity,
    leaseToken: string,
    taskId: string,
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  markSubmissionFailure(
    identity: StorybookMediaTaskIdentity,
    leaseToken: string,
    input: {
      retryable: boolean;
      nextRetryAtMs: number;
      reason: string;
    },
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  retryBlockedSubmission?(
    identity: StorybookMediaTaskIdentity,
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  markPending(
    identity: StorybookMediaTaskIdentity,
    taskId: string,
    leaseToken: string,
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  markPollFailure(
    identity: StorybookMediaTaskIdentity,
    taskId: string,
    leaseToken: string,
    input: {
      terminalTask: boolean;
      retryableSubmission: boolean;
      blockTask?: boolean;
      nextRetryAtMs: number;
      reason: string;
    },
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  markReady(
    identity: StorybookMediaTaskIdentity,
    input: {
      leaseToken: string;
      taskId?: string | null;
      mediaKey: string;
    },
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  recoverReadyAudio(
    identity: StorybookMediaTaskIdentity,
    mediaKey: string,
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
  invalidateReadyMedia(
    identity: StorybookMediaTaskIdentity,
    mediaKey: string,
    reason: string,
    operation?: StorybookMediaTaskOperation
  ): Promise<boolean>;
}

type StoredTask = {
  status: string;
  leaseToken: string | null;
  leaseExpiresAtMs: number | null;
  taskId: string | null;
  submittedAtMs: number | null;
  attemptCount: number;
  pollErrorCount: number;
  nextRetryAtMs: number | null;
  mediaKey: string | null;
  lastErrorReason: string | null;
};

type StorybookMediaTaskRow = {
  status: string;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
  task_id: string | null;
  submitted_at: Date | string | null;
  attempt_count: number;
  poll_error_count: number;
  next_retry_at: Date | string | null;
  media_key: string | null;
  last_error_reason: string | null;
};

type SqlValue = string | number | Date | Buffer | null;
type ConnectionLifecycle = {
  destroyed: boolean;
};

function safeIdentifier(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 191) {
    throw new Error(`${field} is required and must not exceed 191 characters`);
  }
  return normalized;
}

function safeErrorReason(value: string) {
  return value.replace(/\s+/gu, " ").trim().slice(0, 500);
}

function normalizeIdentity(identity: StorybookMediaTaskIdentity) {
  const sceneIndex = Number(identity.sceneIndex);
  if (!Number.isInteger(sceneIndex) || sceneIndex < 1 || sceneIndex > 32) {
    throw new Error("sceneIndex must be an integer between 1 and 32");
  }
  const inputDigest = identity.inputDigest.trim().toLowerCase();
  if (!DIGEST_PATTERN.test(inputDigest)) {
    throw new Error("inputDigest must be a SHA-256 hex digest");
  }
  if (!(CHANNEL_PROVIDER[identity.channel] as readonly string[]).includes(identity.provider)) {
    throw new Error("storybook media channel and provider do not match");
  }
  return {
    institutionId: safeIdentifier(identity.institutionId, "institutionId"),
    userId: safeIdentifier(identity.userId, "userId"),
    childId: safeIdentifier(identity.childId, "childId"),
    storybookId: safeIdentifier(identity.storybookId, "storybookId"),
    sceneIndex,
    channel: identity.channel,
    provider: identity.provider,
    providerModel: safeIdentifier(
      identity.providerModel,
      "providerModel"
    ),
    inputDigest,
  } satisfies StorybookMediaTaskIdentity;
}

function taskKey(identity: StorybookMediaTaskIdentity) {
  const value = normalizeIdentity(identity);
  return createHash("sha256")
    .update(
      [
        value.institutionId,
        value.childId,
        value.storybookId,
        String(value.sceneIndex),
        value.channel,
        value.provider,
        value.providerModel,
        value.inputDigest,
      ].join("\u001f"),
      "utf8"
    )
    .digest("hex");
}

function normalizeTaskId(value: string) {
  const taskId = value.trim();
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new Error("storybook media task id is invalid");
  }
  return taskId;
}

function normalizeMediaKey(value: string) {
  const mediaKey = value.trim().toLowerCase();
  if (!MEDIA_KEY_PATTERN.test(mediaKey)) {
    throw new Error("storybook media key is invalid");
  }
  return mediaKey;
}

function normalizeProviderReceipt(identity: StorybookMediaTaskIdentity, receipt: StorybookMediaProviderReceipt): StorybookMediaProviderReceipt {
  if (!["maas-z-image", "maas-tts"].includes(identity.provider) || receipt.version !== 1 || receipt.model !== identity.providerModel ||
      !Number.isFinite(receipt.receivedAtMs) || !["url", "base64"].includes(receipt.kind) || typeof receipt.data !== "string" || !receipt.data.length ||
      !receipt.contentType.startsWith(`${identity.channel}/`)) throw new Error("Invalid private storybook provider receipt");
  const max = identity.channel === "image" ? 16 * 1024 * 1024 : 12 * 1024 * 1024;
  if (receipt.kind === "base64" && (receipt.data.length > Math.ceil(max / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(receipt.data))) throw new Error("Private storybook provider receipt exceeds limit or has invalid bytes");
  if (receipt.kind === "url") {
    let url: URL; try { url = new URL(receipt.data); } catch { throw new Error("Invalid private storybook provider receipt URL"); }
    if (receipt.data.length > 16000 || !["http:", "https:"].includes(url.protocol) || !url.hostname.endsWith(".aliyuncs.com") || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Unsafe private storybook provider receipt URL");
  }
  return { version: 1, model: receipt.model, requestId: typeof receipt.requestId === "string" ? receipt.requestId.slice(0, 191) : null,
    contentType: receipt.contentType.slice(0, 128), kind: receipt.kind, data: receipt.data, receivedAtMs: receipt.receivedAtMs };
}

function asEpochMs(value: Date | string | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStoredTask(rows: unknown): StoredTask | null {
  const row = Array.isArray(rows)
    ? (rows[0] as StorybookMediaTaskRow | undefined)
    : undefined;
  if (!row) return null;
  return {
    status: row.status,
    leaseToken: row.lease_token,
    leaseExpiresAtMs: asEpochMs(row.lease_expires_at),
    taskId: row.task_id,
    submittedAtMs: asEpochMs(row.submitted_at),
    attemptCount: Number(row.attempt_count) || 0,
    pollErrorCount: Number(row.poll_error_count) || 0,
    nextRetryAtMs: asEpochMs(row.next_retry_at),
    mediaKey: row.media_key,
    lastErrorReason: row.last_error_reason,
  };
}

function emptyStoredTask(): StoredTask {
  return {
    status: "waiting",
    leaseToken: null,
    leaseExpiresAtMs: null,
    taskId: null,
    submittedAtMs: null,
    attemptCount: 0,
    pollErrorCount: 0,
    nextRetryAtMs: null,
    mediaKey: null,
    lastErrorReason: null,
  };
}

function claimFromState(
  identity: StorybookMediaTaskIdentity,
  state: StoredTask,
  nowMs: number
): StorybookMediaTaskClaim {
  if (state.mediaKey && state.status === "ready") {
    return {
      action: "ready",
      leaseToken: null,
      taskId: state.taskId,
      submittedAtMs: state.submittedAtMs,
      attemptCount: state.attemptCount,
      pollErrorCount: state.pollErrorCount,
      nextRetryAtMs: null,
      mediaKey: state.mediaKey,
      lastErrorReason: state.lastErrorReason,
    };
  }
  if (
    state.status === "blocked" ||
    (state.status === "submitting" &&
      (state.leaseExpiresAtMs ?? 0) <= nowMs) ||
    (state.status !== "submitting" &&
      !state.taskId &&
      state.attemptCount >= MAX_ATTEMPTS[identity.channel])
  ) {
    return {
      action: "blocked",
      leaseToken: null,
      taskId: state.taskId,
      submittedAtMs: state.submittedAtMs,
      attemptCount: state.attemptCount,
      pollErrorCount: state.pollErrorCount,
      nextRetryAtMs: null,
      mediaKey: null,
      lastErrorReason:
        state.lastErrorReason ??
        "storybook media provider outcome is uncertain or retry budget is exhausted",
    };
  }
  return {
    action: "wait",
    leaseToken: null,
    taskId: state.taskId,
    submittedAtMs: state.submittedAtMs,
    attemptCount: state.attemptCount,
    pollErrorCount: state.pollErrorCount,
    nextRetryAtMs: state.nextRetryAtMs,
    mediaKey: null,
    lastErrorReason: state.lastErrorReason,
  };
}

function resolveNow(operation?: StorybookMediaTaskOperation) {
  return operation?.nowMs ?? Date.now();
}

function assertOperationActive(operation?: StorybookMediaTaskOperation) {
  if (operation?.signal?.aborted) {
    throw new Error("storybook media task database operation aborted");
  }
  if (
    typeof operation?.deadlineAtMs === "number" &&
    operation.deadlineAtMs <= Date.now()
  ) {
    throw new Error("storybook media task database deadline exhausted");
  }
}

function resolveQueryTimeoutMs(operation?: StorybookMediaTaskOperation) {
  assertOperationActive(operation);
  const remainingMs = operation?.deadlineAtMs
    ? Math.floor(operation.deadlineAtMs - Date.now())
    : DEFAULT_QUERY_TIMEOUT_MS;
  return Math.max(1, Math.min(DEFAULT_QUERY_TIMEOUT_MS, remainingMs));
}

async function acquireConnection(
  pool: Pool,
  operation?: StorybookMediaTaskOperation
) {
  assertOperationActive(operation);
  const pending = pool.getConnection();
  if (!operation?.signal && !operation?.deadlineAtMs) return pending;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortRequest: (() => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => {
    const rejectCancelled = () => {
      reject(
        new Error(
          operation.signal?.aborted
            ? "storybook media task database operation aborted"
            : "storybook media task database deadline exhausted"
        )
      );
    };
    if (operation.signal) {
      abortRequest = rejectCancelled;
      operation.signal.addEventListener("abort", abortRequest, {
        once: true,
      });
      if (operation.signal.aborted) rejectCancelled();
    }
    if (operation.deadlineAtMs) {
      timer = setTimeout(
        rejectCancelled,
        Math.max(1, operation.deadlineAtMs - Date.now())
      );
    }
  });
  try {
    return await Promise.race([pending, cancellation]);
  } catch (error) {
    void pending.then(
      (connection) => connection.release(),
      () => undefined
    );
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (abortRequest) {
      operation.signal?.removeEventListener("abort", abortRequest);
    }
  }
}

async function executeWithBudget(
  pool: Pool,
  sql: string,
  values: SqlValue[] = [],
  operation?: StorybookMediaTaskOperation
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
  values: SqlValue[] = [],
  operation?: StorybookMediaTaskOperation,
  protocol: "execute" | "query" = "execute"
) {
  assertOperationActive(operation);
  const timeoutMs = resolveQueryTimeoutMs(operation);
  let cancellationReason: "aborted" | "timed-out" | null = null;
  const abortRequest = () => {
    cancellationReason = "aborted";
    destroyConnection(connection, lifecycle);
  };
  const timeoutRequest = () => {
    cancellationReason = "timed-out";
    destroyConnection(connection, lifecycle);
  };
  operation?.signal?.addEventListener("abort", abortRequest, { once: true });
  if (operation?.signal?.aborted) abortRequest();
  const timer = setTimeout(timeoutRequest, timeoutMs);
  try {
    if (protocol === "query") {
      return await connection.query(
        { sql, timeout: timeoutMs },
        values
      );
    }
    return await connection.execute({ sql, timeout: timeoutMs }, values);
  } catch (error) {
    if (cancellationReason || operation?.signal?.aborted) {
      throw new Error(
        cancellationReason === "aborted" || operation?.signal?.aborted
          ? "storybook media task database operation aborted"
          : "storybook media task database query timed out"
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    operation?.signal?.removeEventListener("abort", abortRequest);
  }
}

async function runInTransaction<T>(
  pool: Pool,
  operation: StorybookMediaTaskOperation | undefined,
  work: (
    connection: PoolConnection,
    lifecycle: ConnectionLifecycle
  ) => Promise<T>
) {
  const connection = await acquireConnection(pool, operation);
  const lifecycle: ConnectionLifecycle = { destroyed: false };
  let transactionOpen = false;
  try {
    await executeOnConnectionWithBudget(
      connection,
      lifecycle,
      "start transaction",
      [],
      operation,
      "query"
    );
    transactionOpen = true;
    const result = await work(connection, lifecycle);
    await executeOnConnectionWithBudget(
      connection,
      lifecycle,
      "commit",
      [],
      operation,
      "query"
    );
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen && !lifecycle.destroyed) {
      try {
        // 即使原请求已取消，也给回滚一个独立的短截止时间，避免把未完成事务放回连接池。
        await executeOnConnectionWithBudget(
          connection,
          lifecycle,
          "rollback",
          [],
          { deadlineAtMs: Date.now() + 1_000 },
          "query"
        );
      } catch {
        destroyConnection(connection, lifecycle);
      }
    }
    throw error;
  } finally {
    if (!lifecycle.destroyed) connection.release();
  }
}

/**
 * 本地与单元测试使用原子内存账本；生产环境必须切换到 MySQL 实现。
 */
export class InMemoryStorybookMediaTaskStore
  implements StorybookMediaTaskStore
{
  private readonly tasks = new Map<string, StoredTask>();
  private readonly providerReceipts = new Map<string, StorybookMediaProviderReceipt>();

  async inspect(identity: StorybookMediaTaskIdentity, operation: StorybookMediaTaskOperation = {}) {
    assertOperationActive(operation);
    const state = this.tasks.get(taskKey(identity));
    return state ? claimFromState(identity, state, resolveNow(operation)) : null;
  }

  async saveProviderReceipt(identity: StorybookMediaTaskIdentity, leaseToken: string, rawReceipt: StorybookMediaProviderReceipt, operation: StorybookMediaTaskOperation = {}) {
    assertOperationActive(operation);
    const key = taskKey(identity), state = this.tasks.get(key), receipt = normalizeProviderReceipt(identity, rawReceipt);
    if (!state || state.status !== "submitting" || state.taskId || state.leaseToken !== leaseToken || this.providerReceipts.has(key)) return false;
    this.providerReceipts.set(key, structuredClone(receipt));
    return true;
  }

  async claimProviderReceipt(identity: StorybookMediaTaskIdentity, operation: StorybookMediaTaskOperation = {}): Promise<StorybookMediaReceiptClaim> {
    assertOperationActive(operation);
    const key = taskKey(identity), receipt = this.providerReceipts.get(key), state = this.tasks.get(key), nowMs = resolveNow(operation);
    if (!receipt || !state || state.mediaKey) return { action: "none" };
    if ((state.leaseExpiresAtMs ?? 0) > nowMs || !["submitting", "blocked", "retryable"].includes(state.status)) return { action: "wait" };
    const leaseToken = randomUUID();
    // 已有上游成果只领取下载/保存租约，不增加生成attempt，也不把无回执unknown改成可重试。
    this.tasks.set(key, { ...state, status: "submitting", leaseToken, leaseExpiresAtMs: nowMs + SUBMISSION_LEASE_MS });
    return { action: "resume", leaseToken, receipt: structuredClone(normalizeProviderReceipt(identity, receipt)) };
  }

  async claim(
    rawIdentity: StorybookMediaTaskIdentity,
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const identity = normalizeIdentity(rawIdentity);
    const key = taskKey(identity);
    const nowMs = resolveNow(operation);
    const state = this.tasks.get(key) ?? emptyStoredTask();

    if (state.mediaKey || state.status === "blocked") {
      return claimFromState(identity, state, nowMs);
    }
    if (
      state.taskId &&
      (state.nextRetryAtMs ?? 0) <= nowMs &&
      (state.leaseExpiresAtMs ?? 0) <= nowMs
    ) {
      const leaseToken = randomUUID();
      const next = {
        ...state,
        status: "polling",
        leaseToken,
        leaseExpiresAtMs: nowMs + POLL_LEASE_MS,
        nextRetryAtMs: nowMs + POLL_INTERVAL_MS,
      };
      this.tasks.set(key, next);
      return {
        ...claimFromState(identity, next, nowMs),
        action: "poll" as const,
        leaseToken,
      };
    }
    if (
      !state.taskId &&
      ["waiting", "retryable"].includes(state.status) &&
      state.attemptCount < MAX_ATTEMPTS[identity.channel] &&
      (state.nextRetryAtMs ?? 0) <= nowMs &&
      (state.leaseExpiresAtMs ?? 0) <= nowMs
    ) {
      const leaseToken = randomUUID();
      const next = {
        ...state,
        status: "submitting",
        leaseToken,
        leaseExpiresAtMs: nowMs + SUBMISSION_LEASE_MS,
        attemptCount: state.attemptCount + 1,
        nextRetryAtMs: null,
      };
      this.tasks.set(key, next);
      return {
        ...claimFromState(identity, next, nowMs),
        action: "submit" as const,
        leaseToken,
      };
    }
    return claimFromState(identity, state, nowMs);
  }

  async markAsyncSubmitted(
    identity: StorybookMediaTaskIdentity,
    leaseToken: string,
    taskId: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    if (identity.channel !== "image") return false;
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    if (
      !current ||
      current.status !== "submitting" ||
      current.leaseToken !== leaseToken
    ) {
      return false;
    }
    const nowMs = resolveNow(operation);
    this.tasks.set(key, {
      ...current,
      status: "pending",
      leaseToken: null,
      leaseExpiresAtMs: null,
      taskId: normalizeTaskId(taskId),
      submittedAtMs: nowMs,
      pollErrorCount: 0,
      nextRetryAtMs: nowMs + POLL_INTERVAL_MS,
      lastErrorReason: null,
    });
    return true;
  }

  async markSubmissionFailure(
    identity: StorybookMediaTaskIdentity,
    leaseToken: string,
    input: {
      retryable: boolean;
      nextRetryAtMs: number;
      reason: string;
    },
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    if (
      !current ||
      current.status !== "submitting" ||
      current.leaseToken !== leaseToken ||
      current.taskId
    ) {
      return false;
    }
    const retryable =
      input.retryable &&
      canRetryStorybookMediaSubmission(
        identity.channel,
        current.attemptCount
      );
    this.tasks.set(key, {
      ...current,
      status: retryable ? "retryable" : "blocked",
      leaseToken: null,
      leaseExpiresAtMs: null,
      nextRetryAtMs: retryable ? input.nextRetryAtMs : null,
      lastErrorReason: safeErrorReason(input.reason),
    });
    return true;
  }

  async retryBlockedSubmission(
    identity: StorybookMediaTaskIdentity,
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    if (
      !current ||
      current.status !== "blocked" ||
      current.taskId ||
      !canRetryStorybookMediaSubmission(
        identity.channel,
        current.attemptCount
      )
    ) {
      return false;
    }
    const nowMs = resolveNow(operation);
    this.tasks.set(key, {
      ...current,
      status: "retryable",
      leaseToken: null,
      leaseExpiresAtMs: null,
      nextRetryAtMs: nowMs,
    });
    return true;
  }

  async markPending(
    identity: StorybookMediaTaskIdentity,
    taskId: string,
    leaseToken: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    if (
      !current ||
      current.status !== "polling" ||
      current.taskId !== normalizeTaskId(taskId) ||
      current.leaseToken !== leaseToken
    ) {
      return false;
    }
    const nowMs = resolveNow(operation);
    this.tasks.set(key, {
      ...current,
      status: "pending",
      leaseToken: null,
      leaseExpiresAtMs: null,
      pollErrorCount: 0,
      nextRetryAtMs: nowMs + POLL_INTERVAL_MS,
      lastErrorReason: null,
    });
    return true;
  }

  async markPollFailure(
    identity: StorybookMediaTaskIdentity,
    taskId: string,
    leaseToken: string,
    input: {
      terminalTask: boolean;
      retryableSubmission: boolean;
      blockTask?: boolean;
      nextRetryAtMs: number;
      reason: string;
    },
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    if (
      !current ||
      current.status !== "polling" ||
      current.taskId !== normalizeTaskId(taskId) ||
      current.leaseToken !== leaseToken
    ) {
      return false;
    }
    const retryable =
      !input.blockTask &&
      input.terminalTask &&
      input.retryableSubmission &&
      current.attemptCount < MAX_ATTEMPTS[identity.channel];
    this.tasks.set(key, {
      ...current,
      status: input.blockTask
        ? "blocked"
        : input.terminalTask
        ? retryable
          ? "retryable"
          : "blocked"
        : "poll-error",
      leaseToken: null,
      leaseExpiresAtMs: null,
      taskId: input.terminalTask ? null : current.taskId,
      submittedAtMs: input.terminalTask ? null : current.submittedAtMs,
      pollErrorCount: current.pollErrorCount + 1,
      nextRetryAtMs:
        input.blockTask
          ? null
          : !input.terminalTask || retryable
            ? input.nextRetryAtMs
            : null,
      lastErrorReason: safeErrorReason(input.reason),
    });
    return true;
  }

  async markReady(
    identity: StorybookMediaTaskIdentity,
    input: {
      leaseToken: string;
      taskId?: string | null;
      mediaKey: string;
    },
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    const taskMatches =
      identity.channel === "image" && identity.provider !== "maas-z-image"
        ? current?.status === "polling" &&
          current.taskId === normalizeTaskId(input.taskId ?? "")
        : current?.status === "submitting" && !current.taskId;
    if (
      !current ||
      !taskMatches ||
      current.leaseToken !== input.leaseToken
    ) {
      return false;
    }
    this.tasks.set(key, {
      ...current,
      status: "ready",
      leaseToken: null,
      leaseExpiresAtMs: null,
      pollErrorCount: 0,
      nextRetryAtMs: null,
      mediaKey: normalizeMediaKey(input.mediaKey),
      lastErrorReason: null,
    });
    return true;
  }

  async recoverReadyAudio(
    identity: StorybookMediaTaskIdentity,
    mediaKey: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    // MaaS 同步图片也需要在持久化成功、任务提交中断后用稳定 key 恢复，禁止再次生成。
    if (identity.channel !== "audio" && identity.provider !== "maas-z-image") return false;
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    if (
      !current ||
      current.taskId ||
      !["submitting", "blocked", "retryable", "ready"].includes(
        current.status
      )
    ) {
      return false;
    }
    const normalizedMediaKey = normalizeMediaKey(mediaKey);
    if (current.status === "ready" && current.mediaKey === normalizedMediaKey) {
      return true;
    }
    this.tasks.set(key, {
      ...current,
      status: "ready",
      leaseToken: null,
      leaseExpiresAtMs: null,
      pollErrorCount: 0,
      nextRetryAtMs: null,
      mediaKey: normalizedMediaKey,
      lastErrorReason: null,
    });
    return true;
  }

  async invalidateReadyMedia(
    identity: StorybookMediaTaskIdentity,
    mediaKey: string,
    reason: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    assertOperationActive(operation);
    const key = taskKey(identity);
    const current = this.tasks.get(key);
    if (
      !current ||
      current.status !== "ready" ||
      current.mediaKey !== normalizeMediaKey(mediaKey)
    ) {
      return false;
    }
    const canRecoverImage = identity.channel === "image" && current.taskId;
    this.tasks.set(key, {
      ...current,
      status: canRecoverImage ? "pending" : "blocked",
      mediaKey: null,
      nextRetryAtMs: canRecoverImage ? resolveNow(operation) : null,
      lastErrorReason: safeErrorReason(reason),
    });
    return true;
  }
}

export class DatabaseStorybookMediaTaskStore
  implements StorybookMediaTaskStore
{
  private tableReady?: Promise<void>;

  constructor(private readonly pool: Pool = getDatabasePool()) {}

  async inspect(identity: StorybookMediaTaskIdentity, operation: StorybookMediaTaskOperation = {}) {
    await this.ensureTable(operation);
    const state = await this.read(normalizeIdentity(identity), operation);
    return state ? claimFromState(identity, state, resolveNow(operation)) : null;
  }

  async saveProviderReceipt(identity: StorybookMediaTaskIdentity, leaseToken: string, rawReceipt: StorybookMediaProviderReceipt, operation: StorybookMediaTaskOperation = {}) {
    await this.ensureTable(operation);
    const normalized = normalizeIdentity(identity), receipt = normalizeProviderReceipt(normalized, rawReceipt);
    // 独立表由显式增量迁移创建。缺表会在下一次生成前失败关闭，不能静默退回易丢的内存回执。
    const [raw] = await executeWithBudget(this.pool, `
      insert ignore into storybook_media_receipts (
        task_key,institution_id,creator_user_id,child_id,storybook_id,scene_index,channel,provider,provider_model,input_digest,result_json
      ) select task_key,institution_id,actor_user_id,child_id,storybook_id,scene_index,channel,provider,provider_model,input_digest,?
        from storybook_media_tasks where task_key=? and actor_user_id=? and status='submitting' and task_id is null and lease_token=?
    `, [Buffer.from(JSON.stringify(receipt), "utf8"), taskKey(normalized), normalized.userId, leaseToken], operation);
    return (raw as ResultSetHeader).affectedRows === 1;
  }

  async claimProviderReceipt(identity: StorybookMediaTaskIdentity, operation: StorybookMediaTaskOperation = {}): Promise<StorybookMediaReceiptClaim> {
    await this.ensureTable(operation);
    const normalized = normalizeIdentity(identity), key = taskKey(normalized), nowMs = resolveNow(operation);
    return runInTransaction(this.pool, operation, async (connection, lifecycle) => {
      const [rawRows] = await executeOnConnectionWithBudget(connection, lifecycle, `
        select r.result_json,t.media_key,t.status,t.lease_expires_at from storybook_media_receipts r
        inner join storybook_media_tasks t on t.task_key=r.task_key
        where r.task_key=? and r.institution_id=? and r.child_id=? and r.storybook_id=?
          and r.provider=? and r.provider_model=? and r.input_digest=? for update
      `, [key, normalized.institutionId, normalized.childId, normalized.storybookId, normalized.provider, normalized.providerModel, normalized.inputDigest], operation);
      const row = (rawRows as Array<{ result_json: Buffer | string; media_key: string | null; status: string; lease_expires_at: Date | string | null }>)[0];
      if (!row || row.media_key) return { action: "none" };
      if ((asEpochMs(row.lease_expires_at) ?? 0) > nowMs || !["submitting", "blocked", "retryable"].includes(row.status)) return { action: "wait" };
      let receipt: StorybookMediaProviderReceipt;
      try { receipt = normalizeProviderReceipt(normalized, JSON.parse(Buffer.isBuffer(row.result_json) ? row.result_json.toString("utf8") : row.result_json)); }
      catch { throw new Error("Invalid private storybook provider receipt"); }
      const leaseToken = randomUUID();
      await executeOnConnectionWithBudget(connection, lifecycle, `update storybook_media_tasks set actor_user_id=?,status='submitting',lease_token=?,lease_expires_at=? where task_key=?`,
        [normalized.userId, leaseToken, new Date(nowMs + SUBMISSION_LEASE_MS), key], operation);
      return { action: "resume", leaseToken, receipt };
    });
  }

  private async ensureTable(operation?: StorybookMediaTaskOperation) {
    if (!this.tableReady) {
      this.tableReady = executeWithBudget(
        this.pool,
        `
          create table if not exists storybook_media_tasks (
            task_key char(64) character set ascii collate ascii_bin not null,
            institution_id varchar(191) not null,
            actor_user_id varchar(191) not null,
            child_id varchar(191) not null,
            storybook_id varchar(191) not null,
            scene_index smallint unsigned not null,
            channel varchar(16) not null,
            provider varchar(64) not null,
            provider_model varchar(191) not null,
            input_digest char(64) character set ascii collate ascii_bin not null,
            task_id varchar(191) null,
            status varchar(32) not null,
            attempt_count smallint unsigned not null default 0,
            poll_error_count smallint unsigned not null default 0,
            submitted_at datetime(3) null,
            next_retry_at datetime(3) null,
            media_key char(40) character set ascii collate ascii_bin null,
            lease_token char(36) character set ascii collate ascii_bin null,
            lease_expires_at datetime(3) null,
            last_error_reason varchar(500) null,
            created_at timestamp(3) not null default current_timestamp(3),
            updated_at timestamp(3) not null default current_timestamp(3)
              on update current_timestamp(3),
            primary key (task_key),
            key idx_storybook_media_task_scope (
              institution_id, child_id, storybook_id
            ),
            key idx_storybook_media_task_due (
              status, next_retry_at, lease_expires_at
            ),
            key idx_storybook_media_task_media (
              institution_id, media_key
            ),
            key idx_storybook_media_task_updated (updated_at)
          ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci
        `,
        [],
        operation
      ).then(() => undefined);
    }
    try {
      await this.tableReady;
    } catch (error) {
      this.tableReady = undefined;
      throw error;
    }
  }

  private async ensureRow(
    identity: StorybookMediaTaskIdentity,
    operation?: StorybookMediaTaskOperation
  ) {
    const normalized = normalizeIdentity(identity);
    const key = taskKey(normalized);
    await executeWithBudget(
      this.pool,
      `
        insert ignore into storybook_media_tasks (
          task_key,
          institution_id,
          actor_user_id,
          child_id,
          storybook_id,
          scene_index,
          channel,
          provider,
          provider_model,
          input_digest,
          status
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting')
      `,
      [
        key,
        normalized.institutionId,
        normalized.userId,
        normalized.childId,
        normalized.storybookId,
        normalized.sceneIndex,
        normalized.channel,
        normalized.provider,
        normalized.providerModel,
        normalized.inputDigest,
      ],
      operation
    );
    return { normalized, key };
  }

  private async read(
    identity: StorybookMediaTaskIdentity,
    operation?: StorybookMediaTaskOperation
  ) {
    const [rows] = await executeWithBudget(
      this.pool,
      `
        select
          status,
          lease_token,
          lease_expires_at,
          task_id,
          submitted_at,
          attempt_count,
          poll_error_count,
          next_retry_at,
          media_key,
          last_error_reason
        from storybook_media_tasks
        where task_key = ?
        limit 1
      `,
      [taskKey(identity)],
      operation
    );
    return parseStoredTask(rows);
  }

  private async readOnConnection(
    connection: PoolConnection,
    lifecycle: ConnectionLifecycle,
    identity: StorybookMediaTaskIdentity,
    operation?: StorybookMediaTaskOperation
  ) {
    const [rows] = await executeOnConnectionWithBudget(
      connection,
      lifecycle,
      `
        select
          status,
          lease_token,
          lease_expires_at,
          task_id,
          submitted_at,
          attempt_count,
          poll_error_count,
          next_retry_at,
          media_key,
          last_error_reason
        from storybook_media_tasks
        where task_key = ?
        limit 1
      `,
      [taskKey(identity)],
      operation
    );
    return parseStoredTask(rows);
  }

  async claim(
    identity: StorybookMediaTaskIdentity,
    operation: StorybookMediaTaskOperation = {}
  ) {
    await this.ensureTable(operation);
    const { normalized, key } = await this.ensureRow(identity, operation);
    const nowMs = resolveNow(operation);
    const now = new Date(nowMs);
    const leaseToken = randomUUID();

    // 租约更新与状态读取必须位于同一事务；否则第二次连接瞬时失败会留下未调用上游的僵尸租约。
    return runInTransaction(
      this.pool,
      operation,
      async (connection, lifecycle) => {
        const [pollResultRaw] = await executeOnConnectionWithBudget(
          connection,
          lifecycle,
          `
            update storybook_media_tasks
            set
              actor_user_id = ?,
              status = 'polling',
              lease_token = ?,
              lease_expires_at = ?,
              next_retry_at = ?
            where task_key = ?
              and media_key is null
              and task_id is not null
              and status in ('pending', 'poll-error', 'polling')
              and (next_retry_at is null or next_retry_at <= ?)
              and (lease_expires_at is null or lease_expires_at <= ?)
          `,
          [
            normalized.userId,
            leaseToken,
            new Date(nowMs + POLL_LEASE_MS),
            new Date(nowMs + POLL_INTERVAL_MS),
            key,
            now,
            now,
          ],
          operation
        );
        const pollResult = pollResultRaw as ResultSetHeader;
        if (pollResult.affectedRows === 1) {
          const state = await this.readOnConnection(
            connection,
            lifecycle,
            normalized,
            operation
          );
          if (!state?.taskId) {
            throw new Error("storybook media poll lease lost its task id");
          }
          return {
            ...claimFromState(normalized, state, nowMs),
            action: "poll" as const,
            leaseToken,
          };
        }

        const [submitResultRaw] = await executeOnConnectionWithBudget(
          connection,
          lifecycle,
          `
            update storybook_media_tasks
            set
              actor_user_id = ?,
              status = 'submitting',
              attempt_count = attempt_count + 1,
              lease_token = ?,
              lease_expires_at = ?,
              next_retry_at = null
            where task_key = ?
              and media_key is null
              and task_id is null
              and status in ('waiting', 'retryable')
              and attempt_count < ?
              and (next_retry_at is null or next_retry_at <= ?)
              and (lease_expires_at is null or lease_expires_at <= ?)
          `,
          [
            normalized.userId,
            leaseToken,
            new Date(nowMs + SUBMISSION_LEASE_MS),
            key,
            MAX_ATTEMPTS[normalized.channel],
            now,
            now,
          ],
          operation
        );
        const submitResult = submitResultRaw as ResultSetHeader;
        if (submitResult.affectedRows === 1) {
          const state = await this.readOnConnection(
            connection,
            lifecycle,
            normalized,
            operation
          );
          if (!state) {
            throw new Error("storybook media submission lease disappeared");
          }
          return {
            ...claimFromState(normalized, state, nowMs),
            action: "submit" as const,
            leaseToken,
          };
        }

        const state = await this.readOnConnection(
          connection,
          lifecycle,
          normalized,
          operation
        );
        if (!state) {
          throw new Error("storybook media task reservation disappeared");
        }
        return claimFromState(normalized, state, nowMs);
      }
    );
  }

  async markAsyncSubmitted(
    identity: StorybookMediaTaskIdentity,
    leaseToken: string,
    taskId: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    if (identity.channel !== "image") return false;
    await this.ensureTable(operation);
    const nowMs = resolveNow(operation);
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          task_id = ?,
          status = 'pending',
          poll_error_count = 0,
          submitted_at = ?,
          next_retry_at = ?,
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = null
        where task_key = ?
          and status = 'submitting'
          and task_id is null
          and lease_token = ?
      `,
      [
        normalizeTaskId(taskId),
        new Date(nowMs),
        new Date(nowMs + POLL_INTERVAL_MS),
        taskKey(identity),
        leaseToken,
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }

  async markSubmissionFailure(
    identity: StorybookMediaTaskIdentity,
    leaseToken: string,
    input: {
      retryable: boolean;
      nextRetryAtMs: number;
      reason: string;
    },
    operation: StorybookMediaTaskOperation = {}
  ) {
    await this.ensureTable(operation);
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          status = if(
            ? = 1 and attempt_count < ?,
            'retryable',
            'blocked'
          ),
          next_retry_at = if(
            ? = 1 and attempt_count < ?,
            ?,
            null
          ),
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = ?
        where task_key = ?
          and status = 'submitting'
          and task_id is null
          and lease_token = ?
      `,
      [
        input.retryable ? 1 : 0,
        MAX_ATTEMPTS[identity.channel],
        input.retryable ? 1 : 0,
        MAX_ATTEMPTS[identity.channel],
        new Date(input.nextRetryAtMs),
        safeErrorReason(input.reason),
        taskKey(identity),
        leaseToken,
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }

  async retryBlockedSubmission(
    identity: StorybookMediaTaskIdentity,
    operation: StorybookMediaTaskOperation = {}
  ) {
    await this.ensureTable(operation);
    const nowMs = resolveNow(operation);
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          status = 'retryable',
          next_retry_at = ?,
          lease_token = null,
          lease_expires_at = null
        where task_key = ?
          and status = 'blocked'
          and task_id is null
          and attempt_count < ?
      `,
      [
        new Date(nowMs),
        taskKey(identity),
        MAX_ATTEMPTS[identity.channel],
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }

  async markPending(
    identity: StorybookMediaTaskIdentity,
    taskId: string,
    leaseToken: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    await this.ensureTable(operation);
    const nowMs = resolveNow(operation);
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          status = 'pending',
          poll_error_count = 0,
          next_retry_at = ?,
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = null
        where task_key = ?
          and status = 'polling'
          and task_id = ?
          and lease_token = ?
      `,
      [
        new Date(nowMs + POLL_INTERVAL_MS),
        taskKey(identity),
        normalizeTaskId(taskId),
        leaseToken,
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }

  async markPollFailure(
    identity: StorybookMediaTaskIdentity,
    taskId: string,
    leaseToken: string,
    input: {
      terminalTask: boolean;
      retryableSubmission: boolean;
      blockTask?: boolean;
      nextRetryAtMs: number;
      reason: string;
    },
    operation: StorybookMediaTaskOperation = {}
  ) {
    await this.ensureTable(operation);
    const retryable =
      !input.blockTask &&
      input.terminalTask &&
      input.retryableSubmission;
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          status = case
            when ? = 1 then 'blocked'
            when ? = 0 then 'poll-error'
            when ? = 1 and attempt_count < ? then 'retryable'
            else 'blocked'
          end,
          task_id = if(? = 1, null, task_id),
          submitted_at = if(? = 1, null, submitted_at),
          poll_error_count = poll_error_count + 1,
          next_retry_at = case
            when ? = 1 then null
            when ? = 0 then ?
            when ? = 1 and attempt_count < ? then ?
            else null
          end,
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = ?
        where task_key = ?
          and status = 'polling'
          and task_id = ?
          and lease_token = ?
      `,
      [
        input.blockTask ? 1 : 0,
        input.terminalTask ? 1 : 0,
        retryable ? 1 : 0,
        MAX_ATTEMPTS[identity.channel],
        input.terminalTask ? 1 : 0,
        input.terminalTask ? 1 : 0,
        input.blockTask ? 1 : 0,
        input.terminalTask ? 1 : 0,
        new Date(input.nextRetryAtMs),
        retryable ? 1 : 0,
        MAX_ATTEMPTS[identity.channel],
        new Date(input.nextRetryAtMs),
        safeErrorReason(input.reason),
        taskKey(identity),
        normalizeTaskId(taskId),
        leaseToken,
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }

  async markReady(
    identity: StorybookMediaTaskIdentity,
    input: {
      leaseToken: string;
      taskId?: string | null;
      mediaKey: string;
    },
    operation: StorybookMediaTaskOperation = {}
  ) {
    await this.ensureTable(operation);
    const imageChannel = identity.channel === "image" && identity.provider !== "maas-z-image";
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          status = 'ready',
          media_key = ?,
          poll_error_count = 0,
          next_retry_at = null,
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = null
        where task_key = ?
          and status = ?
          and lease_token = ?
          ${
            imageChannel
              ? "and task_id = ?"
              : "and task_id is null"
          }
      `,
      [
        normalizeMediaKey(input.mediaKey),
        taskKey(identity),
        imageChannel ? "polling" : "submitting",
        input.leaseToken,
        ...(imageChannel
          ? [normalizeTaskId(input.taskId ?? "")]
          : []),
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }

  async recoverReadyAudio(
    identity: StorybookMediaTaskIdentity,
    mediaKey: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    if (identity.channel !== "audio" && identity.provider !== "maas-z-image") return false;
    await this.ensureTable(operation);
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          status = 'ready',
          media_key = ?,
          poll_error_count = 0,
          next_retry_at = null,
          lease_token = null,
          lease_expires_at = null,
          last_error_reason = null
        where task_key = ?
          and task_id is null
          and status in ('submitting', 'blocked', 'retryable', 'ready')
          and (media_key is null or media_key = ?)
      `,
      [
        normalizeMediaKey(mediaKey),
        taskKey(identity),
        normalizeMediaKey(mediaKey),
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }

  async invalidateReadyMedia(
    identity: StorybookMediaTaskIdentity,
    mediaKey: string,
    reason: string,
    operation: StorybookMediaTaskOperation = {}
  ) {
    await this.ensureTable(operation);
    const nowMs = resolveNow(operation);
    const [resultRaw] = await executeWithBudget(
      this.pool,
      `
        update storybook_media_tasks
        set
          status = if(task_id is null, 'blocked', 'pending'),
          media_key = null,
          next_retry_at = if(task_id is null, null, ?),
          last_error_reason = ?
        where task_key = ?
          and status = 'ready'
          and media_key = ?
      `,
      [
        new Date(nowMs),
        safeErrorReason(reason),
        taskKey(identity),
        normalizeMediaKey(mediaKey),
      ],
      operation
    );
    return (resultRaw as ResultSetHeader).affectedRows === 1;
  }
}

type StorybookMediaTaskGlobals = typeof globalThis & {
  __storybookMediaTaskMemoryStore?: InMemoryStorybookMediaTaskStore;
  __storybookMediaTaskDatabaseStore?: DatabaseStorybookMediaTaskStore;
};

/**
 * 生产环境缺少数据库时失败关闭，避免退回可重放的实例内任务状态。
 */
export function getStorybookMediaTaskStore(): StorybookMediaTaskStore {
  const globals = globalThis as StorybookMediaTaskGlobals;
  if (process.env.DATABASE_URL?.trim()) {
    globals.__storybookMediaTaskDatabaseStore ??=
      new DatabaseStorybookMediaTaskStore();
    return globals.__storybookMediaTaskDatabaseStore;
  }
  if (process.env.NODE_ENV === "production") {
    throw new ApiRouteError(
      "provider_unavailable",
      "绘本媒体任务状态存储暂时不可用，请稍后重试。"
    );
  }
  globals.__storybookMediaTaskMemoryStore ??=
    new InMemoryStorybookMediaTaskStore();
  return globals.__storybookMediaTaskMemoryStore;
}

export function resetStorybookMediaTaskStoreForTests() {
  const globals = globalThis as StorybookMediaTaskGlobals;
  globals.__storybookMediaTaskMemoryStore =
    new InMemoryStorybookMediaTaskStore();
  globals.__storybookMediaTaskDatabaseStore = undefined;
}
