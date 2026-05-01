import { normalizeAppStateSnapshot, type AppStateSnapshot } from "@/lib/persistence/snapshot";

export function migrateDemoDataSnapshot(value: unknown): AppStateSnapshot | null {
  return normalizeAppStateSnapshot(value);
}
