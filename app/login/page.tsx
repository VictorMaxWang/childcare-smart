"use client";

import Image, { type StaticImageData } from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Baby,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  FlaskConical,
  LockKeyhole,
  Presentation,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { type AccountRole } from "@/lib/auth/accounts";
import { resolveAuthorizedRedirectPath, sanitizeNextPath } from "@/lib/auth/route-access";
import { type Gender, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import brandShield from "./assets/brand-shield.png";
import demoAvatarAdmin from "./assets/demo-avatar-admin.png";
import demoAvatarParentLin from "./assets/demo-avatar-parent-lin.png";
import demoAvatarTeacherLi from "./assets/demo-avatar-teacher-li.png";
import demoAvatarTeacherZhou from "./assets/demo-avatar-teacher-zhou.png";
import SystemTourPdfPresentation, { preloadSystemTourEntry } from "./SystemTourPdfPresentation";
import heroIllustration from "./assets/hero-illustration.png";
import loginLeftReplica from "./assets/login-left-replica.png";
import styles from "./login-pixel.module.css";

const PLATFORM_FEATURES = [
  { title: "园所数字化", description: "全面记录与管理", icon: Sparkles },
  { title: "教师高效协作", description: "工作流转更顺畅", icon: UsersRound },
  { title: "家长便捷反馈", description: "沟通透明更安心", icon: ShieldCheck },
  { title: "数据驱动决策", description: "科学分析有洞察", icon: BarChart3 },
];

const TRUST_ITEMS = [
  { title: "数据安全保障", description: "多重备份与加密保护", icon: ShieldCheck },
  { title: "权限精细管控", description: "角色权限分级管理", icon: Building2 },
  { title: "合规运营可靠", description: "符合行业合规要求", icon: CheckCircle2 },
];

const DEMO_AVATAR_BY_ID: Record<string, StaticImageData> = {
  "u-admin": demoAvatarAdmin,
  "u-teacher": demoAvatarTeacherLi,
  "u-teacher2": demoAvatarTeacherZhou,
  "u-parent": demoAvatarParentLin,
};

const DEMO_DESCRIPTION_BY_ID: Record<string, string> = {
  "u-admin": "园所管理者，全局掌控园所运营与数据",
  "u-teacher": "记录儿童成长，协作完成日常教学任务",
  "u-teacher2": "班级事务协同，课程完排与家园沟通",
  "u-parent": "查看孩子成长，接收通知与反馈互动",
};

const DEFAULT_REGISTER_ROLE: AccountRole = "机构管理员";

function getDemoRoleLabel(role: AccountRole) {
  if (role === "教师") return "教师";
  if (role === "家长") return "家长";
  return "园长";
}

function getDemoRoleTone(role: AccountRole) {
  if (role === "教师") return styles.demoBadgeTeacher;
  if (role === "家长") return styles.demoBadgeParent;
  return "";
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
    <button
      type="button"
      className={styles.passwordToggle}
      aria-label={visible ? "隐藏密码" : "显示密码"}
      onClick={onToggle}
      disabled={disabled}
    >
      {visible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
    </button>
  );
}

function useDesktopReplicaImage() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 901px)");
    const update = () => setEnabled(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return enabled;
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
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [agreementAccepted, setAgreementAccepted] = useState(true);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerRole, setRegisterRole] = useState<AccountRole>(DEFAULT_REGISTER_ROLE);
  const [kindergartenName, setKindergartenName] = useState("阳光智慧托育园");
  const [teacherClassName, setTeacherClassName] = useState("新注册班");
  const [childName, setChildName] = useState("");
  const [childBirthDate, setChildBirthDate] = useState("2023-01-01");
  const [childGender, setChildGender] = useState<Gender>("男");
  const [childHeightCm, setChildHeightCm] = useState("");
  const [childWeightKg, setChildWeightKg] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const showDesktopReplicaImage = useDesktopReplicaImage();

  const nextPath = useMemo(() => {
    return sanitizeNextPath(searchParams.get("next"));
  }, [searchParams]);

  const resolveLandingPath = useCallback(
    (role: AccountRole) => resolveAuthorizedRedirectPath(role, nextPath),
    [nextPath]
  );

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
    setVerificationCode("");
    setRegisterPassword("");
    setConfirmPassword("");
    setRegisterRole(DEFAULT_REGISTER_ROLE);
    setKindergartenName("阳光智慧托育园");
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
      child:
        registerRole === "家长"
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
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.leftColumn} aria-label="慧育童行 SmartChildcare Agent 介绍与示例账号入口">
          {showDesktopReplicaImage ? (
            <Image
              src={loginLeftReplica}
              alt=""
              aria-hidden="true"
              width={840}
              height={1086}
              className={styles.leftReplica}
              priority
              sizes="(min-width: 901px) 840px, 0px"
            />
          ) : null}
          {showDesktopReplicaImage ? (
            <div className={styles.leftReplicaFooterOverlay} aria-hidden="true" />
          ) : null}

          <div className={styles.heroBlock}>
            <div className={styles.brand}>
              <Image
                src={brandShield}
                alt=""
                width={52}
                height={56}
                className={styles.brandIcon}
                priority
                unoptimized
              />
              <div>
                <p className={styles.brandTitle}>慧育童行</p>
                <p className={styles.brandSub}>SmartChildcare Agent</p>
              </div>
            </div>

            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>
                让园所记录、教师协作
                <br />
                与家长反馈<span className={styles.accentText}>更顺畅</span>
              </h1>
              <p className={styles.heroLead}>面向托育场景的多智能体闭环决策系统，支持园所数字化管理、教师高效协作与家长结构化反馈。</p>
            </div>

            <div className={styles.heroImageFrame} aria-hidden="true">
              <Image
                src={heroIllustration}
                alt=""
                width={415}
                height={380}
                className={styles.heroImage}
                priority
                unoptimized
                sizes="(max-width: 900px) 320px, 420px"
              />
            </div>
            <span className={cn(styles.orb, styles.orbOne)} aria-hidden="true" />
            <span className={cn(styles.orb, styles.orbTwo)} aria-hidden="true" />

            <div className={styles.featureGrid}>
              {PLATFORM_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className={styles.featureItem}>
                    <div className={styles.featureIconBox}>
                      <Icon aria-hidden="true" size={24} strokeWidth={2.3} />
                    </div>
                    <p className={styles.featureTitle}>{feature.title}</p>
                    <p className={styles.featureDesc}>{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <section className={styles.quickPanel} aria-label="示例账号快速进入">
            <div className={styles.quickHeader}>
              <div className={styles.quickTitleGroup}>
                <div className={styles.quickIcon}>
                  <FlaskConical aria-hidden="true" size={22} />
                </div>
                <div>
                  <h2 className={styles.quickTitle}>快速体验</h2>
                  <p className={styles.quickSubtitle}>无需注册，点击即可进入对应角色体验核心功能。</p>
                </div>
              </div>
              <span className={styles.quickNote}>体验数据不会影响真实账号</span>
            </div>

            <div className={styles.demoGrid}>
              {demoAccounts.map((account) => {
                const isLoading = demoLoadingId === account.id;
                const roleLabel = getDemoRoleLabel(account.role);
                const avatarSrc = DEMO_AVATAR_BY_ID[account.id];
                return (
                  <button
                    key={account.id}
                    type="button"
                    data-testid={`demo-account-${account.id}`}
                    onClick={() => handleDemoLogin(account.id, account.role)}
                    disabled={demoLoadingId !== null}
                    aria-busy={isLoading || undefined}
                    className={styles.demoCard}
                  >
                    <div>
                      <div className={styles.demoTop}>
                        <div className={styles.demoAvatar}>
                          {avatarSrc ? (
                            <Image src={avatarSrc} alt="" width={62} height={62} unoptimized />
                          ) : (
                            <span aria-hidden="true">{account.avatar}</span>
                          )}
                        </div>
                        <div>
                          <div className={styles.demoNameRow}>
                            <p className={styles.demoName}>{account.name}</p>
                            <span className={cn(styles.demoBadge, getDemoRoleTone(account.role))}>{roleLabel}</span>
                          </div>
                        </div>
                      </div>
                      <p className={styles.demoDescription}>{DEMO_DESCRIPTION_BY_ID[account.id] ?? account.description}</p>
                    </div>
                    <span className={styles.demoAction}>
                      {isLoading ? "进入中..." : "进入体验"}
                      <ChevronRight aria-hidden="true" size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.mobileSignup} aria-label="机构账号注册入口">
            <div className={styles.mobileSignupIcon}>
              <Building2 aria-hidden="true" size={30} />
            </div>
            <div>
              <h2 className={styles.mobileSignupTitle}>还没有机构账号？</h2>
              <p className={styles.mobileSignupDesc}>适用于托育机构、幼儿园等组织用户</p>
            </div>
            <button type="button" className={styles.mobileRegisterButton} onClick={() => setRegisterOpen(true)}>
              注册机构 / 申请开通
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </section>

          <div className={styles.trustFooter} aria-label="平台保障">
            {TRUST_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className={styles.trustItem}>
                  <div className={styles.trustIcon}>
                    <Icon aria-hidden="true" size={28} />
                  </div>
                  <div>
                    <p className={styles.trustTitle}>{item.title}</p>
                    <p className={styles.trustDesc}>{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.authWrap} aria-label="账号登录">
          <div className={styles.authCard}>
            <div className={styles.authHeader}>
              <div className={styles.authIcon}>
                <Baby aria-hidden="true" size={36} strokeWidth={2.2} />
              </div>
              <div>
                <h2 className={styles.authTitle}>
                  <span className={styles.desktopTitleText}>登录与系统导览入口</span>
                  <span className={styles.mobileTitleText}>账号登录</span>
                </h2>
                <p className={styles.authSubtitle}>普通账号可注册登录，示例账号可免密直接进入。</p>
              </div>
              <span className={styles.mobileSecurityPill}>
                <ShieldCheck aria-hidden="true" size={13} />
                数据安全 · 隐私保护
              </span>
            </div>

            <div className={styles.authDivider} />

            <button
              type="button"
              className={styles.presentationButton}
              onFocus={preloadSystemTourEntry}
              onMouseEnter={preloadSystemTourEntry}
              onPointerDown={preloadSystemTourEntry}
              onClick={() => {
                preloadSystemTourEntry();
                setPresentationOpen(true);
              }}
              data-testid="system-tour-open"
            >
              <Presentation aria-hidden="true" size={22} />
              系统导览
            </button>

            <form onSubmit={handleSubmit}>
              <p className={styles.formSectionTitle}>普通账号登录</p>

              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="username">
                  普通账号
                </label>
                <div className={styles.inputWrap}>
                  <UserRound className={styles.inputIcon} aria-hidden="true" />
                  <input
                    id="username"
                    data-testid="login-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="账号 / 手机号"
                    autoComplete="username"
                    className={styles.textInput}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel} htmlFor="password">
                  密码
                </label>
                <div className={styles.inputWrap}>
                  <LockKeyhole className={styles.inputIcon} aria-hidden="true" />
                  <input
                    id="password"
                    data-testid="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="密码"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    className={styles.textInput}
                  />
                  <PasswordToggleButton
                    visible={showPassword}
                    onToggle={() => setShowPassword((prev) => !prev)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className={styles.formTools}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={rememberLogin}
                    onChange={(event) => setRememberLogin(event.target.checked)}
                  />
                  记住登录
                </label>
                <button
                  type="button"
                  className={styles.forgotButton}
                  disabled
                  aria-disabled="true"
                  title="密码找回暂未开放"
                  data-testid="d07-forgot-password-disabled"
                >
                  密码找回暂未开放
                </button>
              </div>

              {message ? (
                <div role="alert" aria-live="polite" className={styles.alert}>
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{message}</span>
                </div>
              ) : null}

              <button type="submit" className={styles.primaryButton} disabled={loading}>
                {loading ? "登录中..." : "登录"}
              </button>

              <label className={cn(styles.checkboxLabel, styles.agreement)}>
                <input
                  type="checkbox"
                  checked={agreementAccepted}
                  onChange={(event) => setAgreementAccepted(event.target.checked)}
                />
                <span>
                  我已阅读并同意 <a href="#">《用户服务协议》</a> 和 <a href="#">《隐私政策》</a>
                </span>
              </label>

              <div className={styles.registerDivider}>还没有账号？</div>
              <button type="button" className={styles.registerButton} onClick={() => setRegisterOpen(true)}>
                <Building2 aria-hidden="true" size={22} />
                注册机构 / 申请开通
              </button>
            </form>
          </div>
        </section>
      </main>

      <SystemTourPdfPresentation open={presentationOpen} onClose={() => setPresentationOpen(false)} />

      <Dialog
        open={registerOpen}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) resetRegisterForm();
        }}
      >
        <DialogContent className={styles.registerDialog}>
          <form onSubmit={handleRegisterSubmit} className={styles.registerForm}>
            <DialogHeader className={styles.registerHeader}>
              <DialogTitle className={styles.registerTitle}>注册普通账号</DialogTitle>
              <DialogDescription className={styles.registerDescription}>
                使用手机号创建账号；验证码为本地演示控件，不会发送短信。
              </DialogDescription>
            </DialogHeader>

            <div className={styles.registerFields}>
              <FormField label="手机号" htmlFor="register-username" required>
                <Input
                  id="register-username"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  placeholder="请输入手机号"
                  autoComplete="tel"
                  className={styles.registerInput}
                  disabled={registerLoading}
                />
              </FormField>

              <FormField label="验证码" htmlFor="register-verification-code" required>
                <div className={styles.verificationRow}>
                  <Input
                    id="register-verification-code"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    placeholder="请输入验证码"
                    inputMode="numeric"
                    className={styles.registerInput}
                    disabled={registerLoading}
                  />
                  <button type="button" className={styles.verificationButton} disabled title="演示环境未接入短信服务">
                    获取验证码
                  </button>
                </div>
              </FormField>

              <FormField label="密码" htmlFor="register-password" required>
                <div className={styles.inputWrap}>
                  <Input
                    id="register-password"
                    type={showRegisterPassword ? "text" : "password"}
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请设置登录密码"
                    className={cn(styles.registerInput, "pr-12")}
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
                <div className={styles.inputWrap}>
                  <Input
                    id="register-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="请再次输入登录密码"
                    className={cn(styles.registerInput, "pr-12")}
                    disabled={registerLoading}
                  />
                  <PasswordToggleButton
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={registerLoading}
                  />
                </div>
              </FormField>

              <FormField label="身份选择" htmlFor="register-role" required>
                <Select
                  value={registerRole}
                  onValueChange={(value) => setRegisterRole(value as AccountRole)}
                  disabled={registerLoading}
                >
                  <SelectTrigger id="register-role" className={styles.registerInput}>
                    <SelectValue placeholder="请选择身份" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="家长">家长</SelectItem>
                    <SelectItem value="教师">教师</SelectItem>
                    <SelectItem value="机构管理员">园长 / 管理员</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="园所名称" htmlFor="kindergarten-name" className={styles.registerFieldWide}>
                <Input
                  id="kindergarten-name"
                  value={kindergartenName}
                  onChange={(event) => setKindergartenName(event.target.value)}
                  placeholder="请输入园所名称"
                  className={styles.registerInput}
                  disabled={registerLoading}
                />
              </FormField>

              {registerRole === "教师" ? (
                <FormField label="班级名称" htmlFor="teacher-class-name" className={styles.registerFieldWide}>
                  <Input
                    id="teacher-class-name"
                    value={teacherClassName}
                    onChange={(event) => setTeacherClassName(event.target.value)}
                    placeholder="请输入教师所属班级"
                    className={styles.registerInput}
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
                      className={styles.registerInput}
                      disabled={registerLoading}
                    />
                  </FormField>

                  <FormField label="出生日期" htmlFor="child-birth-date" required>
                    <Input
                      id="child-birth-date"
                      type="date"
                      value={childBirthDate}
                      onChange={(event) => setChildBirthDate(event.target.value)}
                      className={styles.registerInput}
                      disabled={registerLoading}
                    />
                  </FormField>

                  <FormField label="性别" htmlFor="child-gender">
                    <Select
                      value={childGender}
                      onValueChange={(value) => setChildGender(value as Gender)}
                      disabled={registerLoading}
                    >
                      <SelectTrigger id="child-gender" className={styles.registerInput}>
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
                      className={styles.registerInput}
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
                      className={styles.registerInput}
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
                      className={styles.registerInput}
                      disabled={registerLoading}
                    />
                  </FormField>
                </>
              ) : null}
            </div>

            <div className={styles.registerFooter}>
              <Button
                type="button"
                variant="ghost"
                disabled={registerLoading}
                onClick={() => {
                  setRegisterOpen(false);
                  resetRegisterForm();
                }}
              >
                返回登录
              </Button>
              <Button type="submit" variant="primary" loading={registerLoading}>
                提交注册
              </Button>
            </div>

            {registerMessage ? (
              <div role="alert" aria-live="polite" className={cn(styles.alert, "mx-6 mb-5")}>
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{registerMessage}</span>
              </div>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
