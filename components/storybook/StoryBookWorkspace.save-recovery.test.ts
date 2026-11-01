import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { ApiClientError } from "@/lib/api/errors";

type Props = Record<string, unknown> & { onGenerate: () => void; onRetry: () => void; onRetrySave?: () => Promise<void>; story?: Record<string, unknown> };
const response = {
  storyId: "synthetic-story", childId: "synthetic-child", mode: "storybook", title: "合成回归绘本", source: "ai", fallback: false,
  generatedAt: "2026-11-01T01:00:00.000Z", provenanceAttestation: "synthetic-unchanged-signature",
  providerMeta: { provider: "maas", realProvider: true, imageDelivery: "real", audioDelivery: "real" },
  scenes: [{ sceneIndex: 1, imageStatus: "ready", audioStatus: "ready", sceneText: "照护者陪伴观察。", imageUrl: "/api/ai/parent-storybook/media/1111111111111111111111111111111111111111", assetRef: "1111111111111111111111111111111111111111", audioUrl: "/api/ai/parent-storybook/media/2222222222222222222222222222222222222222", audioRef: "2222222222222222222222222222222222222222" }],
};

/** 执行完整 Workspace 的 hooks、生成响应与保存事件；仅替换浏览器/网络边界，不抽取待测分支。 */
async function workspaceHarness(options: { saved?: boolean; failFirstSave?: boolean; firstRead?: "missing" | "saved" | "offline"; scope?: string; storage?: Map<string, string>; timeoutFirstSave?: boolean; failSaveNumber?: number; pendingMediaInitial?: boolean; rejectStorage?: boolean } = {}) {
  const slots: Array<{ value?: unknown; deps?: unknown[]; cleanup?: () => void }> = [];
  let cursor = 0, dirty = true, props: Props;
  const effects: Array<() => void> = [];
  const storage = options.storage ?? new Map<string, string>();
  const calls: { generation: number; reads: number; saves: Array<Record<string, unknown>> } = { generation: 0, reads: 0, saves: [] };
  let saved = options.saved ? { storybookId: response.storyId, childId: response.childId, generatedAt: response.generatedAt, pages: [{ response: structuredClone(response) }] } : null;
  const feed = { child: { id: response.childId, name: "合成儿童" } };
  const owner = { id: options.scope ?? "synthetic-owner", institutionId: "synthetic-institution", accountKind: "normal", authzVersion: 1 };
  const data = {
    currentUser: owner, invalidChildId: false, selectedChildId: response.childId, authorizedChildIds: new Set([response.childId]), authorizedChildren: [feed.child],
    getParentFeed: () => [feed], healthCheckRecords: [], mealRecords: [], growthRecords: [], guardianFeedbacks: [], taskCheckInRecords: [],
    getChildInterventionCard: () => null, getLatestConsultationForChild: () => null,
    storybooks: saved ? [saved] : [], parentHomeData: { storybooks: saved ? [saved] : [] }, saveParentStorybook: () => { throw new Error("ordinary account must use authenticated API"); },
  };
  const different = (left: unknown[] | undefined, right: unknown[] | undefined) => !left || !right || left.length !== right.length || left.some((value, index) => !Object.is(value, right[index]));
  const react = {
    startTransition: (fn: () => void) => fn(),
    useState: (initial: unknown) => {
      const index = cursor++; slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next: unknown) => { const value = typeof next === "function" ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }];
    },
    useRef: (value: unknown) => { const index = cursor++; slots[index] ??= { value: { current: value } }; return slots[index].value; },
    useMemo: (fn: () => unknown, deps: unknown[]) => { const index = cursor++; if (!slots[index] || different(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; },
    useCallback: (fn: () => unknown, deps: unknown[]) => react.useMemo(() => fn, deps),
    useEffect: (fn: () => void | (() => void), deps: unknown[]) => {
      const index = cursor++;
      if (!slots[index] || different(slots[index].deps, deps)) { const old = slots[index]; slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn() || undefined; }); }
    },
  };
  const api = {
    getStorybook: async () => {
      calls.reads++;
      if (options.firstRead === "offline" && calls.reads === 1) throw new TypeError("synthetic offline read");
      if (options.firstRead === "saved" && calls.reads === 1) return { storybookId: response.storyId, childId: response.childId, pages: [{ response: structuredClone(response) }] };
      if (!saved) throw new ApiClientError("not found", "not_found", 404);
      return structuredClone(saved);
    },
    upsertStorybook: async (input: Record<string, unknown>) => {
      calls.saves.push(structuredClone(input));
      if (options.timeoutFirstSave && calls.saves.length === 1) return new Promise(() => {});
      if ((options.failSaveNumber ?? (options.failFirstSave === false ? 0 : 1)) === calls.saves.length) throw new TypeError("synthetic connection interrupted");
      saved = { storybookId: String(input.storybookId), childId: String(input.childId), generatedAt: String(input.generatedAt), pages: [{ response: input.response as typeof response }] };
      return structuredClone(saved);
    }, exportStorybook: async () => ({}), shareStorybook: async () => ({}),
  };
  const agent = {
    DEFAULT_PARENT_STORYBOOK_GENERATION_MODE: "child-personalized", DEFAULT_PARENT_STORYBOOK_PAGE_COUNT: 6, DEFAULT_PARENT_STORYBOOK_STYLE_PRESET: "sunrise-watercolor", DEFAULT_PARENT_STORYBOOK_STYLE_MODE: "preset", PARENT_STORYBOOK_THEME_CHIPS: [],
    resolveParentStoryBookStylePreset: () => "sunrise-watercolor", buildParentStoryBookRequestFromFeed: () => ({ childId: response.childId, snapshot: { child: feed.child } }),
  };
  const caches = { buildParentStoryBookCacheKey: () => "synthetic-cache", hasParentStoryBookMediaFailure: () => false, resolveParentStoryBookMediaPollDelayMs: () => 0, shouldPollParentStoryBookMedia: (story: typeof response) => options.pendingMediaInitial && story.scenes.some(scene => scene.imageStatus === "empty"), shouldBypassParentStoryBookCacheOnFirstLoad: () => false, readParentStoryBookCache: () => null, writeParentStoryBookCache: () => ({ savedAt: 1 }) };
  const modules: Record<string, unknown> = {
    react, "react/jsx-runtime": { jsx: (type: unknown, next: Props) => ({ type, props: next }), jsxs: (type: unknown, next: Props) => ({ type, props: next }) },
    "next/navigation": { usePathname: () => "/parent/storybook", useRouter: () => ({}), useSearchParams: () => params },
    "@/components/parent/StoryBookViewer": { default: () => null }, "@/components/parent/useParentD01Data": { useParentD01Data: () => data, restoreParentStorybookResponse: (book: { pages: Array<{ response: unknown }> }) => book.pages[0].response },
    "@/lib/api/storybooks": api, "@/lib/agent/parent-storybook": agent, "@/lib/agent/parent-storybook-demo-seeds": { resolveParentStoryBookDemoSeedId: () => null, getParentStoryBookDemoSeedPreset: () => null },
    "@/lib/parent/storybook-cache": caches, "@/lib/parent/storybook-provenance": { collectStorybookSourceRecordIds: () => [] },
    "@/lib/storybooks/lin-xiaoyu-bravery": { resolveLinXiaoyuChildId: (id: string) => id }, "@/lib/storybooks/storybook-order": { compareStorybooksByLatestSave: () => 0 },
  };
  // 恢复模块依赖真实 API client；在同一沙箱加载源码，仅将其认证传输边界替换为上面的记录器。
  const load = (filename: string): Record<string, unknown> => {
    const loaded = { exports: {} };
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: (name: string) => { if (!(name in modules)) throw new Error(`unexpected test dependency: ${name}`); return modules[name]; }, window: browserWindow, document: browserDocument, fetch: async (url: string) => {
      assert.ok(["/api/ai/parent-storybook", "/api/ai/parent-storybook/media-status"].includes(url));
      const result = structuredClone(response);
      if (url === "/api/ai/parent-storybook") {
        calls.generation++;
        if (options.pendingMediaInitial) Object.assign(result, { provenanceAttestation: "synthetic-text-only-signature", providerMeta: { ...result.providerMeta, imageDelivery: "mixed", audioDelivery: "mixed" }, scenes: result.scenes.map(scene => ({ ...scene, imageStatus: "empty", audioStatus: "empty", imageUrl: null, assetRef: null, audioUrl: null, audioRef: null })) });
      }
      return { ok: true, json: async () => result };
    }, URL, Headers, AbortController, structuredClone, Date, setTimeout: (fn: () => void, delay: number) => setTimeout(fn, options.timeoutFirstSave && delay === 15_000 ? 1 : delay), clearTimeout, console }, { filename });
    return loaded.exports;
  };
  const params = new URLSearchParams(`child=${response.childId}`);
  const browserWindow = { location: { href: `https://example.invalid/parent/storybook?child=${response.childId}` }, history: { replaceState: () => {} }, setTimeout, clearTimeout,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { if (options.rejectStorage) throw new Error("synthetic quota exceeded"); storage.set(key, value); }, removeItem: (key: string) => storage.delete(key) }, addEventListener: () => {}, removeEventListener: () => {} };
  const browserDocument = { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} };
  modules["@/lib/api/errors"] = { ApiClientError };
  const recoveryFile = path.resolve("lib/parent/storybook-save-recovery.ts");
  if (existsSync(recoveryFile)) modules["@/lib/parent/storybook-save-recovery"] = load(recoveryFile);
  const Component = load(path.resolve("components/storybook/StoryBookWorkspace.tsx")).default as (options: { workspaceRole: string }) => { props: Props };
  function render() { dirty = false; cursor = 0; props = Component({ workspaceRole: "parent" }).props; while (effects.length) effects.shift()!(); }
  async function settle() { for (let turn = 0; turn < 35; turn++) { if (dirty) render(); await new Promise(resolve => setImmediate(resolve)); if (!dirty && !effects.length && turn > 3) break; } return props!; }
  await settle();
  return { calls, storage, get props() { return props!; }, settle, async generate() { props!.onGenerate(); return settle(); }, changeOwner(id: string) { owner.id = id; dirty = true; }, dispose() { for (const slot of slots) slot.cleanup?.(); } };
}

test("generated book exposes a separate save retry and preserves exact signed payload without regenerating", async () => {
  const app = await workspaceHarness();
  try {
    await app.generate();
    assert.equal(app.calls.generation, 1);
    assert.equal(app.calls.saves.length, 1);
    assert.equal(typeof app.props.onRetrySave, "function", "a generated but unsaved book needs an actual save retry action");
    await app.props.onRetrySave!(); await app.settle();
    assert.equal(app.calls.generation, 1);
    assert.equal(app.calls.saves.length, 2);
    assert.deepEqual(app.calls.saves[1], app.calls.saves[0]);
    assert.deepEqual(app.calls.saves[1].response, response);
    assert.equal(app.props.onRetrySave, undefined);
  } finally { app.dispose(); }
});

test("refreshing an already saved cross-role book remains read-only", async () => {
  const app = await workspaceHarness({ saved: true });
  try { app.props.onRetry(); await app.settle(); assert.equal(app.calls.generation, 0); assert.equal(app.calls.saves.length, 0); assert.equal(app.props.onRetrySave, undefined); }
  finally { app.dispose(); }
});

test("unknown save recovery waits for a successful exact read before another POST", async () => {
  const app = await workspaceHarness({ firstRead: "offline" });
  try {
    await app.generate();
    assert.equal(app.calls.saves.length, 1);
    assert.equal(app.calls.reads, 1);
    assert.equal(typeof app.props.onRetrySave, "function");
    await app.props.onRetrySave!(); await app.settle();
    assert.equal(app.calls.reads, 2);
    assert.equal(app.calls.saves.length, 2);
    assert.equal(app.calls.generation, 1);
  } finally { app.dispose(); }
});

test("a timed out save that committed is confirmed by exact GET without another POST", async () => {
  const app = await workspaceHarness({ timeoutFirstSave: true, firstRead: "saved" });
  try {
    await app.generate(); await new Promise(resolve => setTimeout(resolve, 10)); await app.settle();
    assert.equal(app.calls.saves.length, 1);
    assert.equal(app.calls.reads, 1);
    assert.equal(app.calls.generation, 1);
    assert.equal(app.props.onRetrySave, undefined);
  } finally { app.dispose(); }
});

test("double clicking save retry joins the existing attempt and keeps one stable book id", async () => {
  const app = await workspaceHarness();
  try {
    await app.generate();
    const retry = app.props.onRetrySave!;
    await Promise.all([retry(), retry()]); await app.settle();
    assert.equal(app.calls.saves.length, 2);
    assert.ok(app.calls.saves.every(input => input.storybookId === response.storyId));
    assert.equal(app.calls.generation, 1);
  } finally { app.dispose(); }
});

test("refresh restores only the same owner's unsaved result and does not auto POST", async () => {
  const first = await workspaceHarness();
  await first.generate(); const storage = first.storage; first.dispose();
  const restored = await workspaceHarness({ storage });
  try {
    assert.equal(restored.calls.generation, 0); assert.equal(restored.calls.saves.length, 0);
    assert.equal(typeof restored.props.onRetrySave, "function");
    // VM 中 JSON.parse 的对象原型来自另一 realm；比较完整 JSON 值，不因原型身份误报。
    assert.deepEqual(JSON.parse(JSON.stringify(restored.props.story)), response);
    await restored.props.onRetrySave!(); await restored.settle();
    assert.equal(restored.calls.generation, 0); assert.equal(restored.calls.saves.length, 1);
  } finally { restored.dispose(); }
  const other = await workspaceHarness({ storage, scope: "synthetic-other-owner" });
  try { assert.equal(other.props.onRetrySave, undefined); assert.equal(other.calls.generation, 0); assert.equal(other.calls.saves.length, 0); }
  finally { other.dispose(); }
});

test("switching accounts invalidates a previously captured retry handler", async () => {
  const app = await workspaceHarness();
  try {
    await app.generate(); const oldRetry = app.props.onRetrySave!;
    app.changeOwner("synthetic-other-owner"); await app.settle();
    assert.equal(app.props.onRetrySave, undefined);
    await oldRetry(); await app.settle();
    assert.equal(app.calls.saves.length, 1);
    assert.equal(app.calls.generation, 1);
  } finally { app.dispose(); }
});

test("failed media completion save can advance an older saved text-only book without regenerating", async () => {
  const app = await workspaceHarness({ pendingMediaInitial: true, failSaveNumber: 2 });
  try {
    await app.generate(); await new Promise(resolve => setTimeout(resolve, 10)); await app.settle();
    assert.equal(app.calls.saves.length, 2);
    assert.equal(typeof app.props.onRetrySave, "function");
    assert.match(String(app.props.refreshMessage), /服务端尚未保存|暂时无法确认/u);
    await app.props.onRetrySave!(); await app.settle();
    assert.equal(app.calls.saves.length, 3, "known older text-only response must allow submitting the signed media completion");
    assert.deepEqual(app.calls.saves[2], app.calls.saves[1]);
    assert.equal(app.calls.generation, 1);
    assert.equal(app.props.onRetrySave, undefined);
  } finally { app.dispose(); }
});

test("session storage quota failures keep a retry and warn against closing the page", async () => {
  const app = await workspaceHarness({ rejectStorage: true });
  try { await app.generate(); assert.equal(typeof app.props.onRetrySave, "function"); assert.match(String(app.props.refreshMessage), /浏览器无法暂存.*关闭或刷新页面.*请保留当前页面/u); }
  finally { app.dispose(); }
});
