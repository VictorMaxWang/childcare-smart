import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { isPublicPagePath } from "./route-access";

test("proxy keeps the deployment health endpoint public", async () => {
  const response = await proxy(
    new NextRequest("https://smartchildcare.cn/api/health")
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});

test("proxy keeps the chunk recovery worker public before login", async () => {
  const response = await proxy(
    new NextRequest("https://smartchildcare.cn/chunk-recovery-sw.js")
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});

test("proxy still protects business state from anonymous requests", async () => {
  const response = await proxy(
    new NextRequest("https://smartchildcare.cn/api/state")
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://smartchildcare.cn/login"
  );
});

test("public document and authentication paths are exact and consistent before any session", async () => {
  for (const pathname of ["/privacy", "/terms", "/login", "/auth/login", "/register", "/auth/register"]) {
    assert.equal(isPublicPagePath(`${pathname}?from=registration#policy`), true);
    const response = await proxy(new NextRequest(`https://smartchildcare.cn${pathname}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
  }
});

test("public page prefixes never expose anonymous business paths or role areas", async () => {
  for (const pathname of ["/", "/children", "/parent", "/teacher", "/admin", "/privacy/private", "/terms-private", "/auth/login/private"]) {
    assert.equal(isPublicPagePath(pathname), false);
    const response = await proxy(new NextRequest(`https://smartchildcare.cn${pathname}`));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
    assert.equal(response.headers.get("x-middleware-next"), null);
  }
});
