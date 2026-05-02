import "server-only";

import type { SessionUser } from "@/lib/auth/accounts";
import { DATABASE_URL_CONFIG_ERROR_MESSAGE, DatabaseConfigError, dbQuery, decodeDatabaseJson, encodeDatabaseJson } from "@/lib/db/server";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import { ApiRouteError } from "@/lib/server/api-errors";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";

export interface AppDataRepository {
  load(session: SessionUser): Promise<ApiExtendedSnapshot>;
  save(session: SessionUser, snapshot: ApiExtendedSnapshot): Promise<void>;
}

type GlobalWithApiDemoSnapshots = typeof globalThis & {
  __childcareSmartApiDemoSnapshots?: Map<string, ApiExtendedSnapshot>;
};

function getDemoSnapshotMap() {
  const globalWithSnapshots = globalThis as GlobalWithApiDemoSnapshots;
  if (!globalWithSnapshots.__childcareSmartApiDemoSnapshots) {
    globalWithSnapshots.__childcareSmartApiDemoSnapshots = new Map();
  }
  return globalWithSnapshots.__childcareSmartApiDemoSnapshots;
}

export class DefaultAppDataRepository implements AppDataRepository {
  async load(session: SessionUser) {
    if (session.accountKind === "demo") {
      const key = session.institutionId;
      const snapshots = getDemoSnapshotMap();
      const existing = snapshots.get(key);
      if (existing) return normalizeExtendedSnapshot(existing, session);

      const seeded = normalizeExtendedSnapshot(createDemoSeedSnapshot(), session);
      snapshots.set(key, seeded);
      return seeded;
    }

    try {
      const { rows } = await dbQuery<{ snapshot: unknown }>(
        `
          select snapshot
          from app_state_snapshots
          where institution_id = ?
          limit 1
        `,
        [session.institutionId]
      );

      const raw = decodeDatabaseJson<unknown>(rows[0]?.snapshot) ?? rows[0]?.snapshot;
      return normalizeExtendedSnapshot(raw, session);
    } catch (error) {
      if (error instanceof DatabaseConfigError) {
        throw new ApiRouteError("provider_unavailable", DATABASE_URL_CONFIG_ERROR_MESSAGE, 503);
      }
      throw error;
    }
  }

  async save(session: SessionUser, snapshot: ApiExtendedSnapshot) {
    if (session.accountKind === "demo") {
      getDemoSnapshotMap().set(session.institutionId, normalizeExtendedSnapshot(snapshot, session));
      return;
    }

    try {
      const encodedSnapshot = encodeDatabaseJson(snapshot);
      await dbQuery(
        `
          insert into app_state_snapshots (institution_id, snapshot, updated_by)
          values (?, ?, ?)
          on duplicate key update
            snapshot = ?,
            updated_by = ?
        `,
        [session.institutionId, encodedSnapshot, session.id, encodedSnapshot, session.id]
      );
    } catch (error) {
      if (error instanceof DatabaseConfigError) {
        throw new ApiRouteError("provider_unavailable", DATABASE_URL_CONFIG_ERROR_MESSAGE, 503);
      }
      throw error;
    }
  }
}
