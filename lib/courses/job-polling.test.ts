import assert from "node:assert/strict";
import test from "node:test";
import { CourseJobReadError, courseJobStorageKey, startCourseJobPolling, type CoursePollingRuntime } from "./job-polling";
import type { CourseRecommendationJob } from "./types";

const running: CourseRecommendationJob = { jobId: "existing-job", requestId: "original-intent", childId: "child-a", status: "running", result: null, error: null, createdAt: "2026-11-01T00:00:00Z", expiresAt: "2026-11-02T00:00:00Z" };
function fixture(read: (signal: AbortSignal) => Promise<CourseRecommendationJob>) {
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let serial = 0, online = true, visible = true, wake = () => {};
  const jobs: CourseRecommendationJob[] = [], errors: (string | null)[] = [], reads: string[] = [];
  const runtime: CoursePollingRuntime = { isOnline: () => online, isVisible: () => visible, setTimer(callback, delay) { const id = ++serial; timers.set(id, { callback, delay }); return id; }, clearTimer(id) { timers.delete(id as number); }, subscribe(callback) { wake = callback; return () => { wake = () => {}; }; } };
  const task = startCourseJobPolling({ jobId: running.jobId, childId: running.childId, runtime, readJob: (id, signal) => { reads.push(id); return read(signal); }, onJob: job => jobs.push(job), onError: error => errors.push(error) });
  return { task, jobs, errors, reads, timers, async tick() { const [id, item] = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0] ?? []; assert.ok(item, "expected a scheduled status read"); timers.delete(id); item.callback(); await Promise.resolve(); await Promise.resolve(); }, wake: () => wake(), online: (value: boolean) => { online = value; }, visible: (value: boolean) => { visible = value; } };
}
test("one failed status GET retries the same job, then stops when its existing result completes", async () => {
  let count = 0;
  const f = fixture(async () => { if (++count === 1) throw new Error("offline"); return { ...running, status: "completed" }; });
  await f.tick();
  assert.deepEqual([...f.timers.values()].map(item => item.delay), [5000]);
  await f.tick();
  assert.deepEqual(f.reads, ["existing-job", "existing-job"]);
  assert.equal(f.jobs[0].status, "completed"); assert.equal(f.timers.size, 0); assert.equal(f.errors.at(-1), null);
  f.task.stop();
});
test("repeated failures pause after five reads; manual refresh resumes GET without creating a job", async () => {
  const f = fixture(async () => { throw new Error("connection interrupted"); });
  for (let index = 0; index < 5; index++) await f.tick();
  assert.equal(f.reads.length, 5); assert.equal(f.timers.size, 0); assert.match(f.errors.at(-1)!, /暂停/);
  f.task.refresh(); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.reads.length, 6); assert.ok(f.reads.every(id => id === running.jobId));
  f.task.stop(); assert.equal(f.timers.size, 0);
});
test("offline or hidden pages wait, and online/visibility events resume the original job", async () => {
  const f = fixture(async () => running);
  f.online(false); await f.tick(); assert.equal(f.reads.length, 0);
  f.online(true); f.visible(false); f.wake(); await Promise.resolve(); assert.equal(f.reads.length, 0);
  f.visible(true); f.wake(); await Promise.resolve(); await Promise.resolve(); assert.equal(f.reads.length, 1);
  f.task.stop();
});
test("authorization denial and mismatched child do not automatically retry", async () => {
  for (const read of [async () => { throw new CourseJobReadError("denied", 403); }, async () => ({ ...running, childId: "another-child" })]) {
    const f = fixture(read); await f.tick(); f.wake(); await Promise.resolve();
    assert.equal(f.reads.length, 1); assert.equal(f.jobs.length, 0); assert.equal(f.timers.size, 0); f.task.stop();
  }
});
test("switching child or unmounting aborts a pending GET and rejects late results", async () => {
  let finish: ((job: CourseRecommendationJob) => void) | undefined, signal: AbortSignal | undefined;
  const f = fixture(async captured => { signal = captured; return new Promise(resolve => { finish = resolve; }); });
  await f.tick(); f.task.stop(); assert.equal(signal?.aborted, true); finish!(running);
  await Promise.resolve(); await Promise.resolve(); assert.equal(f.jobs.length, 0); assert.equal(f.timers.size, 0);
});
test("a hanging status GET is aborted at its deadline and retried using its original job ID", async () => {
  let signal: AbortSignal | undefined;
  const f = fixture(captured => {
    signal = captured;
    return new Promise((_, reject) => captured.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true }));
  });
  await f.tick(); assert.equal(signal?.aborted, false);
  assert.deepEqual([...f.timers.values()].map(item => item.delay), [10000]);
  await f.tick(); assert.equal(signal?.aborted, true);
  assert.deepEqual([...f.timers.values()].map(item => item.delay), [5000]);
  assert.match(f.errors.at(-1)!, /超时/); f.task.stop();
});
test("recommendation restoration keys isolate institution, user and child", () => {
  const base = courseJobStorageKey("inst-a", "parent-a", "child-a");
  assert.notEqual(base, courseJobStorageKey("inst-b", "parent-a", "child-a"));
  assert.notEqual(base, courseJobStorageKey("inst-a", "parent-b", "child-a"));
  assert.notEqual(base, courseJobStorageKey("inst-a", "parent-a", "child-b"));
});
