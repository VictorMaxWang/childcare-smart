import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/account-server";
import {
  isAuthorizedParentChildId,
  isParentSessionUser,
} from "@/lib/persistence/state-scope";

const UNAUTHORIZED_ERROR = "未登录。";
const FORBIDDEN_ROLE_ERROR = "当前账号无权访问家长接口。";
const FORBIDDEN_CHILD_ERROR = "当前账号无权访问该孩子的数据。";

export async function requireParentChildAccess(childId: string | null | undefined) {
  const user = await getCurrentSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: UNAUTHORIZED_ERROR }, { status: 401 }),
    };
  }

  if (!isParentSessionUser(user)) {
    return {
      user,
      response: NextResponse.json({ error: FORBIDDEN_ROLE_ERROR }, { status: 403 }),
    };
  }

  if (!isAuthorizedParentChildId(user, childId)) {
    return {
      user,
      response: NextResponse.json({ error: FORBIDDEN_CHILD_ERROR }, { status: 403 }),
    };
  }

  return { user, response: null };
}
