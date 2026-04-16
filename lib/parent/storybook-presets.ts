import type { ParentStoryBookStylePreset } from "@/lib/ai/types";

export interface StoryBookPresetConfig {
  id: ParentStoryBookStylePreset;
  label: string;
  caption: string;
}

export const STORYBOOK_PRESETS: StoryBookPresetConfig[] = [
  {
    id: "sunrise-watercolor",
    label: "Sunrise",
    caption: "Warm watercolor mood for family-friendly recording.",
  },
  {
    id: "moonlit-cutout",
    label: "Moonlit",
    caption: "Cooler layered-paper mood for a calmer bedtime frame.",
  },
  {
    id: "forest-crayon",
    label: "Forest",
    caption: "Crayon-style green palette for a more playful scene.",
  },
];

export const DEFAULT_STORYBOOK_PRESET = STORYBOOK_PRESETS[0];

export function getStoryBookPreset(presetId?: string | null): StoryBookPresetConfig {
  if (!presetId) return DEFAULT_STORYBOOK_PRESET;
  return STORYBOOK_PRESETS.find((preset) => preset.id === presetId) ?? DEFAULT_STORYBOOK_PRESET;
}

export function splitStoryCaption(script: string) {
  return script
    .split(/(?<=[。！？!?])/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stableStorybookHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
