"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AgentStreamEventName = "status" | "text" | "ui" | "error" | "done";

export interface AgentStreamEvent<T = unknown> {
  event: AgentStreamEventName;
  data: T;
}

function parseEventBlock(block: string): AgentStreamEvent | null {
  const lines = block.split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return null;

  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");

  if (!eventLine || !dataLine) return null;

  try {
    return {
      event: eventLine.slice(6).trim() as AgentStreamEventName,
      data: JSON.parse(dataLine),
    };
  } catch {
    return {
      event: eventLine.slice(6).trim() as AgentStreamEventName,
      data: dataLine,
    };
  }
}

export function useAgentStream() {
  const controllerRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const start = useCallback(
    async (
      input: {
        url?: string;
        body?: unknown;
        headers?: HeadersInit;
      },
      onEvent: (event: AgentStreamEvent) => void
    ) => {
      stop();

      const controller = new AbortController();
      controllerRef.current = controller;
      setIsStreaming(true);
      const isCurrent = () => controllerRef.current === controller && !controller.signal.aborted;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const cancelReader = () => { void reader?.cancel(controller.signal.reason).catch(() => undefined); };

      try {
        const response = await fetch(input.url ?? "/api/ai/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(input.headers ?? {}),
          },
          body: JSON.stringify(input.body ?? {}),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`stream request failed with status ${response.status}`);
        }

        if (!isCurrent()) {
          await response.body.cancel().catch(() => undefined);
          return;
        }
        reader = response.body.getReader();
        controller.signal.addEventListener("abort", cancelReader, { once: true });
        const decoder = new TextDecoder();
        let buffer = "";

        while (isCurrent()) {
          const { done, value } = await reader.read();
          if (!isCurrent()) return;
          if (done) { buffer += decoder.decode(); break; }

          buffer += decoder.decode(value, { stream: true });
          // 不逐chunk替换CRLF：\r与\n可能分属两个网络片段，必须在累积缓冲区识别边界。
          let separator: RegExpExecArray | null;
          while ((separator = /\r?\n\r?\n/u.exec(buffer))) {
            const chunk = buffer.slice(0, separator.index);
            buffer = buffer.slice(separator.index + separator[0].length);
            const parsed = parseEventBlock(chunk);
            if (!isCurrent()) return;
            if (parsed) onEvent(parsed);
          }
        }

        if (isCurrent() && buffer.trim()) {
          const parsed = parseEventBlock(buffer);
          if (parsed) onEvent(parsed);
        }
      } finally {
        controller.signal.removeEventListener("abort", cancelReader);
        reader?.releaseLock();
        // A被B替换后，A的结束回调不能清空B的取消句柄或修改其加载状态。
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [stop]
  );

  useEffect(() => stop, [stop]);

  return {
    isStreaming,
    start,
    stop,
  };
}
