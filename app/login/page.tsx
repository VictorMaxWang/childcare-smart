"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baby, Eye, EyeOff, HeartPulse, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { getDefaultLandingPath, type AccountRole } from "@/lib/auth/accounts";
import { type Gender, useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="relative min-h-[calc(100vh-64px)] overflow-hidden px-6 py-10 page-enter spotlight-bg">
      <div className="absolute inset-0 pointer-events-none">
        <div className="float-soft absolute left-[6%] top-[14%] h-24 w-24 rounded-[28px] bg-white/20 blur-sm" />
        <div className="float-soft absolute right-[10%] top-[20%] h-40 w-40 rounded-full bg-cyan-300/20 blur-2xl" style={{ animationDelay: "1s" }} />
        <div className="float-soft absolute bottom-[8%] left-[35%] h-28 w-28 rounded-full bg-violet-300/20 blur-2xl" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-144px)] max-w-7xl overflow-hidden rounded-4xl border border-white/60 bg-white/40 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-sm lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative overflow-hidden bg-linear-to-br from-indigo-600 via-violet-600 to-sky-600 px-8 py-10 text-white sm:px-10 lg:px-12 lg:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(125,211,252,0.22),transparent_32%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between gap-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                <Sparkles className="h-4 w-4" />
                智慧托育比赛 Demo
              </div>
              <h1 className="mt-8 max-w-xl text-4xl font-black leading-tight sm:text-5xl">
                智慧普惠托育平台
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/82 sm:text-base">
                保留高质量示例账号用于现场演示，同时支持普通账号注册与登录，适合稳定展示晨检、饮食、成长观察和家园共育闭环。
              </p>
            </div>

            <div className="grid gap-4">
              <FeatureRow icon={<Workflow className="h-5 w-5" />} title="家园共育闭环" description="从园内记录到家长反馈，再到机构复盘，示例账号可一键演示完整流程。" />
              <FeatureRow icon={<HeartPulse className="h-5 w-5" />} title="近 7 天滚动数据" description="示例数据使用固定模板动态映射日期，每天进入都保持最近 7 天的连续展示。" />
              <FeatureRow icon={<ShieldCheck className="h-5 w-5" />} title="普通账号独立持久化" description="普通注册账号使用独立机构空间保存自己的数据，不会污染比赛 demo 数据。" />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
          <Card className="glass w-full max-w-xl rounded-[28px] border-white/60 bg-white/75 shadow-[0_18px_60px_rgba(15,23,42,0.14)]">
            <CardHeader className="space-y-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-100 to-sky-100 shadow-sm">
                  <Baby className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <CardTitle className="text-2xl text-slate-800">登录与演示入口</CardTitle>
                  <CardDescription className="mt-1">普通账号可注册登录，示例账号可免密码直接进入。</CardDescription>
                </div>
              </div>
              <div className="section-divider" />
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">普通账号</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="请输入账号"
                    autoComplete="username"
                    className="h-11 rounded-xl bg-white/90"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      required
                      className="h-11 rounded-xl bg-white/90 pr-11"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {message ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{message}</p> : null}

                <div className="flex gap-3">
                  <Button type="submit" variant="premium" className="h-11 flex-1 rounded-xl" disabled={loading}>
                    {loading ? "登录中..." : "普通账号登录"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setRegisterOpen(true)}>
                    注册账号
                  </Button>
                </div>
              </form>

              <div className="section-divider" />

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">示例账号快速进入</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">无需输入密码，点击即可进入对应角色页面。</p>
                </div>

                <div className="grid gap-3">
                  {demoAccounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleDemoLogin(account.id, account.role)}
                      disabled={demoLoadingId === account.id}
                      className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <span className="text-lg">{account.avatar}</span>
                            <span>{account.name}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{account.role}</span>
                          </div>
                          {"description" in account ? (
                            <p className="mt-2 text-xs leading-5 text-slate-500">{account.description}</p>
                          ) : null}
                        </div>
                        <span className="text-xs text-indigo-600">{demoLoadingId === account.id ? "进入中..." : "直接进入"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
                演示建议：先进入教师或园长示例账号展示近 7 天完整数据，再切换家长示例账号展示家园反馈闭环。
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <Dialog
        open={registerOpen}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) resetRegisterForm();
        }}
      >
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleRegisterSubmit}>
            <DialogHeader>
              <DialogTitle>注册普通账号</DialogTitle>
              <DialogDescription>普通账号走独立数据流，注册后按角色进入系统并保存自己的数据。</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="register-username">账号</Label>
                <Input
                  id="register-username"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  placeholder="请输入用户名 / 账号"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-role">用户类型</Label>
                <Select value={registerRole} onValueChange={(value) => setRegisterRole(value as AccountRole)}>
                  <SelectTrigger id="register-role">
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
                <Label htmlFor="register-password">密码</Label>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showRegisterPassword ? "text" : "password"}
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请输入密码"
                    className="pr-11"
                  />
                  <button
                    type="button"
                    aria-label={showRegisterPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowRegisterPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                  >
                    {showRegisterPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-confirm-password">确认密码</Label>
                <div className="relative">
                  <Input
                    id="register-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请再次输入密码"
                    className="pr-11"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                  >
                    {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {registerRole === "教师" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="teacher-class-name">班级名称</Label>
                  <Input
                    id="teacher-class-name"
                    value={teacherClassName}
                    onChange={(event) => setTeacherClassName(event.target.value)}
                    placeholder="请输入教师所属班级"
                  />
                </div>
              ) : null}

              {registerRole === "家长" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="child-name">孩子姓名</Label>
                    <Input
                      id="child-name"
                      value={childName}
                      onChange={(event) => setChildName(event.target.value)}
                      placeholder="请输入孩子姓名"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-birth-date">出生日期</Label>
                    <Input
                      id="child-birth-date"
                      type="date"
                      value={childBirthDate}
                      onChange={(event) => setChildBirthDate(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-gender">性别</Label>
                    <Select value={childGender} onValueChange={(value) => setChildGender(value as Gender)}>
                      <SelectTrigger id="child-gender">
                        <SelectValue placeholder="请选择性别" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="男">男</SelectItem>
                        <SelectItem value="女">女</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guardian-phone">监护人电话</Label>
                    <Input
                      id="guardian-phone"
                      value={guardianPhone}
                      onChange={(event) => setGuardianPhone(event.target.value)}
                      placeholder="可选"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-height">身高（cm）</Label>
                    <Input
                      id="child-height"
                      type="number"
                      min="0"
                      value={childHeightCm}
                      onChange={(event) => setChildHeightCm(event.target.value)}
                      placeholder="可选"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="child-weight">体重（kg）</Label>
                    <Input
                      id="child-weight"
                      type="number"
                      min="0"
                      step="0.1"
                      value={childWeightKg}
                      onChange={(event) => setChildWeightKg(event.target.value)}
                      placeholder="可选"
                    />
                  </div>
                </>
              ) : null}
            </div>

            {registerMessage ? (
              <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">{registerMessage}</p>
            ) : null}

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => {
                setRegisterOpen(false);
                resetRegisterForm();
              }}>
                取消
              </Button>
              <Button type="submit" variant="premium" disabled={registerLoading}>
                {registerLoading ? "注册中..." : "注册并进入系统"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureRow({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-white/14 bg-white/10 px-5 py-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-white">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-white/76">{description}</p>
        </div>
      </div>
    </div>
  );
}
