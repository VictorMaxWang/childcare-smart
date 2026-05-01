export function createDemoId(prefix: string, now = Date.now()) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }

  return `${prefix}-${now}-${Math.random().toString(36).slice(2, 10)}`;
}
