import "server-only";

import type { ApiExtendedSnapshot } from "@/lib/api/types";
import type { SessionUser } from "@/lib/auth/accounts";
import type { DatabaseConnection } from "@/lib/db/server";
import { ApiRouteError } from "@/lib/server/api-errors";
import { createApiId } from "@/lib/server/app-data-model";

export type RegistryChild = ApiExtendedSnapshot["children"][number] & {
  archivedAt?: string;
};

function childBindingChanged(
  previous: RegistryChild | undefined,
  current: RegistryChild
) {
  return (
    !previous ||
    previous.classId !== current.classId ||
    previous.className !== current.className ||
    Boolean(previous.archivedAt) !== Boolean(current.archivedAt)
  );
}

/**
 * 在 app_state_snapshots 写入前同步稳定班级与幼儿注册表。
 *
 * 该函数必须与快照保存共用一个数据库事务，防止页面已经显示转班成功，
 * 但教师授权仍命中 child_registry 中的旧班级。
 */
export async function synchronizeChangedChildBindings(
  connection: DatabaseConnection,
  session: SessionUser,
  previousChildren: RegistryChild[],
  snapshot: ApiExtendedSnapshot
) {
  const previousById = new Map(
    previousChildren.map((child) => [child.id, child])
  );

  for (const child of snapshot.children as RegistryChild[]) {
    if (
      child.institutionId !== session.institutionId ||
      !childBindingChanged(previousById.get(child.id), child)
    ) {
      continue;
    }

    const className = child.className.trim();
    if (!className) {
      throw new ApiRouteError("invalid_request", "幼儿档案必须绑定有效班级。");
    }
    const proposedClassId =
      typeof child.classId === "string" && child.classId.trim()
        ? child.classId.trim()
        : createApiId("class");

    await connection.execute(
      `
        insert into institution_classes (id, institution_id, name, status)
        values (?, ?, ?, 'active')
        on duplicate key update
          status = 'active',
          updated_at = current_timestamp
      `,
      [proposedClassId, session.institutionId, className]
    );
    const [classRows] = await connection.execute(
      `
        select id
        from institution_classes
        where institution_id = ? and name = ?
        limit 1
        for update
      `,
      [session.institutionId, className]
    );
    const classRow = Array.isArray(classRows)
      ? (classRows[0] as { id?: unknown } | undefined)
      : undefined;
    if (!classRow || typeof classRow.id !== "string" || !classRow.id) {
      throw new ApiRouteError("server_error", "班级关系同步失败。");
    }

    child.classId = classRow.id;
    await connection.execute(
      `
        insert into child_registry (
          child_id,
          institution_id,
          class_id,
          status,
          created_by
        )
        values (?, ?, ?, ?, ?)
        on duplicate key update
          class_id = if(
            institution_id = values(institution_id),
            values(class_id),
            class_id
          ),
          status = if(
            institution_id = values(institution_id),
            values(status),
            status
          ),
          updated_at = current_timestamp
      `,
      [
        child.id,
        session.institutionId,
        classRow.id,
        child.archivedAt ? "archived" : "active",
        session.id,
      ]
    );
  }
}
