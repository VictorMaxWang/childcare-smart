import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { AccountRole } from "@/lib/auth/accounts";
import {
  canRoleAccessPath,
  getRequiredRoleForPath,
  isAccountRole,
  resolveUnauthorizedRedirectPath,
  sanitizeNextPath,
} from "@/lib/auth/route-access";
import { getAuthSessionSecret } from "@/lib/auth/session-config";

const SESSION_COOKIE = "ccs_session";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const API_ROUTE_HANDLED_AUTH_PREFIXES = [
  "/api/demo",
  "/api/children",
  "/api/teachers",
  "/api/messages",
  "/api/feedback",
  "/api/records",
  "/api/health-materials",
  "/api/consultations",
  "/api/analytics",
  "/api/weekly-reports",
  "/api/storybooks",
  "/api/attachments",
  "/api/reminders",
  "/api/assignments",
  "/api/ai",
  "/api/voice-assistant",
];
const PUBLIC_ASSET_PREFIXES = ["/demo", "/demo-media", "/vendor"];

function normalizeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=");
}

function base64UrlToBytes(value: string) {
  const binary = atob(normalizeBase64Url(value));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload<T>(value: string): T | null {
  try {
    return JSON.parse(decoder.decode(base64UrlToBytes(value))) as T;
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

async function sign(payloadBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getAuthSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySessionToken(token?: string | null): Promise<{ userId: string; role?: AccountRole } | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const payload = decodePayload<{ userId?: string; role?: unknown; exp?: number }>(encodedPayload);
  if (!payload?.userId || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  try {
    const expectedSignature = await sign(encodedPayload);
    if (!equalBytes(base64UrlToBytes(signature), base64UrlToBytes(expectedSignature))) {
      return null;
    }

    return {
      userId: payload.userId,
      role: isAccountRole(payload.role) ? payload.role : undefined,
    };
  } catch {
    return null;
  }
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function redirectToLogin(request: NextRequest, nextPath?: string | null) {
  const loginUrl = new URL("/login", request.url);
  const sanitizedNextPath = sanitizeNextPath(nextPath);
  if (sanitizedNextPath) {
    loginUrl.searchParams.set("next", sanitizedNextPath);
  }

  const response = NextResponse.redirect(loginUrl);
  clearSessionCookie(response);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    PUBLIC_ASSET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.startsWith("/api/auth") ||
    API_ROUTE_HANDLED_AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname === "/auth/login"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) {
    return redirectToLogin(request, `${pathname}${search}`);
  }

  const requiredRole = getRequiredRoleForPath(pathname);
  if (requiredRole && !session.role) {
    return redirectToLogin(request, `${pathname}${search}`);
  }

  if (session.role && !canRoleAccessPath(session.role, pathname)) {
    const redirectUrl = new URL(resolveUnauthorizedRedirectPath(session.role), request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
