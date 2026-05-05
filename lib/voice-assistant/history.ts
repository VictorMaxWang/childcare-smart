"use client";

import type { AssistantHistoryItem, AssistantRole } from "@/lib/voice-assistant/types";

const MAX_HISTORY_ITEMS = 20;

function historyKey(role: AssistantRole, userId?: string) {
  return `childcare-smart.voice-assistant.history.${role}.${userId ?? "anonymous"}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readAssistantHistory(role: AssistantRole, userId?: string): AssistantHistoryItem[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(historyKey(role, userId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AssistantHistoryItem => {
      return Boolean(item && typeof item === "object" && typeof (item as AssistantHistoryItem).id === "string");
    });
  } catch {
    return [];
  }
}

export function saveAssistantHistoryItem(role: AssistantRole, userId: string | undefined, item: AssistantHistoryItem) {
  if (!canUseStorage()) return [];
  const next = [item, ...readAssistantHistory(role, userId).filter((existing) => existing.id !== item.id)].slice(
    0,
    MAX_HISTORY_ITEMS
  );
  window.localStorage.setItem(historyKey(role, userId), JSON.stringify(next));
  return next;
}

export function clearAssistantHistory(role: AssistantRole, userId?: string) {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(historyKey(role, userId));
}
