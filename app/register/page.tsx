"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Phone,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { getRoleHomePath, type AccountRole, type RegisterAccountRoleInput } from "@/lib/auth/accounts";
import { resolveAuthorizedRedirectPath, sanitizeNextPath } from "@/lib/auth/route-access";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import styles from "./register.module.css";

type RegisterRoleValue = Extract<RegisterAccountRoleInput, "admin" | "teacher" | "parent">;
type FieldErrors = Partial<Record<"phone" | "password" | "confirmPassword" | "role", string>>;

const ROLE_OPTIONS: Array<{
  value: RegisterRoleValue;
  accountRole: AccountRole;
  label: string;
  description: string;
  icon: typeof Building2;
}> = [
  {
    value: "admin",
    accountRole: "机构管理员",
    label: "机构管理员",
    description: "进入园长端",
    icon: Building2,
  },
  {
    value: "teacher",
    accountRole: "教师",
    label: "教师",
    description: "进入教师端",
    icon: GraduationCap,
  },
  {
    value: "parent",
    accountRole: "家长",
    label: "家长",
    description: "进入家长端",
    icon: UsersRound,
  },
];

const SERVER_ERROR_FALLBACK = "注册失败，请稍后重试。";

function normalizePhoneForValidation(input: string) {
  const compact = input.trim().replace(/[\s-]+/g, "");
  if (compact.startsWith("+86")) return compact.slice(3);
  if (compact.startsWith("86") && compact.length === 13) return compact.slice(2);
  return compact;
}

function isMainlandPhone(input: string) {
  return /^1\d{10}$/.test(normalizePhoneForValidation(input));
}

function friendlyServerError(error?: string) {
  if (!error) return SERVER_ERROR_FALLBACK;
  if (error.includes("已被注册")) return "手机号已注册，请直接登录或更换手机号。";
  if (error.includes("两次输入的密码不一致")) return "两次密码不一致，请重新输入。";
  if (error.includes("至少需要 6")) return "密码过短，请至少输入 6 位。";
  if (error.includes("手机号格式")) return "手机号格式错误，请输入中国大陆 11 位手机号。";
  if (error.includes("数据库") || error.includes("DATABASE_URL")) return "数据库不可用，请稍后重试。";
  return error;
}

function PasswordToggleButton({
  visible,
  onToggle,
  disabled,
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
      {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
    </button>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, isAuthenticated, authLoading, currentUser } = useApp();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<RegisterRoleValue | "">("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);

  const selectedRole = useMemo(() => ROLE_OPTIONS.find((item) => item.value === role) ?? null, [role]);

  const redirectForRole = useCallback(
    (accountRole: AccountRole) => resolveAuthorizedRedirectPath(accountRole, nextPath),
    [nextPath]
  );

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(redirectForRole(currentUser.role));
    }
  }, [authLoading, currentUser.role, isAuthenticated, redirectForRole, router]);

  function validateForm() {
    const nextErrors: FieldErrors = {};
    const phoneValue = phone.trim();

    if (!phoneValue) {
      nextErrors.phone = "请输入手机号。";
    } else if (!isMainlandPhone(phoneValue)) {
      nextErrors.phone = "手机号格式错误，请输入中国大陆 11 位手机号。";
    }

    if (!password) {
      nextErrors.password = "请输入密码。";
    } else if (password.length < 6) {
      nextErrors.password = "密码至少 6 位。";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "请再次输入密码。";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "两次密码必须一致。";
    }

    if (!role) {
      nextErrors.role = "请选择身份。";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!validateForm() || !selectedRole) {
      return;
    }

    const phoneValue = phone.trim();
    setLoading(true);
    const result = await register({
      phone: phoneValue,
      username: phoneValue,
      password,
      confirmPassword,
      role: selectedRole.value,
      displayName: displayName.trim() || undefined,
    });
    setLoading(false);

    if (!result.ok || !result.user) {
      setMessage(friendlyServerError(result.error));
      return;
    }

    router.replace(result.redirectPath || getRoleHomePath(result.user.role) || redirectForRole(selectedRole.accountRole));
  }

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.formPanel} aria-label="手机号注册">
          <Link href="/login" className={styles.backLink}>
            <ArrowLeft aria-hidden="true" size={16} />
            返回登录
          </Link>

          <header className={styles.header}>
            <p className={styles.eyebrow}>
              <ShieldCheck aria-hidden="true" size={15} />
              正式账号注册
            </p>
            <h1 className={styles.title}>创建慧育童行账号</h1>
            <p className={styles.subtitle}>使用手机号和密码创建账号，选择身份后进入对应工作台。</p>
          </header>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <FormField label="手机号" htmlFor="register-phone" required error={fieldErrors.phone}>
              <div className={styles.inputWithIcon}>
                <Phone className={styles.inputIcon} aria-hidden="true" />
                <Input
                  id="register-phone"
                  data-testid="register-phone"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="13800000000"
                  className={styles.input}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
              </div>
            </FormField>

            <FormField label="昵称 / 姓名" htmlFor="register-display-name" description="可选，未填写时会使用脱敏手机号展示。">
              <div className={styles.inputWithIcon}>
                <UserRound className={styles.inputIcon} aria-hidden="true" />
                <Input
                  id="register-display-name"
                  data-testid="register-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  placeholder="可选"
                  className={styles.input}
                  disabled={loading}
                />
              </div>
            </FormField>

            <FormField label="密码" htmlFor="register-password" required error={fieldErrors.password}>
              <div className={styles.inputWithIcon}>
                <LockKeyhole className={styles.inputIcon} aria-hidden="true" />
                <Input
                  id="register-password"
                  data-testid="register-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: undefined, confirmPassword: undefined }));
                  }}
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                  className={cn(styles.input, styles.passwordInput)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <PasswordToggleButton
                  visible={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  disabled={loading}
                />
              </div>
            </FormField>

            <FormField label="确认密码" htmlFor="register-confirm-password" required error={fieldErrors.confirmPassword}>
              <div className={styles.inputWithIcon}>
                <LockKeyhole className={styles.inputIcon} aria-hidden="true" />
                <Input
                  id="register-confirm-password"
                  data-testid="register-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  className={cn(styles.input, styles.passwordInput)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                />
                <PasswordToggleButton
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((prev) => !prev)}
                  disabled={loading}
                />
              </div>
            </FormField>

            <fieldset className={styles.roleField}>
              <legend className={styles.roleLegend}>
                身份
                <span className={styles.requiredTag}>必填</span>
              </legend>
              <div className={styles.roleGrid}>
                {ROLE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = role === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={styles.roleButton}
                      data-selected={selected || undefined}
                      aria-pressed={selected}
                      onClick={() => {
                        setRole(option.value);
                        setFieldErrors((prev) => ({ ...prev, role: undefined }));
                      }}
                      disabled={loading}
                    >
                      <span className={styles.roleIcon}>
                        <Icon aria-hidden="true" size={20} />
                      </span>
                      <span>
                        <span className={styles.roleName}>{option.label}</span>
                        <span className={styles.roleDesc}>{option.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {fieldErrors.role ? <p className={styles.fieldError}>{fieldErrors.role}</p> : null}
            </fieldset>

            {message ? (
              <div className={styles.alert} role="alert" aria-live="polite">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{message}</span>
              </div>
            ) : null}

            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                className={styles.submitButton}
                data-testid="register-submit"
              >
                注册并进入系统
                <ArrowRight aria-hidden="true" size={18} />
              </Button>
              <Link href="/login" className={styles.loginLink}>
                已有账号，去登录
              </Link>
            </div>
          </form>
        </section>

        <aside className={styles.sidePanel} aria-label="账号安全说明">
          <div className={styles.sideHeader}>
            <h2 className={styles.sideTitle}>账号空间</h2>
            <p className={styles.sideText}>不同身份会进入独立工作台，数据访问范围由当前账号身份限定。</p>
          </div>
          <div className={styles.assuranceList}>
            <div className={styles.assuranceItem}>
              <span className={styles.assuranceIcon}>
                <CheckCircle2 aria-hidden="true" size={19} />
              </span>
              <div>
                <p className={styles.assuranceName}>手机号注册</p>
                <p className={styles.assuranceDesc}>服务端会再次校验手机号格式、密码长度和两次密码一致性。</p>
              </div>
            </div>
            <div className={styles.assuranceItem}>
              <span className={styles.assuranceIcon}>
                <Baby aria-hidden="true" size={19} />
              </span>
              <div>
                <p className={styles.assuranceName}>家长空间</p>
                <p className={styles.assuranceDesc}>家长账号先进入家长端，儿童档案将在后续建档流程中补充。</p>
              </div>
            </div>
            <div className={styles.assuranceItem}>
              <span className={styles.assuranceIcon}>
                <ShieldCheck aria-hidden="true" size={19} />
              </span>
              <div>
                <p className={styles.assuranceName}>会话保持</p>
                <p className={styles.assuranceDesc}>注册成功后沿用现有登录会话，不需要重复登录。</p>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
