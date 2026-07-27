import assert from "node:assert/strict";
import test from "node:test";

import { VivoProviderError } from "./vivo-errors.ts";
import {
  requestVivoAsr,
  vivoAsrProviderInternals,
} from "./vivo-asr-provider.ts";
import type { VivoRequestOptions } from "./vivo-client.ts";
import { MemoryVivoAsrTaskStore } from "@/lib/server/vivo-asr-task-store";

const REQUIRED_ASR_ENV = {
  VIVO_APP_ID: "app-id",
  VIVO_APP_KEY: "app-key",
  VIVO_BASE_URL: "https://vivo.example.com",
  VIVO_ASR_PACKAGE: "com.example.childcare",
  VIVO_ASR_CLIENT_VERSION: "1.0.0",
  VIVO_ASR_USER_ID: "test-user",
  VIVO_ASR_ENGINE_ID: "fileasrrecorder",
} as const;

async function withAsrEnv(fn: () => Promise<void>) {
  const previous = Object.fromEntries(
    Object.keys(REQUIRED_ASR_ENV).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, REQUIRED_ASR_ENV);
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function buildDurableAsrInput() {
  return {
    attachmentName: "voice.wav",
    audioBytes: Buffer.from("stable-asr-audio"),
    mimeType: "audio/wav",
    operationScope: {
      institutionId: "institution-1",
      userId: "teacher-1",
    },
    deadlineAtMs: Date.now() + 5_000,
  } as const;
}

test("vivo ASR polls until the provider explicitly reports completion", async () => {
  const progress = [35, 100];
  let requests = 0;

  await vivoAsrProviderInternals.waitForProgress(
    "task-1",
    "session-1",
    "request-1",
    { deadlineAtMs: Date.now() + 1_000 },
    async <T>() => {
      const value = progress[Math.min(requests, progress.length - 1)];
      requests += 1;
      return { code: 0, data: { progress: value } } as T;
    },
    1
  );

  assert.equal(requests, 2);
});

test("vivo ASR rejects an unfinished task when the end-to-end deadline expires", async () => {
  let requests = 0;

  await assert.rejects(
    vivoAsrProviderInternals.waitForProgress(
      "task-1",
      "session-1",
      "request-1",
      { deadlineAtMs: Date.now() + 20 },
      async <T>() => {
        requests += 1;
        return { code: 0, data: { progress: 45 } } as T;
      },
      5
    ),
    (error: unknown) => {
      assert.ok(error instanceof VivoProviderError);
      assert.equal(error.failureKind, "request-timeout");
      return true;
    }
  );

  assert.ok(requests >= 1);
});

test("vivo ASR polling propagates caller cancellation", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5);

  await assert.rejects(
    vivoAsrProviderInternals.waitForProgress(
      "task-1",
      "session-1",
      "request-1",
      {
        deadlineAtMs: Date.now() + 1_000,
        signal: controller.signal,
      },
      async <T>() =>
        ({ code: 0, data: { progress: 20 } }) as T,
      100
    ),
    (error: unknown) => {
      assert.ok(error instanceof VivoProviderError);
      assert.equal(error.failureKind, "request-cancelled");
      return true;
    }
  );
});

test("vivo ASR never labels an empty completed result as live", () => {
  const raw = {
    code: 0,
    data: { result: [] },
  };
  const result = vivoAsrProviderInternals.buildResult(raw, "request-1");

  assert.throws(
    () => vivoAsrProviderInternals.assertUsableAsrResult(result, raw),
    /without a usable transcript/u
  );
});

test("vivo ASR resumes the same upstream task after polling times out", async () => {
  await withAsrEnv(async () => {
    const store = new MemoryVivoAsrTaskStore();
    const firstPaths: string[] = [];
    let runCalls = 0;

    await assert.rejects(
      requestVivoAsr(buildDurableAsrInput(), {
        taskStore: store,
        requestJson: async <T>(options: VivoRequestOptions) => {
          firstPaths.push(options.path);
          if (options.path === "/lasr/create") {
            return { code: 0, data: { audio_id: "audio-1" } } as T;
          }
          if (options.path === "/lasr/upload") {
            return { code: 0 } as T;
          }
          if (options.path === "/lasr/run") {
            runCalls += 1;
            return { code: 0, data: { task_id: "task-1" } } as T;
          }
          throw new VivoProviderError("poll timed out", {
            capability: "asr",
            status: "provider-unavailable",
            failureKind: "request-timeout",
          });
        },
      }),
      (error: unknown) =>
        error instanceof VivoProviderError &&
        error.failureKind === "request-timeout"
    );

    const resumedPaths: string[] = [];
    const result = await requestVivoAsr(buildDurableAsrInput(), {
      taskStore: store,
      requestJson: async <T>(options: VivoRequestOptions) => {
        resumedPaths.push(options.path);
        if (options.path === "/lasr/progress") {
          return { code: 0, data: { progress: 100 } } as T;
        }
        if (options.path === "/lasr/result") {
          return {
            code: 0,
            data: { result: [{ onebest: "幼儿午睡后情绪稳定" }] },
          } as T;
        }
        throw new Error(`unexpected resubmission: ${options.path}`);
      },
    });

    assert.equal(result.transcript, "幼儿午睡后情绪稳定");
    assert.equal(runCalls, 1);
    assert.deepEqual(resumedPaths, ["/lasr/progress", "/lasr/result"]);
    assert.deepEqual(firstPaths, [
      "/lasr/create",
      "/lasr/upload",
      "/lasr/run",
      "/lasr/progress",
    ]);

    let replayCalls = 0;
    const replay = await requestVivoAsr(buildDurableAsrInput(), {
      taskStore: store,
      requestJson: async () => {
        replayCalls += 1;
        throw new Error("ready result must be served from the ledger");
      },
    });
    assert.equal(replay.transcript, result.transcript);
    assert.equal(replayCalls, 0);
  });
});

test("vivo ASR never repeats a run request after an ambiguous outcome", async () => {
  await withAsrEnv(async () => {
    const store = new MemoryVivoAsrTaskStore();
    let runCalls = 0;
    const requestJson = async <T>(options: VivoRequestOptions) => {
      if (options.path === "/lasr/create") {
        return { code: 0, data: { audio_id: "audio-2" } } as T;
      }
      if (options.path === "/lasr/upload") return { code: 0 } as T;
      if (options.path === "/lasr/run") {
        runCalls += 1;
        throw new VivoProviderError("run response timed out", {
          capability: "asr",
          status: "provider-unavailable",
          failureKind: "request-timeout",
        });
      }
      throw new Error(`unexpected request: ${options.path}`);
    };

    await assert.rejects(
      requestVivoAsr(buildDurableAsrInput(), {
        taskStore: store,
        requestJson,
      }),
      /run response timed out/u
    );
    await assert.rejects(
      requestVivoAsr(buildDurableAsrInput(), {
        taskStore: store,
        requestJson,
      }),
      /automatic resubmission was suppressed/u
    );
    assert.equal(runCalls, 1);
  });
});
