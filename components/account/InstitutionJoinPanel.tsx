"use client";

import { useState } from "react";
import { Building2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptMemberInvitation } from "@/lib/api/member-invitations";
import type { SessionUser } from "@/lib/auth/accounts";

interface InstitutionJoinPanelProps {
  user: SessionUser;
}

export function InstitutionJoinPanel({ user }: InstitutionJoinPanelProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (
    user.accountKind !== "normal" ||
    user.authzVersion ||
    (user.role !== "教师" && user.role !== "家长")
  ) {
    return null;
  }

  async function handleJoin() {
    if (!code.trim()) {
      setError("请输入园长提供的一次性邀请码。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await acceptMemberInvitation(code);
      toast.success("已加入机构", {
        description:
          result.role === "家长"
            ? `孩子档案已迁入 ${result.className}，正在刷新授权。`
            : `教师账号已分配至 ${result.className}，正在刷新授权。`,
      });
      window.location.assign(result.role === "家长" ? "/parent" : "/teacher");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "加入机构失败，请稍后重试。";
      setError(message);
      toast.error("加入机构失败", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="mb-5 border border-indigo-200 bg-white p-4 shadow-sm sm:p-5"
      data-testid="institution-join-panel"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">加入托育机构</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            向园长索取与你的角色和班级绑定的一次性邀请码。接受后，当前个人空间会安全迁入机构。
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <KeyRound
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="pl-10 font-mono"
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="one-time-code"
            data-testid="institution-invite-code"
          />
        </div>
        <Button
          type="button"
          onClick={() => void handleJoin()}
          loading={submitting}
          className="min-h-11 sm:min-w-32"
          data-testid="institution-join-submit"
        >
          加入机构
        </Button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
