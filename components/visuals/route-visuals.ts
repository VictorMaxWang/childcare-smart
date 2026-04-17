import type { RouteVisualProfile } from "@/components/visuals/types";

const ROUTE_VISUAL_PRESETS = {
  scopedStrong: {
    mode: "scoped",
    intensity: "strong",
    tone: "brand",
    interactive: true,
    transition: "cinematic",
  },
  scopedMedium: {
    mode: "scoped",
    intensity: "medium",
    tone: "brand",
    interactive: true,
    transition: "cinematic",
  },
  scopedLight: {
    mode: "scoped",
    intensity: "light",
    tone: "brand",
    interactive: false,
    transition: "cinematic",
  },
  globalDense: {
    mode: "global",
    intensity: "dense",
    tone: "brand",
    interactive: false,
    transition: "cinematic",
  },
  utilityLight: {
    mode: "utility",
    intensity: "light",
    tone: "brand",
    interactive: false,
    transition: "subtle",
  },
} satisfies Record<string, RouteVisualProfile>;

const EXACT_GLOBAL_DENSE_ROUTES = new Set(["/", "/children", "/diet", "/growth", "/health"]);
const EXACT_SCOPED_LIGHT_ROUTES = new Set(["/admin", "/parent", "/teacher", "/teacher/home"]);
const EXACT_SCOPED_STRONG_ROUTES = new Set([
  "/login",
  "/auth/login",
  "/parent/storybook",
  "/teacher/high-risk-consultation",
]);
const PREFIX_SCOPED_MEDIUM_ROUTES = [
  "/admin/agent",
  "/parent/agent",
  "/teacher/agent",
  "/teacher/health-file-bridge",
];

function normalizePathname(pathname?: string | null) {
  if (!pathname) return "/";

  const nextPathname = pathname.split("?")[0]?.split("#")[0] ?? "/";

  if (nextPathname.length > 1 && nextPathname.endsWith("/")) {
    return nextPathname.slice(0, -1);
  }

  return nextPathname || "/";
}

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getRouteVisualProfile(pathname?: string | null): RouteVisualProfile {
  const normalizedPathname = normalizePathname(pathname);

  if (EXACT_SCOPED_STRONG_ROUTES.has(normalizedPathname)) {
    return ROUTE_VISUAL_PRESETS.scopedStrong;
  }

  if (PREFIX_SCOPED_MEDIUM_ROUTES.some((prefix) => matchesPathPrefix(normalizedPathname, prefix))) {
    return ROUTE_VISUAL_PRESETS.scopedMedium;
  }

  if (EXACT_SCOPED_LIGHT_ROUTES.has(normalizedPathname)) {
    return ROUTE_VISUAL_PRESETS.scopedLight;
  }

  if (EXACT_GLOBAL_DENSE_ROUTES.has(normalizedPathname)) {
    return ROUTE_VISUAL_PRESETS.globalDense;
  }

  return ROUTE_VISUAL_PRESETS.utilityLight;
}
