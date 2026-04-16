import "server-only";

import { createPool, type Pool, type PoolConnection } from "mysql2/promise";

export const DATABASE_URL_CONFIG_ERROR_MESSAGE = "服务端缺少 DATABASE_URL 配置。";

export class DatabaseConfigError extends Error {
  constructor(message = "DATABASE_URL is required in production") {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

export type DatabaseConnection = PoolConnection;

type DatabaseRow = Record<string, unknown>;
type DatabaseExecuteValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | Blob
  | Buffer
  | Uint8Array
  | DatabaseExecuteValue[]
  | { [key: string]: DatabaseExecuteValue };

type DatabaseQueryResult<T extends DatabaseRow> = {
  rows: T[];
};

type GlobalWithDbPool = typeof globalThis & {
  __smartChildcareDbPool?: Pool;
};

function isDatabaseSslEnabled() {
  const raw = process.env.DATABASE_SSL?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function getDatabasePoolConfig() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new DatabaseConfigError();
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseConfigError("DATABASE_URL must be a valid MySQL connection string");
  }

  if (url.protocol !== "mysql:" && url.protocol !== "mysqls:") {
    throw new DatabaseConfigError("DATABASE_URL must use mysql:// or mysqls://");
  }

  const database = url.pathname.replace(/^\/+/, "");
  if (!database) {
    throw new DatabaseConfigError("DATABASE_URL must include a database name");
  }

  const useSsl = isDatabaseSslEnabled() || url.protocol === "mysqls:";

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database,
    waitForConnections: true,
    connectionLimit: 3,
    maxIdle: 3,
    idleTimeout: 10000,
    queueLimit: 0,
    connectTimeout: 5000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  } as const;
}

function createDatabasePool() {
  return createPool(getDatabasePoolConfig());
}

export function getDatabasePool() {
  const globalWithDbPool = globalThis as GlobalWithDbPool;
  if (!globalWithDbPool.__smartChildcareDbPool) {
    globalWithDbPool.__smartChildcareDbPool = createDatabasePool();
  }
  return globalWithDbPool.__smartChildcareDbPool;
}

export async function dbQuery<T extends DatabaseRow>(text: string, values: DatabaseExecuteValue[] = []): Promise<DatabaseQueryResult<T>> {
  const [rows] = await getDatabasePool().execute(text, values);
  if (!Array.isArray(rows)) {
    return { rows: [] };
  }

  return { rows: rows as T[] };
}

export async function withDbTransaction<T>(callback: (connection: DatabaseConnection) => Promise<T>) {
  const connection = await getDatabasePool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("[DB] Failed to rollback transaction", rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export function encodeDatabaseJson(value: unknown) {
  return JSON.stringify(value);
}

export function decodeDatabaseJson<T>(value: unknown): T | null {
  if (value == null) return null;

  if (Buffer.isBuffer(value)) {
    return decodeDatabaseJson<T>(value.toString("utf8"));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    return value as T;
  }

  return null;
}
