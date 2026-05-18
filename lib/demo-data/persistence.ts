import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import { normalizeAppStateSnapshot, type AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { DemoDataContext, DemoRoleAlias, DemoStorage, MutationResult } from "./types";
import { createDemoSeedSnapshot } from "./seed";
import { DEFENSE_DEMO_DATASET_VERSION } from "./defense-scenario";

export const DEMO_DATASET_VERSION = DEFENSE_DEMO_DATASET_VERSION;
export const DEMO_PERSISTENCE_SCHEMA_VERSION = "d01-v1";

export const SNAPSHOT_BUCKET_VERSIONS = {
  children: "children.v3",
  attendance: "attendance.v3",
  meals: "meals.v3",
  growth: "growth.v3",
  feedback: "feedback.v3",
  health: "health.v3",
  taskCheckIns: "taskcheckins.v3",
  interventionCards: "interventioncards.v1",
  consultations: "consultations.v1",
  mobileDrafts: "mobile-drafts.v1",
  reminders: "reminders.v1",
  tasks: "tasks.v1",
  messages: "messages.v1",
  conversations: "conversations.v1",
  healthMaterials: "health-materials.v1",
  nutritionMenus: "nutrition-menus.v1",
  storybooks: "storybooks.v1",
} as const;

export type SnapshotBucket = keyof typeof SNAPSHOT_BUCKET_VERSIONS;

const memoryBuckets = new Map<string, string>();

export function createMemoryDemoStorage(seed?: Record<string, string>): DemoStorage {
  const buckets = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (key) => buckets.get(key) ?? null,
    setItem: (key, value) => {
      buckets.set(key, value);
    },
    removeItem: (key) => {
      buckets.delete(key);
    },
  };
}

export function getDefaultDemoStorage(): DemoStorage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  return {
    getItem: (key) => memoryBuckets.get(key) ?? null,
    setItem: (key, value) => {
      memoryBuckets.set(key, value);
    },
    removeItem: (key) => {
      memoryBuckets.delete(key);
    },
  };
}

export function buildDemoNamespaceForInstitution(institutionId: string) {
  return `demo:${DEMO_DATASET_VERSION}:institution:${institutionId}`;
}

export function buildSnapshotNamespace(user: Pick<SessionUser, "id" | "role" | "institutionId" | "accountKind">) {
  if (user.accountKind === "demo") {
    return buildDemoNamespaceForInstitution(user.institutionId);
  }

  return `normal:${user.institutionId}:${user.role}:${user.id}`;
}

export function buildLegacyDemoUserNamespace(user: Pick<SessionUser, "id" | "accountKind">) {
  return user.accountKind === "demo" ? `demo:v4-demo-recovery-hotfix:${user.id}` : null;
}

export function buildBucketKey(namespace: string, bucket: SnapshotBucket) {
  return `childcare.${namespace}.${SNAPSHOT_BUCKET_VERSIONS[bucket]}`;
}

function readJson<T>(storage: DemoStorage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readNumericSeedChildId(childId: string) {
  const match = /^c-(\d+)$/.exec(childId);
  return match ? Number(match[1]) : null;
}

function isDSeedBaselineChildId(childId: string) {
  const value = readNumericSeedChildId(childId);
  return typeof value === "number" && value >= 1 && value <= 36;
}

function isDSeedBaselineStale(snapshot: AppStateSnapshot) {
  const baselineChildCount = snapshot.children.filter((child) => isDSeedBaselineChildId(child.id)).length;
  return (
    baselineChildCount < 36 ||
    snapshot.growth.length < 36 * 6 ||
    snapshot.meals.length < 36 * 7 ||
    snapshot.health.length < 36 * 7 ||
    snapshot.healthMaterials.length < 36 ||
    snapshot.storybooks.length < 36
  );
}

function mergeBucketByKey<T>(fallbackItems: T[], currentItems: T[], readKey: (item: T) => string | null | undefined) {
  const fallbackKeys = new Set(fallbackItems.map(readKey).filter((key): key is string => Boolean(key)));
  const currentCustomItems = currentItems.filter((item) => {
    const key = readKey(item);
    return !key || !fallbackKeys.has(key);
  });
  return [...fallbackItems, ...currentCustomItems];
}

function mergeDSeedBaseline(current: AppStateSnapshot, fallback: AppStateSnapshot) {
  if (!isDSeedBaselineStale(current)) return current;

  return normalizeAppStateSnapshot({
    ...fallback,
    children: mergeBucketByKey(fallback.children, current.children, (item) => item.id),
    attendance: mergeBucketByKey(fallback.attendance, current.attendance, (item) => item.id),
    meals: mergeBucketByKey(fallback.meals, current.meals, (item) => item.id),
    growth: mergeBucketByKey(fallback.growth, current.growth, (item) => item.id),
    feedback: mergeBucketByKey(fallback.feedback, current.feedback, (item) => item.id),
    health: mergeBucketByKey(fallback.health, current.health, (item) => item.id),
    taskCheckIns: mergeBucketByKey(fallback.taskCheckIns, current.taskCheckIns, (item) => item.id),
    interventionCards: mergeBucketByKey(fallback.interventionCards, current.interventionCards, (item) => item.id),
    consultations: mergeBucketByKey(fallback.consultations, current.consultations, (item) => item.consultationId),
    mobileDrafts: mergeBucketByKey(fallback.mobileDrafts, current.mobileDrafts, (item) => item.draftId),
    reminders: mergeBucketByKey(fallback.reminders, current.reminders, (item) => item.reminderId),
    tasks: mergeBucketByKey(fallback.tasks, current.tasks, (item) => item.taskId),
    messages: mergeBucketByKey(fallback.messages, current.messages, (item) => item.messageId),
    conversations: mergeBucketByKey(fallback.conversations, current.conversations, (item) => item.conversationId),
    healthMaterials: mergeBucketByKey(fallback.healthMaterials, current.healthMaterials, (item) => item.materialId),
    nutritionMenus: mergeBucketByKey(fallback.nutritionMenus, current.nutritionMenus, (item) => item.menuId),
    storybooks: mergeBucketByKey(fallback.storybooks, current.storybooks, (item) => item.storybookId),
    updatedAt: fallback.updatedAt,
    demoPersistenceSchemaVersion: DEMO_PERSISTENCE_SCHEMA_VERSION,
  }) ?? fallback;
}

export function readSnapshotFromStorage(
  storage: DemoStorage,
  namespace: string,
  fallback: AppStateSnapshot
) {
  const candidate = {
    children: readJson(storage, buildBucketKey(namespace, "children"), fallback.children),
    attendance: readJson(storage, buildBucketKey(namespace, "attendance"), fallback.attendance),
    meals: readJson(storage, buildBucketKey(namespace, "meals"), fallback.meals),
    growth: readJson(storage, buildBucketKey(namespace, "growth"), fallback.growth),
    feedback: readJson(storage, buildBucketKey(namespace, "feedback"), fallback.feedback),
    health: readJson(storage, buildBucketKey(namespace, "health"), fallback.health),
    taskCheckIns: readJson(storage, buildBucketKey(namespace, "taskCheckIns"), fallback.taskCheckIns),
    interventionCards: readJson(
      storage,
      buildBucketKey(namespace, "interventionCards"),
      fallback.interventionCards
    ),
    consultations: readJson(storage, buildBucketKey(namespace, "consultations"), fallback.consultations),
    mobileDrafts: readJson(storage, buildBucketKey(namespace, "mobileDrafts"), fallback.mobileDrafts),
    reminders: readJson(storage, buildBucketKey(namespace, "reminders"), fallback.reminders),
    tasks: readJson(storage, buildBucketKey(namespace, "tasks"), fallback.tasks),
    messages: readJson(storage, buildBucketKey(namespace, "messages"), fallback.messages),
    conversations: readJson(storage, buildBucketKey(namespace, "conversations"), fallback.conversations),
    healthMaterials: readJson(storage, buildBucketKey(namespace, "healthMaterials"), fallback.healthMaterials),
    nutritionMenus: readJson(storage, buildBucketKey(namespace, "nutritionMenus"), fallback.nutritionMenus),
    storybooks: readJson(storage, buildBucketKey(namespace, "storybooks"), fallback.storybooks),
    updatedAt: fallback.updatedAt,
    demoPersistenceSchemaVersion: DEMO_PERSISTENCE_SCHEMA_VERSION,
  } satisfies AppStateSnapshot;

  const normalized = normalizeAppStateSnapshot(candidate) ?? fallback;
  const upgraded = mergeDSeedBaseline(normalized, fallback);
  if (upgraded !== normalized) {
    writeSnapshotToStorage(storage, namespace, upgraded);
  }
  return upgraded;
}

export function writeSnapshotToStorage(storage: DemoStorage, namespace: string, snapshot: AppStateSnapshot) {
  const normalized = normalizeAppStateSnapshot({
    ...snapshot,
    demoPersistenceSchemaVersion: DEMO_PERSISTENCE_SCHEMA_VERSION,
  });
  const snapshotToWrite = normalized ?? snapshot;

  (Object.keys(SNAPSHOT_BUCKET_VERSIONS) as SnapshotBucket[]).forEach((bucket) => {
    storage.setItem(buildBucketKey(namespace, bucket), JSON.stringify(snapshotToWrite[bucket]));
  });
}

export function clearSnapshotStorage(storage: DemoStorage, namespace: string) {
  (Object.keys(SNAPSHOT_BUCKET_VERSIONS) as SnapshotBucket[]).forEach((bucket) => {
    storage.removeItem(buildBucketKey(namespace, bucket));
  });
}

function resolveDemoUser(roleOrAccount?: DemoRoleAlias | string | SessionUser) {
  if (roleOrAccount && typeof roleOrAccount === "object") {
    return roleOrAccount;
  }

  const token = roleOrAccount ?? "parent";
  if (token === "director") return DEMO_ACCOUNTS.find((account) => account.id === "u-admin") ?? DEMO_ACCOUNTS[0];
  if (token === "teacher") return DEMO_ACCOUNTS.find((account) => account.id === "u-teacher") ?? DEMO_ACCOUNTS[1];
  if (token === "teacher2") return DEMO_ACCOUNTS.find((account) => account.id === "u-teacher2") ?? DEMO_ACCOUNTS[2];
  if (token === "parent") return DEMO_ACCOUNTS.find((account) => account.id === "u-parent") ?? DEMO_ACCOUNTS[3];

  return DEMO_ACCOUNTS.find((account) => account.id === token || account.username === token) ?? DEMO_ACCOUNTS[3];
}

export function getCurrentDemoContext(
  roleOrAccount?: DemoRoleAlias | string | SessionUser,
  options: { storage?: DemoStorage; now?: () => string } = {}
): DemoDataContext {
  const user = resolveDemoUser(roleOrAccount);
  return {
    user,
    namespace: buildSnapshotNamespace(user),
    storage: options.storage ?? getDefaultDemoStorage(),
    now: options.now ?? (() => new Date().toISOString()),
  };
}

export function readContextSnapshot(context: DemoDataContext) {
  return readSnapshotFromStorage(
    context.storage,
    context.namespace,
    createDemoSeedSnapshot(context.now())
  );
}

export function writeContextSnapshot(context: DemoDataContext, snapshot: AppStateSnapshot): MutationResult {
  const persistedAt = context.now();
  const normalized =
    normalizeAppStateSnapshot({
      ...snapshot,
      updatedAt: persistedAt,
      demoPersistenceSchemaVersion: DEMO_PERSISTENCE_SCHEMA_VERSION,
    }) ?? snapshot;

  writeSnapshotToStorage(context.storage, context.namespace, normalized);

  return {
    status: context.user.accountKind === "demo" ? "local_only" : "remote_synced",
    snapshot: normalized,
    persistedAt,
    message:
      context.user.accountKind === "demo"
        ? "Saved to shared demo persistence."
        : "Saved to the active snapshot persistence layer.",
  };
}

export function resetDemoData(
  context = getCurrentDemoContext("parent")
): MutationResult {
  const snapshot = createDemoSeedSnapshot(context.now());
  clearSnapshotStorage(context.storage, context.namespace);
  writeSnapshotToStorage(context.storage, context.namespace, snapshot);
  return {
    status: "local_only",
    snapshot,
    persistedAt: context.now(),
    message: "Demo data reset to the D01 seed snapshot.",
  };
}
