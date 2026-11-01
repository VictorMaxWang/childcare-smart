import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { buildSessionToken } from "./session";

test("anonymous or stale RSC prefetch remains denied without deleting a later authenticated cookie", async () => {
  const requestHeaders: Record<string, string>[] = [{ RSC: "1" }, { "Next-Router-Prefetch": "1" }, { Purpose: "prefetch" }, { "Sec-Purpose": "prefetch;prerender" }];
  for (const headers of requestHeaders) {
    const response = await proxy(new NextRequest("https://www.smartchildcare.cn/parent/onboarding/child", { headers: { ...headers, cookie: "ccs_session=expired.invalid" } }));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
    assert.equal(response.headers.get("x-middleware-next"), null, "预取仍不能访问业务正文");
    assert.equal(response.headers.get("set-cookie"), null, "旧预取晚到不能清除刚登录的新会话");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
  }
});

test("full-document invalid sessions still redirect, clear their invalid cookie and cannot be cached", async () => {
  const response = await proxy(new NextRequest("https://www.smartchildcare.cn/parent/onboarding/child", { headers: { cookie: "ccs_session=expired.invalid" } }));
  assert.equal(response.status, 307); assert.match(response.headers.get("set-cookie") ?? "", /ccs_session=;.*Max-Age=0/u);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
});

test("new parent cookie accesses onboarding while old teacher cookie remains scope-denied", async () => {
  const target = "https://www.smartchildcare.cn/parent/onboarding/child";
  const parent = await proxy(new NextRequest(target, { headers: { RSC: "1", cookie: `ccs_session=${buildSessionToken("synthetic-parent", "家长")}` } }));
  assert.equal(parent.status, 200); assert.equal(parent.headers.get("x-middleware-next"), "1");
  assert.match(parent.headers.get("cache-control") ?? "", /no-store/u);
  const teacher = await proxy(new NextRequest(target, { headers: { RSC: "1", cookie: `ccs_session=${buildSessionToken("synthetic-teacher", "教师")}` } }));
  assert.equal(teacher.status, 307); assert.equal(new URL(teacher.headers.get("location")!).pathname, "/teacher");
  assert.equal(teacher.headers.get("x-middleware-next"), null);
  assert.match(teacher.headers.get("cache-control") ?? "", /no-store/u);
});
