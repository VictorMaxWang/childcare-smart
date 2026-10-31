const requests = new Map<string, Promise<Response>>();

/** 同一登录作用域的同时刷新合并为一个网络请求；响应克隆避免消费者争用正文。 */
export async function fetchSessionState(namespace: string, fetcher: typeof fetch = fetch) {
  const existing = requests.get(namespace);
  if (existing) return (await existing).clone();
  const request = fetcher("/api/state", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  requests.set(namespace, request);
  try { return (await request).clone(); } finally { if (requests.get(namespace) === request) requests.delete(namespace); }
}
