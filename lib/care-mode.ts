"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export const CARE_MODE_STORAGE_KEY = "smartchildcare.parent.care-mode";

function parseCareModeValue(value: string | null) {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return null;
}

function readStoredCareMode() {
  if (typeof window === "undefined") return null;
  return parseCareModeValue(window.localStorage.getItem(CARE_MODE_STORAGE_KEY));
}

function writeStoredCareMode(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CARE_MODE_STORAGE_KEY, value ? "1" : "0");
}

export function useCareMode() {
  const searchParams = useSearchParams();
  const queryOverride = useMemo(
    () => parseCareModeValue(searchParams.get("care")),
    [searchParams]
  );
  const [storedCareMode, setStoredCareMode] = useState(
    () => readStoredCareMode() ?? false
  );

  useEffect(() => {
    if (queryOverride === null) return;
    writeStoredCareMode(queryOverride);
  }, [queryOverride]);

  const setCareMode = useCallback((nextValue: boolean) => {
    setStoredCareMode(nextValue);
    writeStoredCareMode(nextValue);
  }, []);

  return {
    careMode: queryOverride ?? storedCareMode,
    setCareMode,
    resolvedFromQuery: queryOverride !== null,
  };
}
