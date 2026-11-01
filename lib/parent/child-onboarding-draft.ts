import type { ApiParentChildOnboardingInput } from "@/lib/api/types";

export type ChildOnboardingDraft = {
  version: 1;
  requestId: string;
  input: string;
  form: { name: string; nickname: string; birthDate: string; gender: "男" | "女" };
};

/** 只使用当前标签页的sessionStorage；账号/机构改变后不能恢复另一家庭的表单或请求编号。 */
export function childOnboardingDraftKey(userId: string, institutionId: string) {
  return `childcare-onboarding-draft:v1:${encodeURIComponent(institutionId)}:${encodeURIComponent(userId)}`;
}

export function parseChildOnboardingDraft(text: string | null): ChildOnboardingDraft | null {
  if (!text || text.length > 4000) return null;
  try {
    const value = JSON.parse(text) as ChildOnboardingDraft;
    if (value.version !== 1 || typeof value.requestId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(value.requestId) || typeof value.input !== "string" || value.input.length > 1500) return null;
    const form = value.form;
    if (!form || typeof form.name !== "string" || form.name.length > 80 || typeof form.nickname !== "string" || form.nickname.length > 80 || typeof form.birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate) || !["男", "女"].includes(form.gender)) return null;
    return value;
  } catch { return null; }
}

export function prepareChildOnboardingDraft(
  payload: ApiParentChildOnboardingInput & { gender: "男" | "女" },
  previous: ChildOnboardingDraft | null,
  createRequestId: () => string,
): ChildOnboardingDraft {
  const input = JSON.stringify(payload);
  return {
    version: 1,
    // 响应丢失和刷新后重试同一份资料时继续使用首次编号，服务端返回已有档案，不新建第二份。
    requestId: previous?.input === input ? previous.requestId : createRequestId(),
    input,
    form: { name: payload.name ?? "", nickname: payload.nickname ?? "", birthDate: payload.birthDate ?? "", gender: payload.gender },
  };
}
