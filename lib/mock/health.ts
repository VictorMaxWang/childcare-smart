export const HEALTH_MOOD_OPTIONS = [
  { label: "愉快", emoji: "😃" },
  { label: "平稳", emoji: "🙂" },
  { label: "困倦", emoji: "🥱" },
  { label: "烦躁", emoji: "😫" },
  { label: "哭闹", emoji: "😭" },
];

export const HAND_MOUTH_EYE_OPTIONS = ["正常", "异常"] as const;

export const TEMPERATURE_THRESHOLD = 37.3;

export type HealthMood = typeof HEALTH_MOOD_OPTIONS[number]["label"];
export type HandMouthEyeStatus = typeof HAND_MOUTH_EYE_OPTIONS[number];
