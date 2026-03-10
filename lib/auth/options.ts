export type AuthRole = "家长" | "教师" | "机构管理员";
export type InstitutionOption = { label: string; value: string };
export type ClassOption = { label: string; value: string };

export const CUSTOM_INSTITUTION_VALUE = "__custom__" as const;
export const CUSTOM_CLASS_VALUE = "__custom_class__" as const;

export const INSTITUTION_OPTIONS = [
  { label: "春芽普惠托育中心", value: "inst-1" },
  { label: "星河社区托育点", value: "inst-2" },
  { label: "自定义机构 ID", value: CUSTOM_INSTITUTION_VALUE },
] as const satisfies readonly InstitutionOption[];

export type InstitutionMode = string;

export const CLASS_OPTIONS_BY_INSTITUTION: Record<string, ClassOption[]> = {
  "inst-1": [
    { label: "向阳班", value: "向阳班" },
    { label: "晨曦班", value: "晨曦班" },
    { label: "自定义班级", value: CUSTOM_CLASS_VALUE },
  ],
  "inst-2": [
    { label: "星芽班", value: "星芽班" },
    { label: "小海豚班", value: "小海豚班" },
    { label: "自定义班级", value: CUSTOM_CLASS_VALUE },
  ],
};
