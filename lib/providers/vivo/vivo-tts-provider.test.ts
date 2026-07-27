import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocketServer } from "ws";

import { requestVivoTts } from "./vivo-tts-provider";

test("vivo TTS aborts an active websocket and does not try a fallback profile", async () => {
  const previousEnv = {
    appId: process.env.VIVO_APP_ID,
    appKey: process.env.VIVO_APP_KEY,
    baseUrl: process.env.VIVO_BASE_URL,
  };
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  process.env.VIVO_APP_ID = "test-app-id";
  process.env.VIVO_APP_KEY = "test-app-key";
  process.env.VIVO_BASE_URL = `http://127.0.0.1:${address.port}`;
  const controller = new AbortController();
  let connectionCount = 0;
  let socketClosedResolve: (() => void) | undefined;
  const socketClosed = new Promise<void>((resolve) => {
    socketClosedResolve = resolve;
  });
  server.on("connection", (socket) => {
    connectionCount += 1;
    socket.once("close", () => socketClosedResolve?.());
  });

  try {
    const synthesis = requestVivoTts({
      text: "请记录今天的午餐。",
      signal: controller.signal,
      deadlineAtMs: Date.now() + 5_000,
    });
    await once(server, "connection");
    controller.abort();

    await assert.rejects(synthesis, /aborted|cancelled|deadline/iu);
    await Promise.race([
      socketClosed,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("vivo TTS websocket was not closed")),
          1_000
        );
      }),
    ]);
    assert.equal(connectionCount, 1);
  } finally {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousEnv.appId === undefined) delete process.env.VIVO_APP_ID;
    else process.env.VIVO_APP_ID = previousEnv.appId;
    if (previousEnv.appKey === undefined) delete process.env.VIVO_APP_KEY;
    else process.env.VIVO_APP_KEY = previousEnv.appKey;
    if (previousEnv.baseUrl === undefined) delete process.env.VIVO_BASE_URL;
    else process.env.VIVO_BASE_URL = previousEnv.baseUrl;
  }
});

test("vivo TTS fails before opening a websocket when its deadline is exhausted", async () => {
  await assert.rejects(
    requestVivoTts({
      text: "过期请求",
      deadlineAtMs: Date.now() - 1,
    }),
    /deadline/iu
  );
});

test("vivo TTS never opens a second paid synthesis after a provider rejection", async () => {
  const previousEnv = {
    appId: process.env.VIVO_APP_ID,
    appKey: process.env.VIVO_APP_KEY,
    baseUrl: process.env.VIVO_BASE_URL,
  };
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  process.env.VIVO_APP_ID = "test-app-id";
  process.env.VIVO_APP_KEY = "test-app-key";
  process.env.VIVO_BASE_URL = `http://127.0.0.1:${address.port}`;
  let connectionCount = 0;
  server.on("connection", (socket) => {
    connectionCount += 1;
    socket.once("message", () => {
      socket.send(
        JSON.stringify({
          error_code: 40017,
          error_msg: "voice profile rejected",
          data: { status: 2 },
        })
      );
    });
  });

  try {
    await assert.rejects(
      requestVivoTts({
        text: "只允许一次真实合成调用。",
        deadlineAtMs: Date.now() + 5_000,
      }),
      /voice profile rejected/iu
    );
    assert.equal(connectionCount, 1);
  } finally {
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousEnv.appId === undefined) delete process.env.VIVO_APP_ID;
    else process.env.VIVO_APP_ID = previousEnv.appId;
    if (previousEnv.appKey === undefined) delete process.env.VIVO_APP_KEY;
    else process.env.VIVO_APP_KEY = previousEnv.appKey;
    if (previousEnv.baseUrl === undefined) delete process.env.VIVO_BASE_URL;
    else process.env.VIVO_BASE_URL = previousEnv.baseUrl;
  }
});
