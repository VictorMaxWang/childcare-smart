import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { AccountRole } from "@/lib/auth/accounts";
import { isAccountRole } from "@/lib/auth/route-access";
import { getAuthSessionSecret } from "@/lib/auth/session-config";

const COOKIE_NAME = "ccs_session";
const SESSION_AGE_SECONDS = 60 * 60 * 12;

export interface SessionTokenPayload {
  userId: string;
  role?: AccountRole;
}

function sign(payloadBase64: string) {
  return crypto.createHmac("sha256", getAuthSessionSecret()).update(payloadBase64).digest("base64url");
}

function encodePayload(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function buildSessionToken(userId: string, role: AccountRole) {
  const payload = {
    userId,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS,
  };
  const encoded = encodePayload(payload);
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token?: string | null): SessionTokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expected = sign(encodedPayload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }

  const payload = decodePayload<{ userId?: string; role?: unknown; exp?: number }>(encodedPayload);
  if (!payload?.userId || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return {
    userId: payload.userId,
    role: isAccountRole(payload.role) ? payload.role : undefined,
  };
}

export async function getSessionUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const parsed = verifySessionToken(token);
  return parsed?.userId ?? null;
}

export async function setSessionCookie(userId: string, role: AccountRole) {
  const token = buildSessionToken(userId, role);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
