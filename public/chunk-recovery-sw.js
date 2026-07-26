const CACHE_PREFIX = "smartchildcare-next-chunks-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const FETCH_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith("/_next/static/chunks/")
  ) {
    return;
  }

  event.respondWith(readOrFetchChunk(request));
});

async function readOrFetchChunk(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchBuffered(request);
      if (!response.ok) return response;
      await cache.put(request, response.clone());
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
  }

  throw lastError ?? new Error("Next.js chunk download failed");
}

async function fetchBuffered(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(request, { signal: controller.signal });
    if (!response.ok) return response;

    // 必须完整读取响应体后再交给页面；这样连接在传输中途被重置时才能进入重试。
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    // Fetch 已完成内容解码，重建 Response 时不能保留原压缩声明和压缩后长度。
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    clearTimeout(timeout);
  }
}
