"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CLASS_OPTIONS_BY_INSTITUTION,
  CUSTOM_CLASS_VALUE,
  CUSTOM_INSTITUTION_VALUE,
  INSTITUTION_OPTIONS,
  type AuthRole,
  type InstitutionOption,
  type InstitutionMode,
} from "@/lib/auth/options";
import { isSupabaseRuntimeEnabled } from "@/lib/runtime/mode";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AuthRole>("家长");
  const [institutionId, setInstitutionId] = useState("inst-1");
  const [institutionMode, setInstitutionMode] = useState<InstitutionMode>("inst-1");
  const [className, setClassName] = useState("");
  const [classMode, setClassMode] = useState<string>("向阳班");
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionOption[]>([...INSTITUTION_OPTIONS]);
  const [classOptionsByInstitution, setClassOptionsByInstitution] = useState(CLASS_OPTIONS_BY_INSTITUTION);
  const [avatar, setAvatar] = useState("👤");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isSupabaseRuntimeEnabled()) return;

    let active = true;

    async function hydrateInstitutionOptions() {
      try {
        const supabase = createSupabaseBrowserClient();
        const [institutionRes, classRes] = await Promise.all([
          supabase.from("institutions").select("id,name").order("id", { ascending: true }),
          supabase.from("institution_classes").select("institution_id,class_name"),
        ]);

        if (!active) return;

        const dbInstitutions = Array.isArray(institutionRes.data) ? institutionRes.data : [];
        if (dbInstitutions.length === 0) return;

        const nextInstitutionOptions = [
          ...dbInstitutions.map((item) => ({
            label: String(item.name ?? item.id),
            value: String(item.id),
          })),
          { label: "自定义机构 ID", value: CUSTOM_INSTITUTION_VALUE },
        ];

        const classMap: Record<string, Array<{ label: string; value: string }>> = {};
        const dbClasses = Array.isArray(classRes.data) ? classRes.data : [];

        dbClasses.forEach((item) => {
          const institutionKey = String(item.institution_id ?? "");
          const className = String(item.class_name ?? "").trim();
          if (!institutionKey || !className) return;
          if (!classMap[institutionKey]) classMap[institutionKey] = [];
          classMap[institutionKey].push({ label: className, value: className });
        });

        Object.keys(classMap).forEach((key) => {
          classMap[key].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
          classMap[key].push({ label: "自定义班级", value: CUSTOM_CLASS_VALUE });
        });

        setInstitutionOptions(nextInstitutionOptions);
        setClassOptionsByInstitution(Object.keys(classMap).length > 0 ? classMap : CLASS_OPTIONS_BY_INSTITUTION);
      } catch {
        // Keep static fallback options.
      }
    }

    hydrateInstitutionOptions();

    return () => {
      active = false;
    };
  }, []);

  async function onLogin() {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function onRegister() {
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("请输入姓名");
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("请输入邮箱和密码");
      return;
    }

    const finalInstitutionId = (institutionMode === CUSTOM_INSTITUTION_VALUE ? institutionId : institutionMode).trim();

    if (!finalInstitutionId) {
      setError("请输入机构 ID");
      return;
    }

    const finalClassName = (classMode === CUSTOM_CLASS_VALUE ? className : classMode).trim();

    if (role === "教师" && !finalClassName) {
      setError("教师角色需要填写班级");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name.trim(),
            role,
            institution_id: finalInstitutionId,
            class_name: role === "教师" ? finalClassName : "",
            avatar: avatar.trim() || "👤",
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        router.push(redirectTo);
        router.refresh();
        return;
      }

      setSuccess("注册成功，请前往邮箱完成验证后登录。");
      setIsRegisterMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isRegisterMode ? "账号注册" : "平台登录"}</CardTitle>
          <CardDescription>
            {isRegisterMode ? "先创建账号并绑定角色信息，再登录托育平台。" : "使用账号密码登录托育平台。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isRegisterMode ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：李老师"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">角色</Label>
                <Select value={role} onValueChange={(value) => setRole(value as AuthRole)}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="家长">家长</SelectItem>
                    <SelectItem value="教师">教师</SelectItem>
                    <SelectItem value="机构管理员">机构管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="institutionId">机构</Label>
                <Select
                  value={institutionMode}
                  onValueChange={(value) => {
                    const next = value as InstitutionMode;
                    setInstitutionMode(next);
                    if (next !== CUSTOM_INSTITUTION_VALUE) {
                      setInstitutionId(next);
                      const classOptions = classOptionsByInstitution[next];
                      if (classOptions?.length) {
                        setClassMode(classOptions[0].value);
                        setClassName(classOptions[0].value === CUSTOM_CLASS_VALUE ? "" : classOptions[0].value);
                      }
                    }
                  }}
                >
                  <SelectTrigger id="institutionId">
                    <SelectValue placeholder="选择机构" />
                  </SelectTrigger>
                  <SelectContent>
                    {institutionOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {institutionMode === CUSTOM_INSTITUTION_VALUE ? (
                <div className="space-y-2">
                  <Label htmlFor="customInstitutionId">自定义机构 ID</Label>
                  <Input
                    id="customInstitutionId"
                    value={institutionId}
                    onChange={(e) => setInstitutionId(e.target.value)}
                    placeholder="例如：inst-custom-01"
                  />
                </div>
              ) : null}

              {role === "教师" ? (
                <>
                  {institutionMode !== CUSTOM_INSTITUTION_VALUE ? (
                    <div className="space-y-2">
                      <Label htmlFor="className">班级</Label>
                      <Select
                        value={classMode}
                        onValueChange={(value) => {
                          setClassMode(value);
                          if (value !== CUSTOM_CLASS_VALUE) {
                            setClassName(value);
                          }
                        }}
                      >
                        <SelectTrigger id="className">
                          <SelectValue placeholder="选择班级" />
                        </SelectTrigger>
                        <SelectContent>
                          {(classOptionsByInstitution[institutionMode] ?? []).map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {(institutionMode === CUSTOM_INSTITUTION_VALUE || classMode === CUSTOM_CLASS_VALUE) ? (
                    <div className="space-y-2">
                      <Label htmlFor="customClassName">自定义班级</Label>
                      <Input
                        id="customClassName"
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        placeholder="例如：向阳班"
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="avatar">头像（可选）</Label>
                <Input
                  id="avatar"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="例如：👩‍🏫"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

          <Button className="w-full" disabled={loading} onClick={isRegisterMode ? onRegister : onLogin}>
            {loading ? (isRegisterMode ? "注册中..." : "登录中...") : isRegisterMode ? "注册" : "登录"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={loading}
            onClick={() => {
              setError("");
              setSuccess("");
              setIsRegisterMode((prev) => !prev);
            }}
          >
            {isRegisterMode ? "已有账号？去登录" : "没有账号？去注册"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-64px)] flex items-center justify-center">加载中...</div>}>
      <LoginContent />
    </Suspense>
  );
}
