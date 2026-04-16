"use client";

import { useCallback, useRef, useState } from "react";

export type AgentStreamEventName = "status" | "text" | "ui" | "error" | "done";

export interface AgentStreamEvent<T = unknown> {
  event: AgentStreamEventName;
  data: T;
}

function parseEventBlock(block: string): AgentStreamEvent | null {
  const lines = block.split("\n").filter(Boolean);
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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          chunks.forEach((chunk) => {
            const parsed = parseEventBlock(chunk);
            if (parsed) onEvent(parsed);
          });
        }

        if (buffer.trim()) {
          const parsed = parseEventBlock(buffer);
          if (parsed) onEvent(parsed);
        }
      } finally {
        controllerRef.current = null;
        setIsStreaming(false);
      }
    },
    [stop]
  );

  return {
    isStreaming,
    start,
    stop,
  };
}
