import manifestSource from "../../public/demo-media/manifest.json";

export type DemoMediaCategory = "meals" | "health-materials" | "growth" | "storybooks";

type DemoMediaAsset = {
  id?: string;
  kind?: string;
  category?: string;
  src?: string;
  path?: string;
  fallbackPath?: string;
  safetyStatus?: string;
  syntheticDemo?: boolean;
};

type DemoMediaManifest = {
  fallbacks?: {
    default?: string;
    meal?: string;
    healthMaterial?: string;
    growth?: string;
    storybook?: string;
  };
  assets?: DemoMediaAsset[];
};

const manifest = manifestSource as DemoMediaManifest;

const CATEGORY_BY_KIND: Record<string, DemoMediaCategory | undefined> = {
  meal: "meals",
  "health-material": "health-materials",
  growth: "growth",
  storybook: "storybooks",
};

export const DEMO_MEDIA_FALLBACKS = {
  default: manifest.fallbacks?.default ?? "/demo-media/placeholders/demo-placeholder.svg",
  meal: manifest.fallbacks?.meal ?? "/demo-media/meals/demo-meal-placeholder.svg",
  health:
    manifest.fallbacks?.healthMaterial ??
    "/demo-media/health-materials/demo-health-material-placeholder.svg",
  growth: manifest.fallbacks?.growth ?? "/demo-media/growth/demo-growth-placeholder.svg",
  storybook: manifest.fallbacks?.storybook ?? "/demo-media/storybooks/demo-storybook-placeholder.svg",
} as const;

function normalizeCategory(asset: DemoMediaAsset): DemoMediaCategory | undefined {
  if (
    asset.category === "meals" ||
    asset.category === "health-materials" ||
    asset.category === "growth" ||
    asset.category === "storybooks"
  ) {
    return asset.category;
  }
  return CATEGORY_BY_KIND[String(asset.kind ?? "")];
}

function publicPathFor(asset: DemoMediaAsset) {
  const value = asset.src ?? asset.path ?? "";
  return value.startsWith("/") ? value : "";
}

function stableIndex(key: string, length: number) {
  if (length <= 1) return 0;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

export function isGptImage2Path(value?: string | null) {
  return typeof value === "string" && value.startsWith("/demo-media/gpt-image2/");
}

export function getDemoMediaAssets(category: DemoMediaCategory) {
  return (manifest.assets ?? [])
    .filter((asset) => asset.syntheticDemo === true)
    .filter((asset) => asset.safetyStatus === "accepted")
    .filter((asset) => normalizeCategory(asset) === category)
    .map((asset) => publicPathFor(asset))
    .filter(isGptImage2Path)
    .sort();
}

export function hasGptImage2Assets(category?: DemoMediaCategory) {
  if (category) return getDemoMediaAssets(category).length > 0;
  return (
    getDemoMediaAssets("meals").length +
      getDemoMediaAssets("health-materials").length +
      getDemoMediaAssets("growth").length +
      getDemoMediaAssets("storybooks").length >
    0
  );
}

export function getDemoMediaPath(
  category: DemoMediaCategory,
  key: string,
  fallbackPath: string
) {
  const assets = getDemoMediaAssets(category);
  if (assets.length === 0) return fallbackPath;
  return assets[stableIndex(`${category}:${key}`, assets.length)] ?? fallbackPath;
}
