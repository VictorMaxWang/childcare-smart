#!/usr/bin/env node
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createPool } from "mysql2/promise";

loadLocalEnvFile(".env.local");

const ROLE_ADMIN = "\u673a\u6784\u7ba1\u7406\u5458";
const ROLE_TEACHER = "\u6559\u5e08";
const ROLE_PARENT = "\u5bb6\u957f";
const DEFAULT_PARENT_CHILD_CLASS_NAME = "\u5f85\u5206\u73ed";
const DEFAULT_SAMPLE_CLASS_NAME = "\u8054\u8c03\u793a\u4f8b\u73ed";
const SAMPLE_ACCOUNTS = [
  { label: "admin", env: "SAMPLE_ADMIN_PHONE", phone: "10000000000", role: ROLE_ADMIN },
  { label: "teacher", env: "SAMPLE_TEACHER_PHONE", phone: "10000000001", role: ROLE_TEACHER },
  { label: "parent", env: "SAMPLE_PARENT_PHONE", phone: "10000000002", role: ROLE_PARENT },
].map((account) => ({
  ...account,
  phone: process.env[account.env]?.trim() || account.phone,
}));
const SNAPSHOT_ARRAY_KEYS = [
  "children",
  "teachers",
  "attendance",
  "meals",
  "growth",
  "feedback",
  "health",
  "taskCheckIns",
  "interventionCards",
  "consultations",
  "mobileDrafts",
  "reminders",
  "tasks",
  "messages",
  "conversations",
  "healthMaterials",
  "nutritionMenus",
  "storybooks",
];
const APPLY = process.argv.includes("--apply");

function loadLocalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const match = normalizedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();
  if (!value) return "";

  const quote = value[0];
  if (quote === `"` || quote === "'") {
    const closingQuoteIndex = value.indexOf(quote, 1);
    if (closingQuoteIndex > 0) {
      value = value.slice(1, closingQuoteIndex);
      return quote === `"` ? value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t") : value;
    }
  }

  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

function truthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function fail(message) {
  throw new Error(message);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stableClassId(institutionId, className) {
  const digest = createHash("sha256")
    .update(`${institutionId}\u0000${className}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `class-aligned-${digest}`;
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function normalizePhone(input) {
  const compact = input.trim().replace(/[\s-]+/g, "");
  const nationalNumber =
    compact.startsWith("+86")
      ? compact.slice(3)
      : compact.startsWith("86") && compact.length === 13
        ? compact.slice(2)
        : compact;

  if (!/^1\d{10}$/.test(nationalNumber)) {
    fail(`Sample ${maskPhone(input)} is not a supported mainland China phone format`);
  }

  return `+86${nationalNumber}`;
}

function phoneCandidates(phone) {
  return unique([phone.trim(), normalizePhone(phone)]);
}

function maskPhone(phone) {
  const text = String(phone ?? "");
  if (text.length <= 4) return "****";
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function parseDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) fail("DATABASE_URL missing");

  const url = new URL(connectionString);
  if (url.protocol !== "mysql:" && url.protocol !== "mysqls:") {
    fail("DATABASE_URL must use mysql:// or mysqls://");
  }

  const database = url.pathname.replace(/^\/+/, "");
  if (!database) fail("DATABASE_URL missing database name");

  const useSsl = truthy(process.env.DATABASE_SSL) || url.protocol === "mysqls:";
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database,
    waitForConnections: true,
    connectionLimit: 2,
    maxIdle: 2,
    idleTimeout: 10000,
    connectTimeout: 5000,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  };
}

function decodeJson(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return decodeJson(value.toString("utf8"));
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
}

function encodeJson(value) {
  return JSON.stringify(value);
}

function createEmptySnapshot(input) {
  const updatedAt = new Date().toISOString();
  const snapshot = {
    demoPersistenceSchemaVersion: "d01-v1",
    updatedAt,
    meta: {
      workspace: {
        kind: "institution",
        institutionId: input.institutionId,
        ownerUserId: input.ownerUserId,
        ownerRole: input.ownerRole,
        isDemo: false,
        createdAt: updatedAt,
      },
      usageLimits: {
        maxChildren: 5,
        maxStorybooksPerMonth: 20,
        maxAiCallsPerDay: 50,
      },
    },
  };

  for (const key of SNAPSHOT_ARRAY_KEYS) {
    snapshot[key] = [];
  }

  return snapshot;
}

function normalizeSnapshot(rawSnapshot, owner) {
  const snapshot = {
    ...createEmptySnapshot({
      institutionId: owner.institution_id,
      ownerUserId: owner.id,
      ownerRole: owner.role,
    }),
    ...(decodeJson(rawSnapshot) ?? {}),
  };

  for (const key of SNAPSHOT_ARRAY_KEYS) {
    if (!Array.isArray(snapshot[key])) snapshot[key] = [];
  }

  snapshot.meta = {
    ...snapshot.meta,
    workspace: {
      ...snapshot.meta?.workspace,
      institutionId: owner.institution_id,
      ownerUserId: owner.id,
      ownerRole: owner.role,
      isDemo: false,
    },
    usageLimits: {
      maxChildren: 5,
      maxStorybooksPerMonth: 20,
      maxAiCallsPerDay: 50,
      ...(snapshot.meta?.usageLimits ?? {}),
    },
  };

  return snapshot;
}

function itemIdentity(item, index) {
  if (item && typeof item === "object" && typeof item.id === "string" && item.id.length > 0) {
    return item.id;
  }
  return `json:${index}:${JSON.stringify(item)}`;
}

function mergeArrayByIdentity(current, incoming) {
  const merged = new Map();
  current.forEach((item, index) => merged.set(itemIdentity(item, index), item));
  incoming.forEach((item, index) => merged.set(itemIdentity(item, index), item));
  return [...merged.values()];
}

function decodeChildIds(value) {
  const parsed = decodeJson(value) ?? value;
  return Array.isArray(parsed)
    ? parsed.filter((item) => typeof item === "string" && item.length > 0)
    : [];
}

function isDemoFlag(value) {
  return value === true || value === 1 || value === "1";
}

async function loadSampleUsers(pool) {
  const values = unique(SAMPLE_ACCOUNTS.flatMap((account) => phoneCandidates(account.phone)));
  const [rows] = await pool.execute(
    `
      select id, username_normalized, phone_normalized, display_name, role, institution_id, class_name, child_ids, is_demo
      from app_users
      where username_normalized in (${placeholders(values)})
         or phone_normalized in (${placeholders(values)})
    `,
    [...values, ...values]
  );

  const result = {};
  for (const account of SAMPLE_ACCOUNTS) {
    const candidates = phoneCandidates(account.phone);
    const matches = rows.filter(
      (row) => candidates.includes(row.username_normalized) || candidates.includes(row.phone_normalized)
    );

    if (matches.length !== 1) {
      fail(`Expected exactly one ${account.label} sample account for ${maskPhone(account.phone)}, found ${matches.length}`);
    }

    const row = matches[0];
    if (row.role !== account.role) {
      fail(`${account.label} sample account role mismatch`);
    }
    if (isDemoFlag(row.is_demo)) {
      fail(`${account.label} sample account must be a normal account, not demo`);
    }

    result[account.label] = row;
  }

  return result;
}

async function loadSnapshots(pool, institutionIds) {
  const ids = unique(institutionIds);
  const [rows] = await pool.execute(
    `
      select institution_id, snapshot
      from app_state_snapshots
      where institution_id in (${placeholders(ids)})
    `,
    ids
  );

  return new Map(rows.map((row) => [row.institution_id, row.snapshot]));
}

function buildMergedSnapshot(users, snapshotRows) {
  const sourceUsers = [users.admin, users.teacher, users.parent];
  const merged = normalizeSnapshot(snapshotRows.get(users.admin.institution_id), users.admin);

  for (const owner of sourceUsers) {
    const snapshot = normalizeSnapshot(snapshotRows.get(owner.institution_id), owner);
    for (const key of SNAPSHOT_ARRAY_KEYS) {
      merged[key] = mergeArrayByIdentity(merged[key], snapshot[key]);
    }
  }

  const existingAssignedClassName = merged.children.find(
    (child) =>
      child &&
      typeof child === "object" &&
      typeof child.className === "string" &&
      child.className.trim() &&
      child.className !== DEFAULT_PARENT_CHILD_CLASS_NAME
  )?.className;
  // “待分班”只用于新建家庭空间占位；三账号联调时应落到可协作的真实班级。
  const className =
    process.env.SAMPLE_CLASS_NAME?.trim() ||
    existingAssignedClassName ||
    DEFAULT_SAMPLE_CLASS_NAME;
  const classId = process.env.SAMPLE_CLASS_ID?.trim() || stableClassId(users.admin.institution_id, className);
  merged.children = merged.children.map((child) =>
    child && typeof child === "object"
      ? {
          ...child,
          institutionId: users.admin.institution_id,
          classId,
          className,
        }
      : child
  );
  merged.updatedAt = new Date().toISOString();
  merged.meta = {
    ...merged.meta,
    workspace: {
      ...merged.meta?.workspace,
      kind: "institution",
      institutionId: users.admin.institution_id,
      ownerUserId: users.admin.id,
      ownerRole: users.admin.role,
      isDemo: false,
    },
  };

  const childIds = new Set(merged.children.map((child) => child?.id).filter(Boolean));
  const parentChildIds = unique([
    ...decodeChildIds(users.parent.child_ids),
    ...merged.children
      .filter((child) => child && typeof child === "object" && child.parentUserId === users.parent.id)
      .map((child) => child.id),
  ]).filter((childId) => childIds.has(childId));
  merged.children = merged.children.map((child) =>
    child && typeof child === "object" && parentChildIds.includes(child.id)
      ? { ...child, parentUserId: users.parent.id }
      : child
  );

  const teacherIndex = merged.teachers.findIndex(
    (teacher) =>
      teacher &&
      typeof teacher === "object" &&
      (teacher.userId === users.teacher.id ||
        (!teacher.userId && teacher.name === users.teacher.display_name))
  );
  const teacherProfile = {
    teacherId:
      (teacherIndex >= 0 ? merged.teachers[teacherIndex].teacherId : "") ||
      `teacher-account-${users.teacher.id}`,
    userId: users.teacher.id,
    name: users.teacher.display_name,
    institutionId: users.admin.institution_id,
    className,
    createdAt:
      teacherIndex >= 0 && merged.teachers[teacherIndex].createdAt
        ? merged.teachers[teacherIndex].createdAt
        : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (teacherIndex >= 0) {
    merged.teachers[teacherIndex] = {
      ...merged.teachers[teacherIndex],
      ...teacherProfile,
    };
  } else {
    merged.teachers.unshift(teacherProfile);
  }

  return {
    snapshot: merged,
    classId,
    className,
    parentChildIds,
  };
}

async function applyAlignment(pool, users, alignment) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `
        insert into institutions (id, status, created_by)
        values (?, 'active', ?)
        on duplicate key update
          status = 'active',
          updated_at = current_timestamp
      `,
      [users.admin.institution_id, users.admin.id]
    );
    const [existingClassRows] = await connection.execute(
      `
        select id
        from institution_classes
        where institution_id = ? and name = ?
        limit 1
        for update
      `,
      [users.admin.institution_id, alignment.className]
    );
    const classId =
      Array.isArray(existingClassRows) &&
      existingClassRows[0] &&
      typeof existingClassRows[0].id === "string"
        ? existingClassRows[0].id
        : alignment.classId;
    await connection.execute(
      `
        insert into institution_classes (id, institution_id, name, status)
        values (?, ?, ?, 'active')
        on duplicate key update
          name = ?,
          status = 'active',
          updated_at = current_timestamp
      `,
      [
        classId,
        users.admin.institution_id,
        alignment.className,
        alignment.className,
      ]
    );
    const snapshotChildIds = unique(
      alignment.snapshot.children.map((child) =>
        child && typeof child === "object" ? child.id : ""
      )
    );
    if (snapshotChildIds.length > 0) {
      const [registeredChildren] = await connection.execute(
        `
          select child_id, institution_id
          from child_registry
          where child_id in (${placeholders(snapshotChildIds)})
          for update
        `,
        snapshotChildIds
      );
      const collision = Array.isArray(registeredChildren)
        ? registeredChildren.find(
            (row) => row.institution_id !== users.admin.institution_id
          )
        : null;
      if (collision) {
        fail("Child registry collision with another institution; no changes were applied");
      }
    }

    for (const membership of [
      { user: users.admin, classId: null },
      { user: users.teacher, classId },
      { user: users.parent, classId },
    ]) {
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
          values (?, ?, ?, ?, 'active', 1, ?, current_timestamp)
          on duplicate key update
            institution_id = ?,
            role = ?,
            class_id = ?,
            status = 'active',
            authz_version = authz_version + 1,
            updated_at = current_timestamp
        `,
        [
          membership.user.id,
          users.admin.institution_id,
          membership.user.role,
          membership.classId,
          users.admin.id,
          users.admin.institution_id,
          membership.user.role,
          membership.classId,
        ]
      );
    }

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
        values (?, ?, ?, 'active', ?, current_timestamp)
        on duplicate key update
          institution_id = ?,
          class_id = ?,
          status = 'active',
          assigned_by = ?,
          assigned_at = current_timestamp,
          updated_at = current_timestamp
      `,
      [
        users.teacher.id,
        users.admin.institution_id,
        classId,
        users.admin.id,
        users.admin.institution_id,
        classId,
        users.admin.id,
      ]
    );

    for (const child of alignment.snapshot.children) {
      if (!child || typeof child !== "object" || !child.id) continue;
      await connection.execute(
        `
          insert into child_registry (child_id, institution_id, class_id, status, created_by)
          values (?, ?, ?, 'active', ?)
          on duplicate key update
            class_id = if(institution_id = values(institution_id), values(class_id), class_id),
            status = 'active',
            updated_at = current_timestamp
        `,
        [child.id, users.admin.institution_id, classId, users.admin.id]
      );
    }

    for (const childId of alignment.parentChildIds) {
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
            created_by = ?,
            linked_at = current_timestamp,
            updated_at = current_timestamp
        `,
        [
          users.admin.institution_id,
          users.parent.id,
          childId,
          users.admin.id,
          users.admin.id,
        ]
      );
    }

    await connection.execute(
      `
        update app_users
        set institution_id = ?, class_name = ?
        where id = ?
      `,
      [users.admin.institution_id, alignment.className, users.teacher.id]
    );
    await connection.execute(
      `
        update app_users
        set institution_id = ?, child_ids = ?
        where id = ?
      `,
      [users.admin.institution_id, encodeJson(alignment.parentChildIds), users.parent.id]
    );
    if (alignment.parentChildIds.length > 0) {
      await connection.execute(
        `
          update consent_records
          set institution_id = ?
          where user_id = ?
            and child_id in (${placeholders(alignment.parentChildIds)})
        `,
        [
          users.admin.institution_id,
          users.parent.id,
          ...alignment.parentChildIds,
        ]
      );
    }
    alignment.snapshot.children = alignment.snapshot.children.map((child) =>
      child && typeof child === "object" ? { ...child, classId } : child
    );
    const encodedSnapshot = encodeJson(alignment.snapshot);
    await connection.execute(
      `
        insert into app_state_snapshots (institution_id, snapshot, updated_by)
        values (?, ?, ?)
        on duplicate key update
          snapshot = ?,
          updated_by = ?
      `,
      [users.admin.institution_id, encodedSnapshot, users.admin.id, encodedSnapshot, users.admin.id]
    );

    for (const subject of [users.admin, users.teacher, users.parent]) {
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
          values (?, ?, ?, ?, 'sample_account_alignment', ?, current_timestamp)
        `,
        [
          `authz-${randomUUID()}`,
          users.admin.institution_id,
          users.admin.id,
          subject.id,
          encodeJson({
            role: subject.role,
            classId: subject.role === ROLE_ADMIN ? null : classId,
            parentChildCount:
              subject.role === ROLE_PARENT ? alignment.parentChildIds.length : 0,
          }),
        ]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  console.log(`DATABASE_URL ${process.env.DATABASE_URL?.trim() ? "set" : "missing"}`);
  console.log(`DATABASE_SSL ${process.env.DATABASE_SSL?.trim() ? "set" : "missing"}`);
  console.log(`Mode: ${APPLY ? "apply" : "dry-run"}`);

  const config = parseDatabaseConfig();
  const pool = createPool(config);
  try {
    const users = await loadSampleUsers(pool);
    const snapshots = await loadSnapshots(pool, [
      users.admin.institution_id,
      users.teacher.institution_id,
      users.parent.institution_id,
    ]);
    const alignment = buildMergedSnapshot(users, snapshots);

    console.log(
      `Sample accounts: admin=${maskPhone(SAMPLE_ACCOUNTS[0].phone)} teacher=${maskPhone(SAMPLE_ACCOUNTS[1].phone)} parent=${maskPhone(SAMPLE_ACCOUNTS[2].phone)}`
    );
    console.log(`Canonical institution: set`);
    console.log(`Merged children: ${alignment.snapshot.children.length}`);
    console.log(`Parent child scope: ${alignment.parentChildIds.length}`);
    console.log(`Teacher class: set`);

    if (APPLY) {
      await applyAlignment(pool, users, alignment);
      console.log("PASS sample accounts aligned");
    } else {
      console.log("PASS dry-run completed; rerun with --apply to write changes");
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

try {
  await main();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
