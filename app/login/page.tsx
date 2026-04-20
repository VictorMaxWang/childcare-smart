"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baby, Eye, EyeOff } from "lucide-react";
import { getDefaultLandingPath, type AccountRole } from "@/lib/auth/accounts";
import { type Gender, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AmbientBackground from "@/components/visuals/AmbientBackground";
import MagneticCTA from "@/components/visuals/MagneticCTA";
import MotionHero from "@/components/visuals/MotionHero";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ENTRY_NOTES = [
  {
    title: "连续记录",
    body: "从晨检到离园反馈，关键数据在同一链路持续沉淀，不在角色切换中断开。",
  },
  {
    title: "多角色协同",
    body: "教师、家长与管理端共享同一工作节奏，在统一入口完成日常协作。",
  },
];

const LOGIN_META = ["连续记录", "多角色协同", "可信入口"] as const;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { demoAccounts, login, loginWithDemo, register, isAuthenticated, authLoading, currentUser } = useApp();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [demoLoadingId, setDemoLoadingId] = useState<string | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerRole, setRegisterRole] = useState<AccountRole>("家长");
  const [teacherClassName, setTeacherClassName] = useState("新注册班");
  const [childName, setChildName] = useState("");
  const [childBirthDate, setChildBirthDate] = useState("2023-01-01");
  const [childGender, setChildGender] = useState<Gender>("男");
  const [childHeightCm, setChildHeightCm] = useState("");
  const [childWeightKg, setChildWeightKg] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const nextPath = useMemo(() => {
    const rawNextPath = searchParams.get("next");
    if (!rawNextPath || rawNextPath === "/login" || rawNextPath === "/auth/login") {
      return null;
    }
    return rawNextPath;
  }, [searchParams]);

  const resolveLandingPath = useCallback((role: AccountRole) => nextPath ?? getDefaultLandingPath(role), [nextPath]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(resolveLandingPath(currentUser.role));
    }
  }, [authLoading, currentUser.role, isAuthenticated, router, resolveLandingPath]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const result = await login(username, password);

    setLoading(false);
    if (!result.ok || !result.user) {
      setMessage(result.error || "登录失败");
      return;
    }

    router.replace(resolveLandingPath(result.user.role));
  }

  async function handleDemoLogin(accountId: string, role: AccountRole) {
    setDemoLoadingId(accountId);
    setMessage("");
    const result = await loginWithDemo(accountId);
    setDemoLoadingId(null);

    if (!result.ok) {
      setMessage(result.error || "示例账号进入失败");
      return;
    }

    router.replace(resolveLandingPath(result.user?.role ?? role));
  }

  function resetRegisterForm() {
    setRegisterMessage("");
    setRegisterUsername("");
    setRegisterPassword("");
    setConfirmPassword("");
    setRegisterRole("家长");
    setTeacherClassName("新注册班");
    setChildName("");
    setChildBirthDate("2023-01-01");
    setChildGender("男");
    setChildHeightCm("");
    setChildWeightKg("");
    setGuardianPhone("");
    setShowRegisterPassword(false);
    setShowConfirmPassword(false);
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterLoading(true);
    setRegisterMessage("");

    if (!registerUsername.trim() || !registerPassword.trim()) {
      setRegisterLoading(false);
      setRegisterMessage("请先填写账号和密码。");
      return;
    }

    if (registerPassword !== confirmPassword) {
      setRegisterLoading(false);
      setRegisterMessage("两次输入的密码不一致。");
      return;
    }

    if (registerRole === "家长" && (!childName.trim() || !childBirthDate)) {
      setRegisterLoading(false);
      setRegisterMessage("家长注册需要补充孩子姓名和出生日期。");
      return;
    }

    const result = await register({
      username: registerUsername,
      password: registerPassword,
      confirmPassword,
      role: registerRole,
      className: registerRole === "教师" ? teacherClassName.trim() || "新注册班" : undefined,
      child: registerRole === "家长"
        ? {
            name: childName.trim(),
            birthDate: childBirthDate,
            gender: childGender,
            heightCm: childHeightCm.trim() ? Number(childHeightCm) : undefined,
            weightKg: childWeightKg.trim() ? Number(childWeightKg) : undefined,
            guardianPhone: guardianPhone.trim() || undefined,
          }
        : undefined,
    });

    setRegisterLoading(false);
    if (!result.ok || !result.user) {
      setRegisterMessage(result.error || "注册失败");
      return;
    }

    setRegisterOpen(false);
    resetRegisterForm();
    router.replace(resolveLandingPath(result.user.role));
  }

  return (
    <AmbientBackground
      intensity="strong"
      tone="brand"
      className="login-premium-page px-4 py-4 sm:px-6 sm:py-6 lg:px-8"
      contentClassName="min-h-screen min-h-[100svh]"
    >
      <div aria-hidden="true" className="login-premium-atmosphere">
        <div className="login-premium-stage" />
        <div className="login-premium-veil" />
        <div className="login-premium-band login-premium-band-a" />
        <div className="login-premium-band login-premium-band-b" />
        <div className="login-premium-bloom login-premium-bloom-a" />
        <div className="login-premium-bloom login-premium-bloom-b" />
        <div className="login-premium-bloom login-premium-bloom-c" />
      </div>

      <div className="login-premium-shell mx-auto flex w-full max-w-7xl items-center">
        <MotionHero
          className="login-premium-hero w-full items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 xl:gap-20"
          leadClassName="order-2 lg:order-1"
          supportClassName="order-1 lg:order-2"
          lead={
            <section className="login-premium-story relative z-10 flex h-full flex-col justify-center py-6 sm:py-8 lg:py-12">
              <div className="login-premium-story__halo" aria-hidden="true" />
              <div className="relative z-10 max-w-[34rem]">
                <div className="login-premium-badge">Childcare Smart · 园所协同入口</div>
                <h1 className="login-premium-title mt-8 text-4xl font-black leading-[1.02] text-white sm:text-5xl lg:text-[4.2rem]">
                  让园所记录、教师协作与家园反馈，在同一入口持续流动
                </h1>
                <p className="login-premium-description mt-6 max-w-xl text-sm leading-7 text-white/74 sm:text-base">
                  进入统一工作台，连续处理健康、饮食、成长与家园沟通，保留可信、可追踪、可协作的每日记录。
                </p>
              </div>

              <div className="login-premium-notes mt-8 grid gap-4 sm:grid-cols-2 lg:mt-12">
                {ENTRY_NOTES.map((item) => (
                  <article key={item.title} className="login-premium-note">
                    <p className="login-premium-note__title">{item.title}</p>
                    <p className="login-premium-note__body">{item.body}</p>
                  </article>
                ))}
              </div>
            </section>
          }
          support={
            <section className="relative z-10 flex h-full items-center justify-center lg:justify-end">
              <Card
                surface="glass"
                glow="brand"
                interactive={false}
                className="login-premium-card w-full max-w-[32rem] border-white/14"
              >
                <div className="login-premium-card__beam" aria-hidden="true" />
                <CardHeader className="relative z-10 space-y-5 pb-5">
                  <div className="flex items-start gap-4">
                    <div className="login-premium-card__icon">
                      <Baby className="h-7 w-7 text-indigo-100" />
                    </div>
                    <div className="min-w-0">
                      <p className="login-premium-card__eyebrow">Product Access</p>
                      <CardTitle className="mt-2 text-[1.95rem] leading-none text-white">进入工作台</CardTitle>
                      <CardDescription className="mt-3 max-w-md leading-6 text-white/68">
                        使用正式账号继续日常工作；也可通过示例账号快速体验教师、家长与管理端工作流。
                      </CardDescription>
                    </div>
                  </div>

                  <div className="login-premium-card__meta">
                    {LOGIN_META.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </CardHeader>

                <CardContent className="relative z-10 space-y-6">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-white/64">账号</Label>
                      <Input
                        id="username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="输入账号"
                        autoComplete="username"
                        className="login-premium-input h-12 rounded-2xl"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-white/64">密码</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="输入密码"
                          autoComplete="current-password"
                          required
                          className="login-premium-input h-12 rounded-2xl pr-11"
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? "隐藏密码" : "显示密码"}
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/72"
                        >
                          {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {message ? (
                      <p role="alert" className="login-premium-alert rounded-2xl px-3 py-2 text-sm text-rose-200">
                        {message}
                      </p>
                    ) : null}

                    <div className="login-premium-actions flex flex-col gap-3 sm:flex-row">
                      <MagneticCTA className="flex-1" disabled={loading}>
                        <Button
                          type="submit"
                          variant="premium"
                          className="login-premium-cta h-12 w-full rounded-2xl"
                          disabled={loading}
                        >
                          {loading ? "登录中..." : "登录并进入工作台"}
                        </Button>
                      </MagneticCTA>
                      <Button
                        type="button"
                        variant="glass"
                        className="login-premium-secondary-cta h-12 rounded-2xl px-5 text-white"
                        onClick={() => setRegisterOpen(true)}
                      >
                        注册正式账号
                      </Button>
                    </div>
                  </form>

                  <div className="section-divider" />

                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">示例角色体验</p>
                        <p className="mt-1 text-xs leading-5 text-white/50">
                          免密码快速进入不同角色视角，预览核心工作流。
                        </p>
                      </div>
                      <span className="login-premium-demo-label">Demo</span>
                    </div>

                    <div className="grid gap-3">
                      {demoAccounts.map((account, index) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => handleDemoLogin(account.id, account.role)}
                          disabled={demoLoadingId === account.id}
                          className="login-demo-entry page-enter rounded-[1.35rem] p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ animationDelay: `${200 + index * 70}ms` }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-3">
                                <span className="login-demo-entry__avatar text-lg">{account.avatar}</span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                                    <span className="truncate">{account.name}</span>
                                    <span className="login-demo-entry__role">{account.role}</span>
                                  </div>
                                  <p className="mt-2 text-xs leading-5 text-white/54">{account.description}</p>
                                </div>
                              </div>
                            </div>
                            <span className="login-demo-entry__action">
                              {demoLoadingId === account.id ? "进入中..." : "立即进入"}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          }
        />
      </div>

      <Dialog
        open={registerOpen}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) resetRegisterForm();
        }}
      >
        <DialogContent className="login-register-dialog max-w-2xl">
          <form onSubmit={handleRegisterSubmit}>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl text-white">创建正式账号</DialogTitle>
              <DialogDescription className="leading-6 text-white/66">
                注册后将进入独立数据空间，用于创建并保存自己的托育记录。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="register-username" className="text-white/68">账号</Label>
                <Input
                  id="register-username"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  placeholder="请输入用户名 / 账号"
                  autoComplete="username"
                  className="login-register-field rounded-2xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-role" className="text-white/68">用户类型</Label>
                <Select value={registerRole} onValueChange={(value) => setRegisterRole(value as AccountRole)}>
                  <SelectTrigger id="register-role" className="login-register-field rounded-2xl">
                    <SelectValue placeholder="请选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="家长">家长</SelectItem>
                    <SelectItem value="教师">教师</SelectItem>
                    <SelectItem value="机构管理员">园长 / 管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-password" className="text-white/68">密码</Label>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showRegisterPassword ? "text" : "password"}
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请输入密码"
                    className="login-register-field rounded-2xl pr-11"
                  />
                  <button
                    type="button"
                    aria-label={showRegisterPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowRegisterPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/72"
                  >
                    {showRegisterPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-confirm-password" className="text-white/68">确认密码</Label>
                <div className="relative">
                  <Input
                    id="register-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请再次输入密码"
                    className="login-register-field rounded-2xl pr-11"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/72"
                  >
                    {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {registerRole === "教师" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="teacher-class-name" className="text-white/68">班级名称</Label>
                  <Input
                    id="teacher-class-name"
                    value={teacherClassName}
                    onChange={(event) => setTeacherClassName(event.target.value)}
                    placeholder="请输入教师所属班级"
                    className="login-register-field rounded-2xl"
                  />
                </div>
              ) : null}

              {registerRole === "家长" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="child-name" className="text-white/68">孩子姓名</Label>
                    <Input
                      id="child-name"
                      value={childName}
                      onChange={(event) => setChildName(event.target.value)}
                      placeholder="请输入孩子姓名"
                      className="login-register-field rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-birth-date" className="text-white/68">出生日期</Label>
                    <Input
                      id="child-birth-date"
                      type="date"
                      value={childBirthDate}
                      onChange={(event) => setChildBirthDate(event.target.value)}
                      className="login-register-field rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-gender" className="text-white/68">性别</Label>
                    <Select value={childGender} onValueChange={(value) => setChildGender(value as Gender)}>
                      <SelectTrigger id="child-gender" className="login-register-field rounded-2xl">
                        <SelectValue placeholder="请选择性别" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="男">男</SelectItem>
                        <SelectItem value="女">女</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guardian-phone" className="text-white/68">监护人电话</Label>
                    <Input
                      id="guardian-phone"
                      value={guardianPhone}
                      onChange={(event) => setGuardianPhone(event.target.value)}
                      placeholder="可选"
                      className="login-register-field rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-height" className="text-white/68">身高（cm）</Label>
                    <Input
                      id="child-height"
                      type="number"
                      min="0"
                      value={childHeightCm}
                      onChange={(event) => setChildHeightCm(event.target.value)}
                      placeholder="可选"
                      className="login-register-field rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-weight" className="text-white/68">体重（kg）</Label>
                    <Input
                      id="child-weight"
                      type="number"
                      min="0"
                      step="0.1"
                      value={childWeightKg}
                      onChange={(event) => setChildWeightKg(event.target.value)}
                      placeholder="可选"
                      className="login-register-field rounded-2xl"
                    />
                  </div>
                </>
              ) : null}
            </div>

            {registerMessage ? (
              <p role="alert" className="login-premium-alert rounded-2xl px-3 py-2 text-sm text-rose-200">
                {registerMessage}
              </p>
            ) : null}

            <DialogFooter className="mt-6 gap-3">
              <Button
                type="button"
                variant="glass"
                className="login-premium-secondary-cta rounded-2xl text-white"
                onClick={() => {
                  setRegisterOpen(false);
                  resetRegisterForm();
                }}
              >
                取消
              </Button>
              <Button type="submit" variant="premium" className="login-premium-cta rounded-2xl" disabled={registerLoading}>
                {registerLoading ? "注册中..." : "注册并进入系统"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AmbientBackground>
  );
}
