"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Baby,
  Building2,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { getDefaultLandingPath, type AccountRole } from "@/lib/auth/accounts";
import { type Gender, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
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
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { RoleBadge, type RoleBadgeRole } from "@/components/ui/role-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusTag } from "@/components/ui/status-tag";

const PLATFORM_FEATURES = [
  { title: "园所数字化", description: "记录与管理更清晰", icon: ClipboardList },
  { title: "教师协作", description: "日常任务更顺畅", icon: UsersRound },
  { title: "家长反馈", description: "沟通闭环更安心", icon: Baby },
  { title: "数据安全", description: "权限与隐私可控", icon: ShieldCheck },
];

const SECURITY_NOTES = [
  "数据分角色隔离",
  "示例账号免密码体验",
  "普通账号独立保存",
];

function getRoleBadgeRole(role: AccountRole): RoleBadgeRole {
  if (role === "教师") return "teacher";
  if (role === "家长") return "parent";
  return "director";
}

function getDemoRoleLabel(role: AccountRole) {
  if (role === "教师") return "教师端";
  if (role === "家长") return "家长端";
  return "园长端";
}

function PasswordToggleButton({
  visible,
  onToggle,
  disabled = false,
}: {
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <IconButton
      type="button"
      variant="ghost"
      label={visible ? "隐藏密码" : "显示密码"}
      onClick={onToggle}
      disabled={disabled}
      className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-md text-(--text-tertiary) hover:bg-(--primary-soft) hover:text-(--primary)"
    >
      {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </IconButton>
  );
}

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
    <div className="relative min-h-[100dvh] overflow-hidden bg-[linear-gradient(180deg,#F8FAFC_0%,#F4F7FF_52%,#F8FAFC_100%)] px-4 py-5 page-enter sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(ellipse_at_top_left,rgb(99_102_241_/_0.14),transparent_48%),radial-gradient(ellipse_at_top_right,rgb(20_184_166_/_0.13),transparent_44%)]" />

      <div className="relative mx-auto grid max-w-7xl gap-5 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="order-2 flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-white/70 bg-white/72 p-5 shadow-[0_18px_56px_rgb(15_23_42_/_0.10)] backdrop-blur-xl sm:p-7 lg:order-1 lg:p-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary),var(--support-teal))] text-white shadow-[0_12px_30px_rgb(99_102_241_/_0.24)]">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight text-(--text-primary)">智慧托育平台</p>
                  <p className="mt-1 text-xs leading-5 text-(--text-tertiary)">普惠托育智慧管理平台</p>
                </div>
              </div>
              <StatusTag variant="info" showDot>
                登录入口
              </StatusTag>
            </div>

            <div className="mt-9 grid gap-7 xl:grid-cols-[minmax(0,0.96fr)_minmax(300px,0.74fr)] xl:items-center">
              <div className="min-w-0">
                <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-normal text-(--text-primary) sm:text-4xl lg:text-[2.7rem]">
                  让园所记录、教师协作与家长反馈更顺畅
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-7 text-(--text-tertiary) sm:text-base">
                  统一承载园长端、教师端和家长端入口，支持普通账号登录注册，也支持示例账号快速体验核心流程。
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {PLATFORM_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div key={feature.title} className="rounded-xl border border-(--border) bg-white/82 p-4 shadow-[var(--shadow-card)]">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--primary-soft) text-(--primary)">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-(--text-primary)">{feature.title}</p>
                            <p className="mt-1 text-xs leading-5 text-(--text-tertiary)">{feature.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-(--border) bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] p-4 shadow-[var(--shadow-card)]">
                <div className="rounded-xl border border-(--border-subtle) bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-(--text-tertiary)">今日入口状态</p>
                      <p className="mt-1 text-xl font-bold text-(--text-primary)">4 个角色入口可用</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--support-teal-soft) text-(--support-teal)">
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {SECURITY_NOTES.map((note) => (
                      <div key={note} className="flex items-center gap-2 text-xs text-(--text-secondary)">
                        <span className="h-1.5 w-1.5 rounded-full bg-(--primary)" aria-hidden="true" />
                        {note}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {["园长端", "教师端", "家长端"].map((item) => (
                    <div key={item} className="rounded-lg bg-(--panel-subtle) px-3 py-3 text-center">
                      <p className="text-xs font-semibold text-(--text-secondary)">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-(--border) bg-white/84 p-4 shadow-[var(--shadow-card)] sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
                    <Sparkles className="h-4 w-4 text-(--primary)" aria-hidden="true" />
                    示例账号快速进入
                  </p>
                  <p className="mt-1 text-xs leading-5 text-(--text-tertiary)">无需输入密码，点击角色卡即可进入对应页面。</p>
                </div>
                <StatusTag variant="neutral">体验数据不会影响真实账号</StatusTag>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {demoAccounts.map((account) => {
                  const isLoading = demoLoadingId === account.id;
                  const roleLabel = getDemoRoleLabel(account.role);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleDemoLogin(account.id, account.role)}
                      disabled={demoLoadingId !== null}
                      aria-busy={isLoading || undefined}
                      className={cn(
                        "group min-h-28 rounded-xl border border-(--border) bg-white p-4 text-left shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-(--primary) hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                        isLoading && "border-(--primary) bg-(--primary-soft)"
                      )}
                    >
                      <div className="flex h-full flex-col justify-between gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--panel-subtle) text-xl shadow-inner">
                              {account.avatar}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-(--text-primary)">{account.name}</p>
                              <p className="mt-1 text-xs text-(--text-tertiary)">{roleLabel}</p>
                            </div>
                          </div>
                          <RoleBadge role={getRoleBadgeRole(account.role)} label={account.role} />
                        </div>
                        <div className="flex items-end justify-between gap-3">
                          <p className="line-clamp-2 text-xs leading-5 text-(--text-tertiary)">
                            {account.description}
                          </p>
                          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-(--primary)">
                            {isLoading ? "进入中..." : "进入"}
                            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-(--border-subtle) pt-4 text-xs text-(--text-helper)">
            <span>建议使用 Chrome / Edge 浏览器</span>
            <span>角色权限与登录后落点保持当前系统逻辑</span>
          </div>
        </section>

        <section className="order-1 flex min-w-0 items-center justify-center lg:order-2">
          <Card className="w-full max-w-[30rem] rounded-2xl border-white/80 bg-white/88 shadow-[0_22px_70px_rgb(15_23_42_/_0.14)] backdrop-blur-xl">
            <CardHeader className="space-y-5 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-(--primary-soft) text-(--primary)">
                    <Baby className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-2xl">账号登录</CardTitle>
                    <CardDescription className="mt-1 leading-6">普通账号可注册登录，示例账号可免密码直接进入。</CardDescription>
                  </div>
                </div>
                <StatusTag variant="success">安全连接</StatusTag>
              </div>
              <div className="section-divider" />
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="普通账号" htmlFor="username" required>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-helper)" aria-hidden="true" />
                    <Input
                      id="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="请输入账号"
                      autoComplete="username"
                      className="h-11 rounded-lg bg-white pl-10"
                      required
                      disabled={loading}
                    />
                  </div>
                </FormField>

                <FormField label="密码" htmlFor="password" required>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-helper)" aria-hidden="true" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      required
                      disabled={loading}
                      className="h-11 rounded-lg bg-white pl-10 pr-12"
                    />
                    <PasswordToggleButton
                      visible={showPassword}
                      onToggle={() => setShowPassword((prev) => !prev)}
                      disabled={loading}
                    />
                  </div>
                </FormField>

                {message ? (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-start gap-2 rounded-lg border border-(--danger-border) bg-(--danger-soft) px-3 py-2.5 text-sm leading-6 text-(--danger-foreground)"
                  >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{message}</span>
                  </div>
                ) : null}

                <div className="grid gap-3 pt-1">
                  <Button type="submit" variant="primary" size="lg" className="w-full rounded-lg" loading={loading}>
                    普通账号登录
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full rounded-lg"
                    onClick={() => setRegisterOpen(true)}
                    disabled={loading}
                  >
                    <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    注册账号
                  </Button>
                </div>
              </form>

              <div className="rounded-xl border border-(--border-subtle) bg-(--panel-subtle) px-4 py-3">
                <p className="text-xs font-medium text-(--text-secondary)">需要快速体验？</p>
                <p className="mt-1 text-xs leading-5 text-(--text-tertiary)">下方示例账号入口会直达对应角色页面，且不展示任何密码。</p>
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
        <DialogContent className="max-w-[46rem] p-0">
          <form onSubmit={handleRegisterSubmit}>
            <DialogHeader className="border-b border-(--border-subtle) px-5 pb-4 pt-5 text-left sm:px-6">
              <div className="flex items-start gap-3 pr-8">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--primary-soft) text-(--primary)">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <DialogTitle>注册普通账号</DialogTitle>
                  <DialogDescription className="mt-1">
                    普通账号走独立数据流，注册后按角色进入系统并保存自己的数据。
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid max-h-[min(68dvh,34rem)] gap-4 overflow-y-auto px-5 py-5 md:grid-cols-2 sm:px-6">
              <FormField label="账号" htmlFor="register-username" required>
                <Input
                  id="register-username"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  placeholder="请输入用户名 / 账号"
                  autoComplete="username"
                  className="h-11"
                  disabled={registerLoading}
                />
              </FormField>

              <FormField label="用户类型" htmlFor="register-role" required>
                <Select
                  value={registerRole}
                  onValueChange={(value) => setRegisterRole(value as AccountRole)}
                  disabled={registerLoading}
                >
                  <SelectTrigger id="register-role" className="h-11">
                    <SelectValue placeholder="请选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="家长">家长</SelectItem>
                    <SelectItem value="教师">教师</SelectItem>
                    <SelectItem value="机构管理员">园长 / 管理员</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="密码" htmlFor="register-password" required>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showRegisterPassword ? "text" : "password"}
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请输入密码"
                    className="h-11 pr-12"
                    disabled={registerLoading}
                  />
                  <PasswordToggleButton
                    visible={showRegisterPassword}
                    onToggle={() => setShowRegisterPassword((prev) => !prev)}
                    disabled={registerLoading}
                  />
                </div>
              </FormField>

              <FormField label="确认密码" htmlFor="register-confirm-password" required>
                <div className="relative">
                  <Input
                    id="register-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请再次输入密码"
                    className="h-11 pr-12"
                    disabled={registerLoading}
                  />
                  <PasswordToggleButton
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={registerLoading}
                  />
                </div>
              </FormField>

              {registerRole === "教师" ? (
                <FormField label="班级名称" htmlFor="teacher-class-name" className="md:col-span-2">
                  <Input
                    id="teacher-class-name"
                    value={teacherClassName}
                    onChange={(event) => setTeacherClassName(event.target.value)}
                    placeholder="请输入教师所属班级"
                    className="h-11"
                    disabled={registerLoading}
                  />
                </FormField>
              ) : null}

              {registerRole === "家长" ? (
                <>
                  <FormField label="孩子姓名" htmlFor="child-name" required>
                    <Input
                      id="child-name"
                      value={childName}
                      onChange={(event) => setChildName(event.target.value)}
                      placeholder="请输入孩子姓名"
                      className="h-11"
                      disabled={registerLoading}
                    />
                  </FormField>

                  <FormField label="出生日期" htmlFor="child-birth-date" required>
                    <Input
                      id="child-birth-date"
                      type="date"
                      value={childBirthDate}
                      onChange={(event) => setChildBirthDate(event.target.value)}
                      className="h-11"
                      disabled={registerLoading}
                    />
                  </FormField>

                  <FormField label="性别" htmlFor="child-gender">
                    <Select
                      value={childGender}
                      onValueChange={(value) => setChildGender(value as Gender)}
                      disabled={registerLoading}
                    >
                      <SelectTrigger id="child-gender" className="h-11">
                        <SelectValue placeholder="请选择性别" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="男">男</SelectItem>
                        <SelectItem value="女">女</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>

                  <FormField label="监护人电话" htmlFor="guardian-phone" description="可选，用于家园沟通联系。">
                    <Input
                      id="guardian-phone"
                      value={guardianPhone}
                      onChange={(event) => setGuardianPhone(event.target.value)}
                      placeholder="可选"
                      className="h-11"
                      disabled={registerLoading}
                    />
                  </FormField>

                  <FormField label="身高（cm）" htmlFor="child-height">
                    <Input
                      id="child-height"
                      type="number"
                      min="0"
                      value={childHeightCm}
                      onChange={(event) => setChildHeightCm(event.target.value)}
                      placeholder="可选"
                      className="h-11"
                      disabled={registerLoading}
                    />
                  </FormField>

                  <FormField label="体重（kg）" htmlFor="child-weight">
                    <Input
                      id="child-weight"
                      type="number"
                      min="0"
                      step="0.1"
                      value={childWeightKg}
                      onChange={(event) => setChildWeightKg(event.target.value)}
                      placeholder="可选"
                      className="h-11"
                      disabled={registerLoading}
                    />
                  </FormField>
                </>
              ) : null}
            </div>

            <div className="border-t border-(--border-subtle) px-5 py-4 sm:px-6">
              {registerMessage ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-4 flex items-start gap-2 rounded-lg border border-(--danger-border) bg-(--danger-soft) px-3 py-2.5 text-sm leading-6 text-(--danger-foreground)"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{registerMessage}</span>
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={registerLoading}
                  onClick={() => {
                    setRegisterOpen(false);
                    resetRegisterForm();
                  }}
                >
                  取消
                </Button>
                <Button type="submit" variant="primary" loading={registerLoading}>
                  注册并进入系统
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
