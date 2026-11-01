import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function consultationFixture(start: (...args: unknown[]) => Promise<void>, feedback = async (): Promise<unknown[]> => []) {
  const file = new URL("./page.tsx", import.meta.url);
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let actualFunction = "", cleanupSource = "", cancelSource = "", wiredCancel = false;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "runConsultation") actualFunction = node.getText(ast);
    if (ts.isFunctionDeclaration(node) && node.name?.text === "cancelConsultation") cancelSource = node.getText(ast);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("consultationGenerationRef.current += 1")) cleanupSource = node.arguments[0].getText(ast);
    if (ts.isJsxOpeningElement(node) && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "data-testid" && attribute.initializer?.getText(ast).includes("consultation-cancel"))) {
      wiredCancel = node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "onClick" && attribute.initializer?.getText(ast) === "{cancelConsultation}");
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(actualFunction);
  const code = ts.transpileModule(actualFunction + cancelSource + "\nexports.run = runConsultation;" + (cancelSource ? "exports.cancel = cancelConsultation;" : "") + (cleanupSource ? `exports.cleanup = (${cleanupSource})();` : ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const fallbackCalls: unknown[] = [];
  const persistenceCalls: unknown[] = [];
  const sandbox: Record<string, unknown> = { exports: {}, selectedChild: { id: "synthetic-child" }, isStreaming: false, mergedGuardianFeedbacks: [], guardianFeedbacks: [], listApiFeedback: feedback, normalizeGuardianFeedbackCollection: (value: unknown) => value, currentUser: { id: "synthetic-teacher" }, visibleChildren: [], presentChildren: [], healthCheckRecords: [], growthRecords: [], CONSULTATION_CLIENT_FALLBACK_TIMEOUT_MS: 28_000, setTimeout, clearTimeout, DOMException, AbortController, stop() {}, start, runForcedLocalFallback: async (...args: unknown[]) => fallbackCalls.push(args), applyConsultationResult: async (...args: unknown[]) => persistenceCalls.push(args) };
  for (const name of actualFunction.match(/\bset[A-Z]\w+/gu) ?? []) sandbox[name] = () => {};
  for (const name of actualFunction.match(/\b\w+Ref\b/gu) ?? []) sandbox[name] = { current: name === "consultationGenerationRef" ? 0 : false };
  vm.runInNewContext(code, sandbox);
  return { api: sandbox.exports as { run: (form: object) => Promise<void>; cleanup: () => void; cancel: () => void }, fallbackCalls, persistenceCalls, wiredCancel };
}

test("consultation AbortError never starts a fallback or persists another result", async () => {
  const fixture = consultationFixture(async () => { throw new DOMException("page unmounted", "AbortError"); });
  await fixture.api.run({ teacherNote: "合成取消测试" });
  assert.equal(fixture.fallbackCalls.length, 0, "主动取消不得创建备用会诊或写库");
});

test("actual child-change cleanup rejects a late consultation done event", async () => {
  let resolveStream!: () => void;
  let listener!: (event: unknown) => void;
  let streamStarted!: () => void;
  const started = new Promise<void>(resolve => { streamStarted = resolve; });
  const fixture = consultationFixture(async (_input, callback) => { listener = callback as typeof listener; streamStarted(); await new Promise<void>(resolve => { resolveStream = resolve; }); });
  const pending = fixture.api.run({ teacherNote: "合成儿童切换测试" });
  await started;
  fixture.api.cleanup();
  listener({ event: "done", data: { result: { childId: "synthetic-child" } } });
  resolveStream(); await pending;
  assert.equal(fixture.persistenceCalls.length, 0, "旧儿童的迟到事件不能发起写库");
  assert.equal(fixture.fallbackCalls.length, 0);
});

test("the actual cancel button ignores a normally-ended stream and does not generate fallback", async () => {
  let resolveStream!: () => void;
  let streamStarted!: () => void;
  const started = new Promise<void>(resolve => { streamStarted = resolve; });
  const fixture = consultationFixture(async () => { streamStarted(); await new Promise<void>(resolve => { resolveStream = resolve; }); });
  assert.equal(fixture.wiredCancel, true, "必须存在用户可操作的取消按钮并绑定同一handler");
  const pending = fixture.api.run({ teacherNote: "合成主动取消测试" });
  await started; fixture.api.cancel(); resolveStream(); await pending;
  assert.equal(fixture.fallbackCalls.length, 0);
  assert.equal(fixture.persistenceCalls.length, 0);
});

test("cancel during feedback preflight prevents opening the AI stream", async () => {
  let resolveFeedback!: (value: unknown[]) => void;
  let started = 0;
  const fixture = consultationFixture(async () => { started++; }, () => new Promise(resolve => { resolveFeedback = resolve; }));
  const pending = fixture.api.run({ teacherNote: "合成预备取消测试" });
  fixture.api.cancel(); resolveFeedback([]); await pending;
  assert.equal(started, 0);
  assert.equal(fixture.fallbackCalls.length, 0);
});
