export {
  DEFAULT_PARENT_STORYBOOK_STYLE_PRESET as DEFAULT_PARENT_STORYBOOK_PRESET,
  getParentStoryBookStylePresetDefinition as getParentStoryBookPresetDefinition,
  PARENT_STORYBOOK_STYLE_PRESETS as PARENT_STORYBOOK_PRESETS,
  resolveParentStoryBookStylePreset as resolveParentStoryBookPreset,
} from "@/lib/agent/parent-storybook";

export function splitStoryBookCaptionSegments(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const segments = normalized
    .split(/(?<=[。！？!?])/u)
    .map((item) => item.trim())
    .filter(Boolean);

  if (segments.length > 0) return segments;

  return normalized
    .split(/[，,。.!！？?]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
