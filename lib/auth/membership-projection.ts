import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import { dbQuery } from "@/lib/db/server";
import { logSecurityEvent } from "@/lib/server/security-log";

export interface MembershipAuthorizationProjection {
  institutionId: string;
  role: AccountRole;
  classId?: string;
  className?: string;
  childIds: string[];
  authzVersion: number;
}

function isMissingMembershipTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const errno = (error as { errno?: unknown }).errno;
  return code === "ER_NO_SUCH_TABLE" || errno === 1146;
}

export function applyMembershipProjection(
  session: SessionUser,
  projection: MembershipAuthorizationProjection | null
): SessionUser {
  if (!projection) return session;

  return {
    ...session,
    institutionId: projection.institutionId,
    role: projection.role,
    classId: projection.classId,
    className: projection.className,
    childIds: [...projection.childIds],
    authzVersion: projection.authzVersion,
  };
}

/**
 * 规范关系表存在记录时，它们是授权真相；没有记录时保留旧字段回退，
 * 以便存量账号在逐步迁移期间仍可登录。
 */
export async function loadMembershipProjection(
  userId: string
): Promise<MembershipAuthorizationProjection | null> {
  try {
    const { rows } = await dbQuery<{
      institution_id: string;
      role: AccountRole;
      authz_version: number;
      class_id: string | null;
      class_name: string | null;
    }>(
      `
        select
          membership.institution_id,
          membership.role,
          membership.authz_version,
          coalesce(assignment.class_id, membership.class_id) as class_id,
          class_record.name as class_name
        from institution_memberships membership
        left join teacher_class_assignments assignment
          on assignment.user_id = membership.user_id
         and assignment.institution_id = membership.institution_id
         and assignment.status = 'active'
        left join institution_classes class_record
          on class_record.id = coalesce(assignment.class_id, membership.class_id)
         and class_record.institution_id = membership.institution_id
         and class_record.status = 'active'
        where membership.user_id = ?
          and membership.status = 'active'
        limit 1
      `,
      [userId]
    );
    const row = rows[0];
    if (!row) return null;

    let childIds: string[] = [];
    if (row.role === "家长") {
      const childRows = await dbQuery<{ child_id: string }>(
        `
          select link.child_id
          from guardian_child_links link
          join child_registry child_record
            on child_record.child_id = link.child_id
           and child_record.institution_id = link.institution_id
           and child_record.status = 'active'
          where link.user_id = ?
            and link.institution_id = ?
            and link.status = 'active'
          order by link.created_at asc, link.child_id asc
        `,
        [userId, row.institution_id]
      );
      childIds = childRows.rows.map((item) => item.child_id);
    }

    return {
      institutionId: row.institution_id,
      role: row.role,
      classId: row.class_id || undefined,
      className: row.class_name || undefined,
      childIds,
      authzVersion: Number(row.authz_version) || 1,
    };
  } catch (error) {
    if (isMissingMembershipTable(error)) {
      return null;
    }
    logSecurityEvent("error", "auth.membership_projection.load_failed", { error });
    throw error;
  }
}
