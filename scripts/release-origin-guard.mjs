import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

const INSTALLED_GUARD = Symbol.for(
  "childcare-smart.release-pinned-origin-guard"
);

export function normalizePinnedOrigin(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!new Set(["http:", "https:"]).has(url.protocol)) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function requestOptionsToUrl(defaultProtocol, options) {
  const protocol = String(options?.protocol || defaultProtocol);
  if (!new Set(["http:", "https:"]).has(protocol)) {
    throw new Error(`Unsupported request protocol: ${protocol}`);
  }
  if (options?.socketPath) {
    throw new Error("Socket-path HTTP requests are outside the pinned origin.");
  }
  if (options?.host) {
    return new URL(`${protocol}//${options.host}`);
  }
  const rawHostname = String(options?.hostname ?? "").trim();
  if (!rawHostname) {
    throw new Error("Unable to resolve the HTTP request destination.");
  }
  const hostname =
    rawHostname.includes(":") && !rawHostname.startsWith("[")
      ? `[${rawHostname}]`
      : rawHostname;
  const port = String(options?.port ?? "").trim();
  return new URL(`${protocol}//${hostname}${port ? `:${port}` : ""}`);
}

function requestArgumentToUrl(defaultProtocol, input) {
  if (input instanceof URL) return new URL(input.href);
  if (typeof input === "string") return new URL(input);
  return requestOptionsToUrl(defaultProtocol, input);
}

export function assertPinnedRequestUrl(input, pinnedOrigin) {
  const allowedOrigin = normalizePinnedOrigin(pinnedOrigin);
  if (!allowedOrigin) {
    throw new Error("RELEASE_PINNED_ORIGIN must be an absolute HTTP(S) origin.");
  }
  const requestUrl = input instanceof URL ? input : new URL(String(input));
  if (requestUrl.origin !== allowedOrigin) {
    throw new Error(
      `Release smoke blocked a request outside pinned origin: ${requestUrl.origin}`
    );
  }
  return requestUrl;
}

/**
 * 预加载到 Playwright CLI 和 worker，阻止 Node API 客户端绕过固定 deployment origin。
 */
export function installPinnedOriginGuard(pinnedOrigin) {
  const normalizedOrigin = normalizePinnedOrigin(pinnedOrigin);
  if (!normalizedOrigin) {
    throw new Error("RELEASE_PINNED_ORIGIN is invalid.");
  }
  if (globalThis[INSTALLED_GUARD]) {
    if (globalThis[INSTALLED_GUARD] !== normalizedOrigin) {
      throw new Error("The release origin guard cannot be repinned at runtime.");
    }
    return normalizedOrigin;
  }

  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;
  const originalFetch = globalThis.fetch;

  http.request = function guardedHttpRequest(...args) {
    assertPinnedRequestUrl(
      requestArgumentToUrl("http:", args[0]),
      normalizedOrigin
    );
    return Reflect.apply(originalHttpRequest, this, args);
  };
  http.get = function guardedHttpGet(...args) {
    assertPinnedRequestUrl(
      requestArgumentToUrl("http:", args[0]),
      normalizedOrigin
    );
    return Reflect.apply(originalHttpGet, this, args);
  };
  https.request = function guardedHttpsRequest(...args) {
    assertPinnedRequestUrl(
      requestArgumentToUrl("https:", args[0]),
      normalizedOrigin
    );
    return Reflect.apply(originalHttpsRequest, this, args);
  };
  https.get = function guardedHttpsGet(...args) {
    assertPinnedRequestUrl(
      requestArgumentToUrl("https:", args[0]),
      normalizedOrigin
    );
    return Reflect.apply(originalHttpsGet, this, args);
  };
  if (typeof originalFetch === "function") {
    globalThis.fetch = function guardedFetch(input, init = {}) {
      const requestUrl =
        input instanceof Request ? new URL(input.url) : new URL(String(input));
      assertPinnedRequestUrl(requestUrl, normalizedOrigin);
      // Undici 内部跟随重定向不会再次经过 global fetch，因此这里直接禁止重定向。
      return Reflect.apply(originalFetch, globalThis, [
        input,
        { ...init, redirect: "error" },
      ]);
    };
  }

  globalThis[INSTALLED_GUARD] = normalizedOrigin;
  syncBuiltinESMExports();
  return normalizedOrigin;
}

if (process.env.RELEASE_REQUIRE_PINNED_ORIGIN_GUARD === "1") {
  installPinnedOriginGuard(process.env.RELEASE_PINNED_ORIGIN);
}
