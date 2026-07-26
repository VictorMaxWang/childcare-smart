import "server-only";

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";

import type { SessionUser } from "@/lib/auth/accounts";
import { getAuthSessionSecret } from "@/lib/auth/session-config";
import { getDatabasePool } from "@/lib/db/server";
import { ApiRouteError } from "@/lib/server/api-errors";
import type { AssistantCommand } from "@/lib/voice-assistant/types";

export const ASSISTANT_CONFIRMATION_TOKEN_TTL_MS = 10 * 60 * 1000;

const MAX_CONFIRMATION_TOKEN_LENGTH = 32_000;
const MAX_CLOCK_SKEW_MS = 30_000;

type ConfirmationTokenPayload = {
  version: 2;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  actor: {
    userId: string;
    role: SessionUser["role"];
    accountKind: SessionUser["accountKind"];
    institutionId: string;
    classId: string | null;
  };
  scope: {
    childId: string | null;
    className: string | null;
  };
  command: {
    id: string;
    role: AssistantCommand["role"];
    intent: AssistantCommand["intent"];
    params: Record<string, unknown>;
    execute: string;
    safetyLevel: AssistantCommand["safetyLevel"];
    requiredConfirmation: boolean;
  };
};

type ConfirmationTokenEnvelope = {
  payload: ConfirmationTokenPayload;
  signature: string;
};

export type AssistantConfirmationTokenConsumption = {
  tokenHash: string;
  institutionId: string;
  userId: string;
  childId: string | null;
  commandId: string;
  intent: string;
  expiresAt: number;
  consumedAt: number;
};

export interface AssistantConfirmationTokenStore {
  /**
   * 原子消费 token。返回 false 表示同一个 token 已被其他请求消费。
   */
  consume(input: AssistantConfirmationTokenConsumption): Promise<boolean>;
}

export class InMemoryAssistantConfirmationTokenStore
  implements AssistantConfirmationTokenStore
{
  private readonly consumedTokens = new Map<string, number>();

  get size() {
    return this.consumedTokens.size;
  }

  async consume(input: AssistantConfirmationTokenConsumption) {
    for (const [tokenHash, expiresAt] of this.consumedTokens) {
      if (expiresAt <= input.consumedAt) {
        this.consumedTokens.delete(tokenHash);
      }
    }

    if (this.consumedTokens.has(input.tokenHash)) {
      return false;
    }

    // Map 的检查和写入在同一个同步执行段内，避免同进程并发请求同时成功。
    this.consumedTokens.set(input.tokenHash, input.expiresAt);
    return true;
  }
}

class DatabaseAssistantConfirmationTokenStore
  implements AssistantConfirmationTokenStore
{
  private tableReady?: Promise<void>;

  private async ensureTable() {
    if (!this.tableReady) {
      this.tableReady = getDatabasePool()
        .execute(
          `
            create table if not exists voice_confirmation_token_consumptions (
              token_hash char(64) character set ascii collate ascii_bin not null,
              institution_id varchar(191) not null,
              user_id varchar(191) not null,
              child_id varchar(191) null,
              command_id varchar(191) not null,
              intent varchar(64) not null,
              expires_at datetime(3) not null,
              consumed_at datetime(3) not null,
              primary key (token_hash),
              key idx_voice_confirmation_expires_at (expires_at)
            ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci
          `
        )
        .then(() => undefined);
    }

    try {
      await this.tableReady;
    } catch (error) {
      // 连接恢复或迁移权限修复后允许下一次请求重试建表。
      this.tableReady = undefined;
      throw error;
    }
  }

  async consume(input: AssistantConfirmationTokenConsumption) {
    await this.ensureTable();
    const pool = getDatabasePool();
    const consumedAt = new Date(input.consumedAt);

    await pool.execute(
      "delete from voice_confirmation_token_consumptions where expires_at <= ?",
      [consumedAt]
    );

    try {
      await pool.execute<ResultSetHeader>(
        `
          insert into voice_confirmation_token_consumptions (
            token_hash,
            institution_id,
            user_id,
            child_id,
            command_id,
            intent,
            expires_at,
            consumed_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.tokenHash,
          input.institutionId,
          input.userId,
          input.childId,
          input.commandId,
          input.intent,
          new Date(input.expiresAt),
          consumedAt,
        ]
      );
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }
  }
}

type ConfirmationTokenGlobals = typeof globalThis & {
  __voiceAssistantConfirmationMemoryStore?: InMemoryAssistantConfirmationTokenStore;
  __voiceAssistantConfirmationDatabaseStore?: DatabaseAssistantConfirmationTokenStore;
};

type IssueConfirmationTokenOptions = {
  secret?: string;
  now?: number;
  nonce?: string;
};

type VerifyConfirmationTokenOptions = {
  secret?: string;
  now?: number;
  store?: AssistantConfirmationTokenStore;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function jsonSafeRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function resolveConfirmationSecret(explicitSecret?: string) {
  const explicit = explicitSecret?.trim();
  if (explicit) return explicit;

  const dedicated = process.env.VOICE_ASSISTANT_CONFIRMATION_SECRET?.trim();
  if (dedicated) return dedicated;

  try {
    return getAuthSessionSecret();
  } catch {
    throw new ApiRouteError(
      "provider_unavailable",
      "服务端缺少语音确认密钥配置。"
    );
  }
}

function buildConfirmationPayload(
  sessionUser: SessionUser,
  command: AssistantCommand,
  issuedAt: number,
  expiresAt: number,
  nonce: string
): ConfirmationTokenPayload {
  return {
    version: 2,
    nonce,
    issuedAt,
    expiresAt,
    actor: {
      userId: sessionUser.id,
      role: sessionUser.role,
      accountKind: sessionUser.accountKind,
      institutionId: sessionUser.institutionId,
      classId: readString(sessionUser.classId),
    },
    scope: {
      childId: readString(command.params.childId),
      className: readString(command.params.className),
    },
    command: {
      id: command.id,
      role: command.role,
      intent: command.intent,
      params: jsonSafeRecord(command.params),
      execute: command.execute,
      safetyLevel: command.safetyLevel,
      requiredConfirmation: command.requiredConfirmation,
    },
  };
}

function signPayload(payload: ConfirmationTokenPayload, secret: string) {
  return createHmac("sha256", secret)
    .update(stableSerialize(payload))
    .digest("base64url");
}

function parseToken(token: string): ConfirmationTokenEnvelope {
  if (!token || token.length > MAX_CONFIRMATION_TOKEN_LENGTH) {
    throw invalidTokenError();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw invalidTokenError();
  }

  if (!isRecord(decoded) || !isRecord(decoded.payload)) {
    throw invalidTokenError();
  }

  const payload = decoded.payload;
  if (
    payload.version !== 2 ||
    typeof payload.nonce !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(payload.nonce) ||
    typeof payload.issuedAt !== "number" ||
    !Number.isSafeInteger(payload.issuedAt) ||
    typeof payload.expiresAt !== "number" ||
    !Number.isSafeInteger(payload.expiresAt) ||
    !isRecord(payload.actor) ||
    !isRecord(payload.scope) ||
    !isRecord(payload.command) ||
    typeof decoded.signature !== "string"
  ) {
    throw invalidTokenError();
  }

  return decoded as ConfirmationTokenEnvelope;
}

function invalidTokenError() {
  return new ApiRouteError(
    "needs_confirmation",
    "写入类语音命令确认 token 无效。"
  );
}

function isDuplicateKeyError(error: unknown) {
  if (!isRecord(error)) return false;
  return error.code === "ER_DUP_ENTRY" || error.errno === 1062;
}

function getDefaultConfirmationTokenStore() {
  const globals = globalThis as ConfirmationTokenGlobals;
  if (process.env.DATABASE_URL?.trim()) {
    globals.__voiceAssistantConfirmationDatabaseStore ??=
      new DatabaseAssistantConfirmationTokenStore();
    return globals.__voiceAssistantConfirmationDatabaseStore;
  }

  if (process.env.NODE_ENV === "production") {
    throw new ApiRouteError(
      "provider_unavailable",
      "语音确认状态存储暂时不可用，请稍后重试。"
    );
  }

  globals.__voiceAssistantConfirmationMemoryStore ??=
    new InMemoryAssistantConfirmationTokenStore();
  return globals.__voiceAssistantConfirmationMemoryStore;
}

/**
 * 为已经通过权限预检的写入命令签发短时确认 token。
 * token 绑定操作者、租户、幼儿/班级和完整执行参数，但不承担权限校验本身。
 */
export function issueAssistantConfirmationToken(
  sessionUser: SessionUser,
  command: AssistantCommand,
  options: IssueConfirmationTokenOptions = {}
) {
  const issuedAt = options.now ?? Date.now();
  const nonce = options.nonce ?? randomUUID();
  const payload = buildConfirmationPayload(
    sessionUser,
    command,
    issuedAt,
    issuedAt + ASSISTANT_CONFIRMATION_TOKEN_TTL_MS,
    nonce
  );
  const envelope: ConfirmationTokenEnvelope = {
    payload,
    signature: signPayload(
      payload,
      resolveConfirmationSecret(options.secret)
    ),
  };

  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

/**
 * 校验并原子消费确认 token。只有成功消费后，调用方才可以进入写入执行器。
 * 作用域、签名或有效期失败不会占用 token，存储不可用时则失败关闭。
 */
export async function verifyAndConsumeAssistantConfirmationToken(
  sessionUser: SessionUser,
  command: AssistantCommand,
  options: VerifyConfirmationTokenOptions = {}
) {
  const token = command.confirmationToken;
  if (!token) {
    throw new ApiRouteError(
      "needs_confirmation",
      "写入类语音命令缺少确认 token。"
    );
  }

  const now = options.now ?? Date.now();
  const envelope = parseToken(token);
  const { payload } = envelope;
  if (
    payload.issuedAt > now + MAX_CLOCK_SKEW_MS ||
    payload.expiresAt <= payload.issuedAt ||
    payload.expiresAt - payload.issuedAt >
      ASSISTANT_CONFIRMATION_TOKEN_TTL_MS
  ) {
    throw invalidTokenError();
  }
  if (payload.expiresAt <= now) {
    throw new ApiRouteError(
      "needs_confirmation",
      "写入类语音命令确认 token 已过期，请重新解析指令。"
    );
  }

  const expectedSignature = createHmac(
    "sha256",
    resolveConfirmationSecret(options.secret)
  )
    .update(stableSerialize(payload))
    .digest();
  const actualSignature = Buffer.from(envelope.signature, "base64url");
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new ApiRouteError(
      "needs_confirmation",
      "写入类语音命令确认签名无效。"
    );
  }

  const expectedPayload = buildConfirmationPayload(
    sessionUser,
    command,
    payload.issuedAt,
    payload.expiresAt,
    payload.nonce
  );
  if (stableSerialize(payload) !== stableSerialize(expectedPayload)) {
    throw new ApiRouteError(
      "needs_confirmation",
      "写入类语音命令确认 token 作用域不匹配。"
    );
  }

  const store = options.store ?? getDefaultConfirmationTokenStore();
  let consumed: boolean;
  try {
    consumed = await store.consume({
      // nonce 位于签名载荷内；以它作为一次性身份可阻止等价 JSON/base64 重编码绕过。
      tokenHash: createHash("sha256").update(payload.nonce).digest("hex"),
      institutionId: payload.actor.institutionId,
      userId: payload.actor.userId,
      childId: payload.scope.childId,
      commandId: payload.command.id,
      intent: payload.command.intent,
      expiresAt: payload.expiresAt,
      consumedAt: now,
    });
  } catch {
    throw new ApiRouteError(
      "provider_unavailable",
      "语音确认状态存储暂时不可用，请重新解析指令后重试。"
    );
  }

  if (!consumed) {
    throw new ApiRouteError(
      "needs_confirmation",
      "写入类语音命令确认 token 已使用，请重新解析指令。"
    );
  }
}
