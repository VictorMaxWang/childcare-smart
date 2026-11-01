"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Baby, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createParentChildWithConsent } from "@/lib/api/parent-children";
import type { ApiChildInput } from "@/lib/api/types";
import {
  buildParentChildOnboardingPayload,
  createEmptyChildOnboardingConsents,
  isChildOnboardingConsentComplete,
  type ChildOnboardingConsentKey,
  type ChildOnboardingConsentState,
} from "@/lib/parent/child-onboarding";
import { useApp } from "@/lib/store";
import { childOnboardingDraftKey, childOnboardingErrorState, parseChildOnboardingDraft, prepareChildOnboardingDraft, type ChildOnboardingDraft } from "@/lib/parent/child-onboarding-draft";

const CONSENT_LABELS: Array<{ key: ChildOnboardingConsentKey; label: string }> = [
  {
    key: "guardianAuthorization",
    label: "我确认本人是该儿童的父母或其他监护人，或已获得监护人授权",
  },
  {
    key: "termsOfService",
    label: "我已阅读并同意《用户服务协议》",
  },
  {
    key: "childPrivacy",
    label: "我已阅读并同意《儿童个人信息保护规则》",
  },
];

export default function ParentChildOnboardingPage() {
  const router = useRouter();
  const { currentUser, reloadAppSnapshotFromApi } = useApp();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<ApiChildInput["gender"] | "">("");
  const [consents, setConsents] = useState<ChildOnboardingConsentState>(() => createEmptyChildOnboardingConsents());
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const lastRequestRef = useRef<ChildOnboardingDraft | null>(null);
  const draftKey = currentUser.accountKind === "normal" && currentUser.institutionId ? childOnboardingDraftKey(currentUser.id, currentUser.institutionId) : null;
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      lastRequestRef.current = null;
      setName(""); setNickname(""); setBirthDate(""); setGender("");
      setConsents(createEmptyChildOnboardingConsents()); setDraftMessage(null);
      if (!draftKey) return;
      try {
        const restored = parseChildOnboardingDraft(sessionStorage.getItem(draftKey));
        if (!restored) return;
        lastRequestRef.current = restored;
        setName(restored.form.name); setNickname(restored.form.nickname); setBirthDate(restored.form.birthDate); setGender(restored.form.gender);
        setDraftMessage("已恢复上次提交的资料。请重新确认三项同意；相同资料重试会读取原档案，避免重复创建。");
      } catch { /* 存储被禁用时仍支持本页重试，不声称刷新后能恢复。 */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftKey]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const validation = useMemo(
    () =>
      buildParentChildOnboardingPayload({
        name,
        nickname,
        birthDate,
        gender,
        consents,
      }),
    [birthDate, consents, gender, name, nickname]
  );
  const consentComplete = isChildOnboardingConsentComplete(consents);
  const canSubmit = validation.ok && consentComplete && !submitting;

  function updateConsent(key: ChildOnboardingConsentKey, checked: boolean) {
    setConsents((current) => ({ ...current, [key]: checked }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const result = buildParentChildOnboardingPayload({
      name,
      nickname,
      birthDate,
      gender,
      consents,
    });

    if (!result.ok) {
      setLastError(result.error);
      toast.warning(result.error);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setLastError(null);
    try {
      const draft = prepareChildOnboardingDraft(result.payload, lastRequestRef.current, () => crypto.randomUUID());
      lastRequestRef.current = draft;
      if (draftKey) {
        try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); }
        catch { setDraftMessage("浏览器未允许保存恢复信息。如本次结果未知，请先检查家长首页已有档案，再刷新重填。"); }
      }
      const child = await createParentChildWithConsent({ ...result.payload, requestId: draft.requestId });
      if (draftKey) { try { sessionStorage.removeItem(draftKey); } catch { /* 已确认创建成功，不重发请求。 */ } }
      // 服务端已确认创建成功后，刷新失败只能提示同步问题，不能再声称建档失败引导重复提交。
      try {
        const reloadResult = await reloadAppSnapshotFromApi();
        if (reloadResult.status === "failed") toast.warning("孩子档案已创建，但本地快照刷新失败，请手动刷新页面。");
        else toast.success("孩子成长档案已创建");
      } catch { toast.warning("孩子档案已创建，但读取最新数据失败，请在家长首页刷新查看。"); }
      router.replace(`/parent?child=${encodeURIComponent(child.id)}`);
    } catch (requestError) {
      const result = childOnboardingErrorState(requestError);
      setLastError(result.message);
      if (result.resultUnknown) toast.warning(result.title, { description: result.message });
      else toast.error(result.title, { description: result.message });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5">
        <Button asChild variant="ghost" className="px-0 text-slate-600 hover:bg-transparent hover:text-indigo-700">
          <Link href="/parent">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            返回家长首页
          </Link>
        </Button>
      </div>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <Baby className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">创建孩子成长档案</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              仅填写第一版必要信息，创建前需要完成监护人确认与协议同意。
            </p>
          </div>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit} aria-busy={submitting}>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="孩子姓名 / 昵称" htmlFor="child-name" required>
              <Input
                id="child-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="小雨"
                autoComplete="off"
                maxLength={80}
                disabled={submitting}
              />
            </FormField>
            <FormField label="常用昵称" htmlFor="child-nickname">
              <Input
                id="child-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="可选"
                autoComplete="off"
                maxLength={80}
                disabled={submitting}
              />
            </FormField>
            <FormField label="出生日期" htmlFor="child-birth-date" required>
              <Input
                id="child-birth-date"
                type="date"
                max={today}
                disabled={submitting}
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </FormField>
            <FormField label="性别" htmlFor="child-gender" required>
              <Select disabled={submitting} value={gender} onValueChange={(value) => setGender(value as ApiChildInput["gender"])}>
                <SelectTrigger id="child-gender">
                  <SelectValue placeholder="请选择孩子性别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="女">女</SelectItem>
                  <SelectItem value="男">男</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {draftMessage && <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-800" role="status">{draftMessage}</p>}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              监护人确认与同意
            </div>
            <div className="mt-4 space-y-3">
              {CONSENT_LABELS.map((item) => (
                <label
                  key={item.key}
                  className="flex gap-3 rounded-2xl border border-white bg-white p-3 text-sm leading-6 text-slate-700 shadow-sm"
                >
                  <input
                    type="checkbox"
                    checked={consents[item.key]}
                    disabled={submitting}
                    onChange={(event) => updateConsent(item.key, event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {lastError ? (
            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {lastError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">
              {!validation.ok ? validation.error : "提交后将写入当前家长账号的真实家庭空间，并记录三项同意。"}
            </p>
            <Button type="submit" loading={submitting} disabled={!canSubmit}>
              创建孩子成长档案
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
