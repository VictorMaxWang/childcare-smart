import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { normalizePinnedOrigin } from "./release-origin-guard.mjs";

function samePinnedOrigin(candidate, pinnedUrl) {
  try {
    return new URL(candidate).origin === pinnedUrl.origin;
  } catch {
    return false;
  }
}

function rejectHttp(response, statusCode, message) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    connection: "close",
  });
  response.end(message);
}

export function createPinnedOriginProxy(pinnedOrigin) {
  const normalizedOrigin = normalizePinnedOrigin(pinnedOrigin);
  if (!normalizedOrigin) {
    throw new Error("Pinned proxy origin must be an absolute HTTP(S) origin.");
  }
  const pinnedUrl = new URL(normalizedOrigin);
  const pinnedPort = Number(
    pinnedUrl.port || (pinnedUrl.protocol === "https:" ? 443 : 80)
  );
  const openSockets = new Set();

  const server = http.createServer((request, response) => {
    let destination;
    try {
      destination = new URL(
        String(request.url ?? ""),
        `${pinnedUrl.protocol}//${request.headers.host || pinnedUrl.host}`
      );
    } catch {
      rejectHttp(response, 400, "Invalid proxy destination.");
      return;
    }
    if (destination.origin !== pinnedUrl.origin) {
      rejectHttp(response, 403, "Destination is outside the pinned origin.");
      return;
    }

    const headers = { ...request.headers, host: destination.host };
    delete headers["proxy-authorization"];
    delete headers["proxy-connection"];
    const transport = destination.protocol === "https:" ? https : http;
    const upstream = transport.request(
      destination,
      {
        method: request.method,
        headers,
        agent: false,
      },
      (upstreamResponse) => {
        const location = upstreamResponse.headers.location;
        if (
          location &&
          !samePinnedOrigin(new URL(location, destination).href, pinnedUrl)
        ) {
          upstreamResponse.resume();
          rejectHttp(
            response,
            502,
            "Upstream redirect escaped the pinned origin."
          );
          return;
        }
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers
        );
        upstreamResponse.pipe(response);
      }
    );
    upstream.on("error", (error) => {
      if (!response.headersSent) {
        rejectHttp(response, 502, `Pinned proxy upstream error: ${error.message}`);
      } else {
        response.destroy(error);
      }
    });
    request.pipe(upstream);
  });

  server.on("connect", (request, clientSocket, head) => {
    let authority;
    try {
      authority = new URL(`http://${request.url}`);
    } catch {
      clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const requestedPort = Number(authority.port || 80);
    if (
      authority.hostname.toLowerCase() !== pinnedUrl.hostname.toLowerCase() ||
      requestedPort !== pinnedPort
    ) {
      clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }

    const upstreamSocket = net.connect(
      { host: pinnedUrl.hostname, port: pinnedPort },
      () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head?.length) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      }
    );
    openSockets.add(clientSocket);
    openSockets.add(upstreamSocket);
    const forgetSockets = () => {
      openSockets.delete(clientSocket);
      openSockets.delete(upstreamSocket);
    };
    clientSocket.once("close", forgetSockets);
    upstreamSocket.once("close", forgetSockets);
    upstreamSocket.once("error", () => {
      clientSocket.destroy();
    });
    clientSocket.once("error", () => {
      upstreamSocket.destroy();
    });
  });

  return {
    origin: normalizedOrigin,
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Pinned origin proxy did not expose a TCP port.");
      }
      return {
        origin: normalizedOrigin,
        port: address.port,
        server: `http://127.0.0.1:${address.port}`,
      };
    },
    async close() {
      for (const socket of openSockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function runProxyChild() {
  const proxy = createPinnedOriginProxy(process.env.RELEASE_PINNED_ORIGIN);
  const ready = await proxy.listen();
  process.send?.({ type: "release-origin-proxy-ready", ...ready });
  const close = async () => {
    await proxy.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  process.once("disconnect", close);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  runProxyChild().catch((error) => {
    process.send?.({
      type: "release-origin-proxy-error",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error(
      `[release-origin-proxy] ${error instanceof Error ? error.message : error}`
    );
    process.exit(1);
  });
}
