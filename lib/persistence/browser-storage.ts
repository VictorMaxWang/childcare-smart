export interface JsonStorageLike {
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StorageWriteFailure {
  key: string;
  error: unknown;
  phase: "serialize" | "write" | "retry";
  quotaExceeded: boolean;
}

export interface StorageWriteOptions {
  onFailure?: (failure: StorageWriteFailure) => void;
}

export function isStorageQuotaExceededError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; name?: unknown };
  return (
    candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

export function writeJsonStorageSafely<T>(
  storage: JsonStorageLike | null | undefined,
  key: string,
  value: T,
  options: StorageWriteOptions = {}
) {
  if (!storage) return false;

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    options.onFailure?.({
      key,
      error,
      phase: "serialize",
      quotaExceeded: false,
    });
    return false;
  }

  try {
    storage.setItem(key, serialized);
    return true;
  } catch (error) {
    const quotaExceeded = isStorageQuotaExceededError(error);
    if (quotaExceeded && typeof storage.removeItem === "function") {
      try {
        storage.removeItem(key);
        storage.setItem(key, serialized);
        return true;
      } catch (retryError) {
        options.onFailure?.({
          key,
          error: retryError,
          phase: "retry",
          quotaExceeded: isStorageQuotaExceededError(retryError),
        });
        return false;
      }
    }

    options.onFailure?.({
      key,
      error,
      phase: "write",
      quotaExceeded,
    });
    return false;
  }
}
