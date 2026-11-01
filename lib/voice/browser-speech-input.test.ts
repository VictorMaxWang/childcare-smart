import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

interface NativeRecognition {
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

function speechFixture(options: { constructThrows?: boolean; startThrows?: boolean } = {}) {
  const native: NativeRecognition[] = [];
  const counts = { starts: 0, stops: 0, aborts: 0 };
  const statuses: string[] = [], transcripts: string[] = [], errors: string[] = [];
  const source = fs.readFileSync(new URL("./browser-speech-input.ts", import.meta.url), "utf8");
  const exported: Record<string, (options: object) => { supported: boolean; start: () => void; stop: () => void; abort: () => void; destroy: () => void }> = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  class Recognition {
    onstart = null; onend = null; onresult = null; onerror = null;
    requested = false;
    constructor() { if (options.constructThrows) throw new Error("device construction failed"); native.push(this); }
    start() { counts.starts++; if (this.requested || options.startThrows) throw new DOMException("already started", "InvalidStateError"); this.requested = true; }
    stop() { counts.stops++; if (!this.requested) throw new DOMException("inactive", "InvalidStateError"); }
    abort() { counts.aborts++; this.requested = false; }
  }
  vm.runInNewContext(compiled, { exports: exported, window: { SpeechRecognition: Recognition }, DOMException });
  const create = (extra: object = {}) => exported.createBrowserSpeechRecognizer({ onStatusChange: (status: string) => statuses.push(status), onResult: (result: { transcript: string }) => transcripts.push(result.transcript), onError: (error: string) => errors.push(error), ...extra });
  return { create, native, counts, statuses, transcripts, errors };
}

test("native recognition start is synchronous-requesting and ignores duplicate starts", () => {
  const fixture = speechFixture(); const controller = fixture.create();
  assert.doesNotThrow(() => { controller.start(); controller.start(); });
  assert.equal(fixture.counts.starts, 1);
  assert.equal(fixture.statuses.at(-1), "requesting");
  controller.destroy();
});

test("native recognition construction and start exceptions become recoverable UI errors", () => {
  for (const options of [{ constructThrows: true }, { startThrows: true }]) {
    const fixture = speechFixture(options);
    assert.doesNotThrow(() => { const controller = fixture.create(); controller.start(); controller.destroy(); });
    assert.equal(fixture.statuses.includes("error"), true);
    assert.equal(fixture.errors.length, 1);
  }
});

test("native stop and abort while idle are safe and cannot invoke inactive native stop", () => {
  const fixture = speechFixture(); const controller = fixture.create();
  assert.doesNotThrow(() => { controller.stop(); controller.abort(); controller.destroy(); });
  assert.equal(fixture.counts.stops, 0);
});

test("aborting native recognition invalidates callbacks already queued by the browser", () => {
  const fixture = speechFixture(); const controller = fixture.create(); controller.start();
  const queued = fixture.native.at(-1)!.onresult!;
  controller.abort();
  queued({ results: [{ 0: { transcript: "取消后的迟到语音" }, isFinal: true }] });
  assert.deepEqual(fixture.transcripts, []);
  assert.equal(fixture.statuses.at(-1), "idle");
});

test("a new native session ignores callbacks from its destroyed predecessor", () => {
  const fixture = speechFixture(); const controller = fixture.create(); controller.start();
  const queued = fixture.native.at(-1)!.onerror!;
  controller.abort(); controller.start();
  queued({ error: "network" });
  assert.equal(fixture.errors.length, 0);
  assert.equal(fixture.statuses.at(-1), "requesting");
  controller.destroy();
});

test("native stop preserves the final transcript and allows a new session after onend", () => {
  const fixture = speechFixture(); const controller = fixture.create(); controller.start();
  fixture.native.at(-1)!.onstart!(); controller.stop();
  assert.equal(fixture.statuses.at(-1), "stopping");
  fixture.native.at(-1)!.onresult!({ results: [{ 0: { transcript: "原生浏览器识别结果" }, isFinal: true }] });
  fixture.native.at(-1)!.onend!();
  assert.deepEqual(fixture.transcripts, ["原生浏览器识别结果"]);
  assert.equal(fixture.statuses.at(-1), "idle");
  controller.start(); assert.equal(fixture.counts.starts, 2); controller.destroy();
});

test("a synchronous permission failure releases native start lock for retry", () => {
  const options = { startThrows: true };
  const fixture = speechFixture(options); const controller = fixture.create(); controller.start();
  assert.equal(fixture.statuses.at(-1), "error");
  options.startThrows = false; controller.start();
  assert.equal(fixture.statuses.at(-1), "requesting");
  assert.equal(fixture.counts.starts, 2); controller.destroy();
});

test("the actual VoiceOrb native click handler coalesces pending permission clicks", async () => {
  const fixture = speechFixture();
  const source = fs.readFileSync(new URL("../../components/voice-assistant/VoiceOrb.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("VoiceOrb.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let actual = "";
  function visit(node: ts.Node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "handleVoiceButton") actual = node.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(actual);
  const sandbox: Record<string, unknown> = { exports: {}, speechSupport: { recognitionSupported: true }, speechStatus: "idle", setExpanded() {}, setMinimized() {}, setRecognizedText() {}, setError() {}, setPhase() {}, errorMessage: (error: Error) => error.message, startProviderRecording: async () => {}, stopProviderRecording() {} };
  for (const name of actual.match(/\b\w+Ref\b/gu) ?? []) sandbox[name] = { current: null };
  sandbox.setSpeechStatus = (status: string) => { sandbox.speechStatus = status; };
  sandbox.recognizerRef = { current: fixture.create({ onStatusChange: sandbox.setSpeechStatus }) };
  vm.runInNewContext(ts.transpileModule(actual + "\nexports.click = handleVoiceButton;", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
  const click = (sandbox.exports as { click: () => Promise<void> }).click;
  await Promise.all([click(), click()]);
  assert.equal(fixture.counts.starts, 1);
  (sandbox.recognizerRef as { current: { destroy: () => void } }).current.destroy();
});
