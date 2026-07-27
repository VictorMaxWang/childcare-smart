import assert from "node:assert/strict";
import test from "node:test";

import {
  DashScopeStoryImageProviderError,
  downloadDashScopeStoryImage,
  readDashScopeStoryImageTask,
  resolveDashScopeStoryImageConfig,
  submitDashScopeStoryImageTask,
} from "./dashscope-story-image-provider";

type EnvKey =
  | "DASHSCOPE_API_KEY"
  | "NEXT_STORYBOOK_IMAGE_PROVIDER"
  | "STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT"
  | "STORYBOOK_DASHSCOPE_IMAGE_MODEL"
  | "STORYBOOK_IMAGE_PROVIDER";

function withEnv(
  overrides: Partial<Record<EnvKey, string | undefined>>,
  fn: () => void | Promise<void>
) {
  const previous: Record<EnvKey, string | undefined> = {
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
    NEXT_STORYBOOK_IMAGE_PROVIDER:
      process.env.NEXT_STORYBOOK_IMAGE_PROVIDER,
    STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
      process.env.STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT,
    STORYBOOK_DASHSCOPE_IMAGE_MODEL:
      process.env.STORYBOOK_DASHSCOPE_IMAGE_MODEL,
    STORYBOOK_IMAGE_PROVIDER: process.env.STORYBOOK_IMAGE_PROVIDER,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("DashScope story image submission uses the official async Qwen-Image contract", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "test-dashscope-secret",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_IMAGE_PROVIDER: "mock",
      STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
        "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
      STORYBOOK_DASHSCOPE_IMAGE_MODEL: undefined,
    },
    async () => {
      let requestHeaders = new Headers();
      let requestBody: Record<string, unknown> | null = null;
      const config = resolveDashScopeStoryImageConfig();
      const submitted = await submitDashScopeStoryImageTask(
        {
          prompt: "温暖的儿童绘本插画，孩子在花园里观察蝴蝶",
        },
        {
          fetch: async (_input, init) => {
            requestHeaders = new Headers(init?.headers);
            requestBody = JSON.parse(String(init?.body)) as Record<
              string,
              unknown
            >;
            return Response.json({
              request_id: "request-submit-1",
              output: {
                task_id: "task-image-12345678",
                task_status: "PENDING",
              },
            });
          },
        }
      );

      assert.equal(config.enabled, true);
      assert.equal(config.model, "qwen-image-plus");
      assert.equal(submitted.taskId, "task-image-12345678");
      assert.equal(submitted.status, "pending");
      assert.equal(
        requestHeaders.get("x-dashscope-async"),
        "enable"
      );
      assert.equal(
        requestHeaders.get("authorization"),
        "Bearer test-dashscope-secret"
      );
      const capturedBody = requestBody as Record<string, unknown> | null;
      assert.equal(capturedBody?.model, "qwen-image-plus");
      assert.deepEqual(capturedBody?.parameters, {
        negative_prompt:
          "文字，字幕，水印，标志，界面，畸形手指，恐怖元素，成人内容",
        size: "1328*1328",
        n: 1,
        prompt_extend: true,
        watermark: false,
      });
      assert.doesNotMatch(
        JSON.stringify(submitted),
        /test-dashscope-secret/u
      );
    }
  );
});

test("DashScope submission errors distinguish explicit rejection from an unknown outcome", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "test-dashscope-secret",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
        "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
    },
    async () => {
      await assert.rejects(
        submitDashScopeStoryImageTask(
          { prompt: "rate limited prompt" },
          {
            fetch: async () =>
              Response.json(
                { code: "Throttling", message: "try later" },
                { status: 429 }
              ),
          }
        ),
        (error) => {
          assert.ok(error instanceof DashScopeStoryImageProviderError);
          assert.equal(error.stage, "submit");
          assert.equal(error.submissionState, "not-accepted");
          assert.equal(error.retryable, true);
          return true;
        }
      );
      for (const ambiguousStatus of [408, 503]) {
        await assert.rejects(
          submitDashScopeStoryImageTask(
            { prompt: `ambiguous ${ambiguousStatus} prompt` },
            {
              fetch: async () =>
                Response.json(
                  {
                    code: `HTTP_${ambiguousStatus}`,
                    message: "upstream outcome is unknown",
                  },
                  { status: ambiguousStatus }
                ),
            }
          ),
          (error) => {
            assert.ok(error instanceof DashScopeStoryImageProviderError);
            assert.equal(error.stage, "submit");
            assert.equal(error.submissionState, "unknown");
            assert.equal(error.retryable, false);
            return true;
          }
        );
      }
      await assert.rejects(
        submitDashScopeStoryImageTask(
          { prompt: "network outcome prompt" },
          {
            fetch: async () => {
              throw new Error("connection reset");
            },
          }
        ),
        (error) => {
          assert.ok(error instanceof DashScopeStoryImageProviderError);
          assert.equal(error.stage, "submit");
          assert.equal(error.submissionState, "unknown");
          assert.equal(error.retryable, false);
          return true;
        }
      );
    }
  );
});

test("DashScope story image polling maps running, succeeded, and explicit terminal tasks", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "test-dashscope-secret",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_IMAGE_PROVIDER: "mock",
      STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
        "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
    },
    async () => {
      const responses = [
        {
          request_id: "request-poll-1",
          output: {
            task_id: "task-image-12345678",
            task_status: "RUNNING",
          },
        },
        {
          request_id: "request-poll-2",
          output: {
            task_id: "task-image-12345678",
            task_status: "SUCCEEDED",
            results: [
              {
                url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/story.png",
              },
            ],
          },
        },
        {
          request_id: "request-poll-3",
          output: {
            task_id: "task-image-12345678",
            task_status: "FAILED",
            code: "DataInspectionFailed",
            message: "Output data did not pass inspection.",
          },
        },
      ];
      const fetch = async () => Response.json(responses.shift());

      const running = await readDashScopeStoryImageTask(
        { taskId: "task-image-12345678" },
        { fetch }
      );
      const succeeded = await readDashScopeStoryImageTask(
        { taskId: "task-image-12345678" },
        { fetch }
      );
      const failed = await readDashScopeStoryImageTask(
        { taskId: "task-image-12345678" },
        { fetch }
      );
      assert.deepEqual(running, {
        taskId: "task-image-12345678",
        status: "pending",
        imageUrl: null,
        errorCode: null,
        errorMessage: null,
      });
      assert.deepEqual(succeeded, {
        taskId: "task-image-12345678",
        status: "succeeded",
        imageUrl:
          "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/story.png",
        errorCode: null,
        errorMessage: null,
      });
      assert.deepEqual(failed, {
        taskId: "task-image-12345678",
        status: "failed",
        imageUrl: null,
        errorCode: "DataInspectionFailed",
        errorMessage: "Output data did not pass inspection.",
      });
    }
  );
});

test("DashScope polling treats malformed and unknown success responses as ambiguous", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "test-dashscope-secret",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
        "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
    },
    async () => {
      const ambiguousResponses = [
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        Response.json({
          output: {
            task_id: "task-image-12345678",
            task_status: "UNKNOWN",
          },
        }),
        Response.json({
          output: {
            task_id: "task-image-12345678",
            task_status: "QUEUED",
          },
        }),
        Response.json({
          output: {
            task_id: "task-image-12345678",
            task_status: "SUCCEEDED",
            results: [{ url: "https://example.com/untrusted.png" }],
          },
        }),
      ];

      for (const response of ambiguousResponses) {
        await assert.rejects(
          readDashScopeStoryImageTask(
            { taskId: "task-image-12345678" },
            { fetch: async () => response }
          ),
          (error) => {
            assert.ok(
              error instanceof DashScopeStoryImageProviderError
            );
            assert.equal(error.stage, "poll");
            assert.equal(error.retryable, true);
            return true;
          }
        );
      }
    }
  );
});

test("DashScope story image download follows only bounded Aliyun redirects", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "test-dashscope-secret",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_IMAGE_PROVIDER: "mock",
    },
    async () => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      );
      const safeCalls: string[] = [];
      const downloaded = await downloadDashScopeStoryImage(
        {
          imageUrl:
            "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/redirect.png",
        },
        {
          fetch: async (input) => {
            const url = String(input);
            safeCalls.push(url);
            if (safeCalls.length === 1) {
              return new Response(null, {
                status: 302,
                headers: {
                  location:
                    "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/final.png",
                },
              });
            }
            return new Response(png, {
              headers: {
                "content-type": "image/png",
              },
            });
          },
        }
      );

      assert.equal(downloaded.contentType, "image/webp");
      assert.equal(safeCalls.length, 2);

      await assert.rejects(
        downloadDashScopeStoryImage(
          {
            imageUrl:
              "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/redirect.png",
          },
          {
            fetch: async () =>
              new Response(null, {
                status: 302,
                headers: {
                  location: "https://example.com/private-target.png",
                },
              }),
          }
        ),
        /safe Aliyun HTTPS URL/u
      );
    }
  );
});

test("DashScope story image download cancels a lengthless response after the byte limit", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "test-dashscope-secret",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_IMAGE_PROVIDER: "mock",
    },
    async () => {
      let cancelled = false;
      const chunks = [
        new Uint8Array(6 * 1024 * 1024),
        new Uint8Array(5 * 1024 * 1024),
      ];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
        },
        cancel() {
          cancelled = true;
        },
      });

      await assert.rejects(
        downloadDashScopeStoryImage(
          {
            imageUrl:
              "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/large.png",
          },
          {
            fetch: async () =>
              new Response(stream, {
                headers: {
                  "content-type": "image/png",
                },
              }),
          }
        ),
        /source image exceeds the size limit/u
      );
      assert.equal(cancelled, true);
    }
  );
});

test("DashScope story image download accepts only Aliyun HTTPS results and emits bounded WebP", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "test-dashscope-secret",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_IMAGE_PROVIDER: "mock",
    },
    async () => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      );
      const downloaded = await downloadDashScopeStoryImage(
        {
          imageUrl:
            "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/story.png",
        },
        {
          fetch: async () =>
            new Response(png, {
              status: 200,
              headers: {
                "content-type": "image/png",
                "content-length": String(png.byteLength),
              },
            }),
        }
      );

      assert.equal(downloaded.contentType, "image/webp");
      assert.equal(downloaded.bytes.subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(downloaded.bytes.subarray(8, 12).toString("ascii"), "WEBP");
      assert.ok(downloaded.bytes.byteLength > 0);
      assert.ok(downloaded.bytes.byteLength <= 4 * 1024 * 1024);

      await assert.rejects(
        downloadDashScopeStoryImage(
          { imageUrl: "https://example.com/untrusted.png" },
          {
            fetch: async () => {
              throw new Error("untrusted URL must not be fetched");
            },
          }
        ),
        /safe Aliyun HTTPS URL/u
      );
    }
  );
});
