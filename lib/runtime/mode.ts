export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isForceMockMode() {
  const value = String(process.env.NEXT_PUBLIC_FORCE_MOCK_MODE ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isSupabaseRuntimeEnabled() {
  return hasSupabaseEnv() && !isForceMockMode();
}

export function getRuntimeMode(): "supabase" | "mock" {
  return isSupabaseRuntimeEnabled() ? "supabase" : "mock";
}
