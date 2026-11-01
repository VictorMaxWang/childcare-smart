import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// 提取组件实际注册的清理effect及实际录音函数，注入设备边界；不运行真实麦克风或收费ASR。
function recordingFixture(constructorThrows = false, startThrows = false, deferAsr = false) {
  const file = new URL("./VoiceOrb.tsx", import.meta.url);
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let startSource = "", stopSource = "", cleanupSource = "", cancelSource = "", closeSource = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "startProviderRecording") startSource = node.getText(ast);
    if (ts.isFunctionDeclaration(node) && node.name?.text === "stopProviderRecording") stopSource = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "cancelRecording" && node.initializer && ts.isCallExpression(node.initializer)) cancelSource = `const cancelRecording = ${node.initializer.arguments[0].getText(ast)};`;
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && /recorder\.onstop = null|cancelRecording\(\)/u.test(node.arguments[0]?.getText(ast) ?? "")) cleanupSource = node.arguments[0].getText(ast);
    if (ts.isJsxOpeningElement(node) && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "aria-label" && attribute.initializer?.getText(ast).includes("关闭语音助手"))) {
      const click = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "onClick");
      if (click && ts.isJsxAttribute(click) && click.initializer && ts.isJsxExpression(click.initializer)) closeSource = click.initializer.expression?.getText(ast) ?? "";
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(startSource && cleanupSource, "必须调用真实组件录音入口与effect清理");
  const code = ts.transpileModule(`${cancelSource}\n${startSource}\n${stopSource}\nexports.start = startProviderRecording; exports.stop = stopProviderRecording; exports.close = ${closeSource}; exports.cleanup = (${cleanupSource})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let resolveMedia!: (stream: unknown) => void;
  const mediaPromise = new Promise(resolve => { resolveMedia = resolve; });
  const observed = { starts: 0, stops: 0, mediaRequests: 0, conversions: 0, asrCalls: 0, commandCalls: 0, errors: [] as string[] };
  let resolveAudio!: (audio: Blob) => void;
  const normalizedAudio = new Promise<Blob>(resolve => { resolveAudio = resolve; });
  let resolveAsr!: (value: { transcript: string }) => void;
  let markAsrStarted!: () => void;
  let asrSignal: AbortSignal | undefined;
  const asrResult = new Promise<{ transcript: string }>(resolve => { resolveAsr = resolve; });
  const asrStarted = new Promise<void>(resolve => { markAsrStarted = resolve; });
  let recorder: { ondataavailable?: ((event: { data: Blob }) => void) | null; onstop?: (() => unknown) | null } | undefined;
  const captureRecorder = (value: NonNullable<typeof recorder>) => { recorder = value; };
  let stopped: Promise<unknown> = Promise.resolve();
  const stream = { getTracks: () => [{ stop() { observed.stops++; } }] };
  const sandbox: Record<string, unknown> = {
    exports: {}, activeChildId: "synthetic-child", speechSupport: { recordingSupported: true }, navigator: { mediaDevices: { getUserMedia: () => { observed.mediaRequests++; return mediaPromise; } } },
    window: { clearTimeout() {}, setTimeout: () => 1 }, VOICE_AUDIO_MAX_DURATION_MS: 90_000, VOICE_AUDIO_MAX_BYTES: 4 * 1024 * 1024, Date, AbortController, Blob, FormData, File,
    MediaRecorder: class { state = "inactive"; onstop: (() => unknown) | null = null; ondataavailable: ((event: { data: Blob }) => void) | null = null; constructor() { if (constructorThrows) throw new Error("unsupported recorder"); captureRecorder(this); } start() { if (startThrows) throw new Error("start failed"); this.state = "recording"; observed.starts++; } stop() { this.state = "inactive"; stopped = Promise.resolve(this.onstop?.()); } },
    normalizeRecordedAudioForAsr: () => { observed.conversions++; return normalizedAudio; }, transcribeVoiceAssistantAudio: async (_form: unknown, signal: AbortSignal) => { observed.asrCalls++; asrSignal = signal; markAsrStarted(); return deferAsr ? asrResult : { transcript: "合成结果" }; }, submitText: async () => { observed.commandCalls++; },
    errorMessage: (error: Error) => error.message, setError: (message: string) => observed.errors.push(message), setPhase() {}, setSpeechStatus() {}, setExpanded() {}, setMinimized() {}, setRecognizedText() {}, setText() {},
  };
  for (const name of source.match(/\b\w+Ref\b/gu) ?? []) sandbox[name] = { current: name === "recordingGenerationRef" ? 0 : name === "recordingPendingRef" ? false : null };
  vm.runInNewContext(code, sandbox);
  return { observed, resolveMedia: () => resolveMedia(stream), resolveAudio: () => resolveAudio(new Blob(["synthetic wav"], { type: "audio/wav" })), feedAudio: () => recorder?.ondataavailable?.({ data: new Blob(["audio"]) }), waitForStop: () => stopped, waitForAsr: () => asrStarted, resolveAsr: () => resolveAsr({ transcript: "迟到的合成转写" }), asrWasAborted: () => asrSignal?.aborted, api: sandbox.exports as { start: () => Promise<void>; cleanup: () => void; close: () => void; stop: () => void } };
}

test("late microphone permission after unmount immediately releases the stream", async () => {
  const fixture = recordingFixture();
  const pending = fixture.api.start();
  fixture.api.cleanup();
  fixture.resolveMedia();
  await pending;
  assert.equal(fixture.observed.starts, 0);
  assert.equal(fixture.observed.stops, 1);
});

test("recorder constructor failure releases acquired microphone tracks", async () => {
  const fixture = recordingFixture(true);
  const pending = fixture.api.start(); fixture.resolveMedia(); await pending;
  assert.equal(fixture.observed.stops, 1);
});

test("repeated clicks while permission is pending request a single microphone stream", async () => {
  const fixture = recordingFixture();
  const first = fixture.api.start(); const second = fixture.api.start();
  fixture.resolveMedia(); await Promise.all([first, second]); fixture.api.cleanup();
  assert.equal(fixture.observed.mediaRequests, 1);
  assert.equal(fixture.observed.starts, 1);
});

test("recorder start failure releases the stream and allows another recording", async () => {
  const fixture = recordingFixture(false, true);
  const pending = fixture.api.start(); fixture.resolveMedia(); await pending;
  assert.equal(fixture.observed.stops, 1);
  await fixture.api.start();
  assert.equal(fixture.observed.mediaRequests, 2, "失败后的获取锁必须释放");
});

test("the real close button discards a recording without ASR or command submission", async () => {
  const fixture = recordingFixture();
  const pending = fixture.api.start(); fixture.resolveMedia(); await pending;
  fixture.feedAudio(); fixture.api.close();
  assert.equal(fixture.observed.stops, 1);
  assert.equal(fixture.observed.conversions, 0);
  assert.equal(fixture.observed.asrCalls, 0);
});

test("closing while audio conversion is pending prevents a late ASR upload", async () => {
  const fixture = recordingFixture();
  const pending = fixture.api.start(); fixture.resolveMedia(); await pending;
  fixture.feedAudio(); fixture.api.stop();
  assert.equal(fixture.observed.conversions, 1);
  fixture.api.close(); fixture.resolveAudio();
  await fixture.waitForStop();
  assert.equal(fixture.observed.asrCalls, 0);
  assert.equal(fixture.observed.commandCalls, 0);
});

test("normal stop transcribes once and processes a single command", async () => {
  const fixture = recordingFixture();
  const pending = fixture.api.start(); fixture.resolveMedia(); await pending;
  fixture.feedAudio(); fixture.api.stop(); fixture.resolveAudio();
  await fixture.waitForStop();
  assert.equal(fixture.observed.asrCalls, 1);
  assert.equal(fixture.observed.commandCalls, 1);
});

test("closing during ASR aborts the upload and ignores its late transcript", async () => {
  const fixture = recordingFixture(false, false, true);
  const pending = fixture.api.start(); fixture.resolveMedia(); await pending;
  fixture.feedAudio(); fixture.api.stop(); fixture.resolveAudio();
  await fixture.waitForAsr(); fixture.api.close(); fixture.resolveAsr(); await fixture.waitForStop();
  assert.equal(fixture.asrWasAborted(), true);
  assert.equal(fixture.observed.commandCalls, 0);
});
