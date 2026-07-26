import type { SessionUser } from "@/lib/auth/accounts";

export type ClientSessionLoadResult =
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated" }
  | { status: "unavailable"; message: string };

type SessionFetcher = () => Promise<Response>;

const DEFAULT_UNAVAILABLE_MESSAGE =
  "暂时无法连接登录服务，请稍后重试。";

/**
 * 读取浏览器会话，并把明确的 401 与可恢复的服务故障分开。
 *
 * 网络错误、5xx 或异常响应不能被解释为退出登录，否则短暂故障会清空前端身份并触发错误跳转。
 */
export async function loadClientSession(
  fetcher: SessionFetcher = () =>
    fetch("/api/auth/session", { cache: "no-store" })
): Promise<ClientSessionLoadResult> {
  try {
    const response = await fetcher();
    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; user?: SessionUser | null; error?: string }
      | null;

    if (response.status === 401) {
      return { status: "unauthenticated" };
    }
    if (!response.ok || !data?.ok || !data.user) {
      return {
        status: "unavailable",
        message:
          typeof data?.error === "string" && data.error.trim()
            ? data.error
            : DEFAULT_UNAVAILABLE_MESSAGE,
      };
    }
    return { status: "authenticated", user: data.user };
  } catch {
    return {
      status: "unavailable",
      message: DEFAULT_UNAVAILABLE_MESSAGE,
    };
  }
}
