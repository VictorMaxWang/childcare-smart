import assert from "node:assert/strict";
import test from "node:test";
import { fetchSessionState } from "@/lib/persistence/state-client";

test("concurrent snapshot reads share a request but retain independently readable bodies", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json({ ok: true, snapshot: { child: "a" } }); }) as typeof fetch;
  const [first, second] = await Promise.all([fetchSessionState("normal:a:parent", fetcher), fetchSessionState("normal:a:parent", fetcher)]);
  assert.equal(calls, 1); assert.deepEqual(await first.json(), await second.json());
  await fetchSessionState("normal:a:parent", fetcher); assert.equal(calls, 2);
});

test("different signed-in owners never share snapshot requests and rejected requests can be retried", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return Response.json({ ok: true }); }) as typeof fetch;
  await Promise.all([fetchSessionState("normal:one", fetcher), fetchSessionState("normal:two", fetcher)]);
  assert.equal(calls, 2);
  await assert.rejects(fetchSessionState("normal:failed", (async () => { throw new Error("offline"); }) as typeof fetch));
  assert.equal((await fetchSessionState("normal:failed", fetcher)).status, 200);
});
