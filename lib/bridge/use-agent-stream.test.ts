import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// 在真实 hook 的调用边界替换 React 调度与网络，验证请求交接；不复制流实现。
function loadHook(fetchImpl: typeof fetch) {
  const state: boolean[] = [];
  const effects: Array<() => unknown> = [];
  const exported: Record<string, () => { start: (input: object, listener: (event: unknown) => void) => Promise<void>; stop: () => void }> = {};
  const compiled = ts.transpileModule(fs.readFileSync(new URL("./use-agent-stream.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: exported, AbortController, TextDecoder, DOMException, fetch: fetchImpl,
    require(name: string) {
      assert.equal(name, "react");
      return { useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, (next: boolean) => state.push(next)], useCallback: (fn: unknown) => fn, useEffect: (fn: () => unknown) => effects.push(fn) };
    },
  });
  return { hook: exported.useAgentStream(), state, effects };
}

test("stream replacement keeps the new controller until its own completion", async () => {
  const requests: Array<{ signal: AbortSignal; reject: (error: Error) => void }> = [];
  const { hook } = loadHook(((_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    const signal = options.signal!;
    signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    requests.push({ signal, reject });
  })) as typeof fetch);
  const first = hook.start({}, () => {}).catch(() => {});
  const second = hook.start({}, () => {}).catch(() => {});
  await first;
  hook.stop();
  const aborted = requests[1].signal.aborted;
  requests[1].reject(new Error("fixture cleanup"));
  await second;
  assert.equal(aborted, true, "旧请求的finally不得清除新请求controller");
});

test("stream parses LF and CRLF across every byte boundary including Chinese UTF-8", async () => {
  for (const newline of ["\n", "\r\n"]) {
    const data = new TextEncoder().encode(`event: status${newline}data: {"message":"正在会诊"}${newline}${newline}event: done${newline}data: {"ok":true}${newline}${newline}`);
    const { hook } = loadHook((async () => new Response(new ReadableStream({ start(controller) { for (const byte of data) controller.enqueue(new Uint8Array([byte])); controller.close(); } }))) as typeof fetch);
    const received: unknown[] = [];
    await hook.start({}, event => received.push(event));
    assert.equal(JSON.stringify(received), JSON.stringify([{ event: "status", data: { message: "正在会诊" } }, { event: "done", data: { ok: true } }]));
  }
});

test("stopped stream cannot deliver a late buffered event", async () => {
  let deliver: ((value: { done: boolean; value?: Uint8Array }) => void) | undefined;
  const { hook } = loadHook((async () => ({ ok: true, body: { getReader: () => ({ read: () => new Promise(resolve => { deliver = resolve; }), cancel: async () => {}, releaseLock() {} }) } })) as unknown as typeof fetch);
  const events: unknown[] = [];
  const pending = hook.start({}, value => events.push(value)).catch(() => {});
  await Promise.resolve();
  hook.stop();
  deliver?.({ done: false, value: new TextEncoder().encode('event: done\ndata: {"ok":true}\n\n') });
  // abort之后不得再次等待reader.read；先让微任务走完再断言，避免挂起测试。
  await Promise.resolve(); await Promise.resolve();
  assert.equal(events.length, 0);
  deliver?.({ done: true });
  await pending;
});
