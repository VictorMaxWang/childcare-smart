import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

test("proxy keeps the deployment health endpoint public", async () => {
  const response = await proxy(
    new NextRequest("https://smartchildcare.cn/api/health")
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
