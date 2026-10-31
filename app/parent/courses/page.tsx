"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, CheckCircle2, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { RolePageShell } from "@/components/role-shell/RoleScaffold";
import { Button } from "@/components/ui/button";
import { COURSE_MODULE_LABELS, type CareCourse, type CourseLearningEvent, type CourseModule, type CourseRecommendationJob } from "@/lib/courses/types";
import { safeBilibiliUrl } from "@/lib/courses/catalog";

type CatalogResponse = { children: { id: string; name: string }[]; selectedChildId: string | null; ageMonths: number | null; courses: CareCourse[]; learning: CourseLearningEvent[]; canSave: boolean };
async function readApi<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "课程请求未完成，请稍后重试。");
  return payload.data as T;
}
function duration(seconds: number | null) { return seconds === null ? "时长待复核" : `${Math.floor(seconds / 60)}分${seconds % 60}秒`; }
const storageKey = (childId: string) => `childcare-course-job:${childId}`;

export default function ParentCoursesPage() {
  const params = useSearchParams(), router = useRouter();
  const childFromQuery = params.get("child");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [module, setModule] = useState<CourseModule | "all">("all");
  const [budget, setBudget] = useState<5 | 10 | 20>(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [job, setJob] = useState<CourseRecommendationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<string | null>(null);
  const [practiceNote, setPracticeNote] = useState("");
  const detailRef = useRef<HTMLElement | null>(null);
  const generationController = useRef<AbortController | null>(null);
  const currentChildQuery = useRef(childFromQuery);

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    const result = await readApi<CatalogResponse>(`/api/parent/courses${childFromQuery ? `?child=${encodeURIComponent(childFromQuery)}` : ""}`, undefined, signal);
    // 切换儿童后，旧请求可以完成，但不能覆盖新儿童的页面状态。
    if (!signal?.aborted && currentChildQuery.current === childFromQuery) setCatalog(result);
    return result;
  }, [childFromQuery]);
  useEffect(() => {
    currentChildQuery.current = childFromQuery;
    generationController.current?.abort();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setGenerating(false); setCatalog(null); setError(null); setMessage(null); setSelectedId(null); setJob(null);
      loadCatalog(controller.signal).catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "课程加载失败。"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); generationController.current?.abort(); };
  }, [loadCatalog, childFromQuery]);
  useEffect(() => { if (selectedId) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [selectedId]);
  useEffect(() => {
    if (!catalog?.selectedChildId) return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(storageKey(catalog.selectedChildId)); } catch { return; }
    if (!stored) return;
    const controller = new AbortController();
    readApi<CourseRecommendationJob>(`/api/parent/course-recommendations/${encodeURIComponent(stored)}`, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setJob(result); })
      .catch(() => { /* 过期、退出或儿童绑定变化时不恢复其他用户的推荐。 */ });
    return () => controller.abort();
  }, [catalog?.selectedChildId]);
  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    const controller = new AbortController();
    let timer: number;
    const poll = async () => {
      if (document.visibilityState !== "visible") { timer = window.setTimeout(poll, 5000); return; }
      try {
        const result = await readApi<CourseRecommendationJob>(`/api/parent/course-recommendations/${encodeURIComponent(job.jobId)}`, undefined, controller.signal);
        if (!controller.signal.aborted) setJob(result);
      } catch (issue) { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "推荐状态读取失败。"); }
    };
    timer = window.setTimeout(poll, 2500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [job]);
  const visibleCourses = useMemo(() => (catalog?.courses ?? []).filter(course => module === "all" || course.module === module), [catalog?.courses, module]);
  const selected = catalog?.courses.find(course => course.id === selectedId) ?? null;
  const selectedEvents = catalog?.learning.filter(event => event.courseId === selectedId && event.courseVersion === selected?.version) ?? [];
  const practiceSaved = selectedEvents.some(event => event.type === "practice" && event.completed);
  const recommendedCourses = job?.result?.courseIds.map(id => catalog?.courses.find(course => course.id === id)).filter((course): course is CareCourse => Boolean(course)) ?? [];
  function openCourse(courseId: string) { setSelectedId(courseId); setAnswer(null); setAnswerResult(null); setPracticeNote(""); setMessage(null); }

  async function record(course: CareCourse, event: Partial<CourseLearningEvent>) {
    if (!catalog?.selectedChildId || !catalog.canSave) throw new Error("请先用普通家长账号创建或选择儿童档案。");
    const result = await readApi<{ correct: boolean | null; explanation: string | null }>(`/api/parent/courses/${course.id}/events`, { childId: catalog.selectedChildId, requestId: crypto.randomUUID(), ...event });
    await loadCatalog();
    return result;
  }
  async function saveEvent(event: Partial<CourseLearningEvent>) {
    if (!selected) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const result = await record(selected, event);
      if (event.type === "answer") setAnswerResult(`${result.correct ? "回答正确。" : "再想一想。"}${result.explanation ?? ""}`);
      else setMessage(event.type === "practice" ? "家庭实践反馈已保存。" : "推荐反馈已保存，下次生成会参考这次反馈。");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "保存失败。"); }
    finally { setSaving(false); }
  }
  async function generate() {
    if (!catalog?.selectedChildId) return;
    const childId = catalog.selectedChildId;
    const controller = new AbortController();
    generationController.current?.abort(); generationController.current = controller;
    setGenerating(true); setError(null);
    try {
      const result = await readApi<CourseRecommendationJob>("/api/parent/course-recommendations", { requestId: crypto.randomUUID(), childId, module, budgetMinutes: budget }, controller.signal);
      if (controller.signal.aborted) return;
      setJob(result);
      try { localStorage.setItem(storageKey(childId), result.jobId); } catch { /* 浏览器禁用存储时，服务端任务仍然有效。 */ }
    } catch (issue) { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "推荐请求失败。"); }
    finally { if (!controller.signal.aborted) setGenerating(false); }
  }
  return <RolePageShell badge="家长端" title="三元课程与智慧推荐" description="从成长档案出发，在营养、心理支持和体育活动中选择可执行的小步学习。" testId="parent-courses-page">
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-44 flex-1 text-sm font-medium">当前儿童
            <select className="mt-2 block w-full rounded-xl border p-3" aria-label="当前儿童" value={catalog?.selectedChildId ?? ""} onChange={event => router.replace(`/parent/courses?child=${encodeURIComponent(event.target.value)}`)}>
              {!catalog?.children.length && <option value="">尚未创建儿童档案</option>}
              {catalog?.children.map(child => <option key={child.id} value={child.id}>{child.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">课程模块
            <select className="mt-2 block rounded-xl border p-3" aria-label="课程模块" value={module} onChange={event => { setModule(event.target.value as CourseModule | "all"); setSelectedId(null); }}>
              <option value="all">全部三元课程</option>{Object.entries(COURSE_MODULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">视频时间预算
            <select className="mt-2 block rounded-xl border p-3" aria-label="视频时间预算" value={budget} onChange={event => setBudget(Number(event.target.value) as 5 | 10 | 20)}>
              {[5, 10, 20].map(minutes => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}
            </select>
          </label>
          <Button disabled={loading || !catalog?.canSave || generating || Boolean(job && ["pending", "running"].includes(job.status))} loading={generating} onClick={generate}><Sparkles className="mr-2 h-4 w-4" />生成智慧推荐</Button>
        </div>
        <p className="mt-3 text-sm text-slate-600">最多推荐3项，视频总时长不超过预算；知识卡、自检和家庭实践另行安排。进入页面不会自动调用模型。</p>
        {!catalog?.canSave && !loading && <p className="mt-3 text-sm text-amber-800">可先阅读课程；保存进度和个性化推荐需要普通家长账号及儿童档案。<Link href="/parent/onboarding/child" className="ml-2 underline">创建成长档案</Link></p>}
      </section>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}<Button variant="link" onClick={() => { setError(null); void loadCatalog().catch(issue => setError(String(issue.message))); }}>重新加载课程</Button></div>}
      {message && <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</div>}
      {job && <section className="rounded-2xl border bg-indigo-50 p-5" aria-label="智慧推荐结果">
        <h2 className="text-lg font-bold">智慧推荐</h2>
        <p className="mt-1 text-xs text-slate-500">任务创建：{new Date(job.createdAt).toLocaleString("zh-CN")} · 有效期至 {new Date(job.expiresAt).toLocaleString("zh-CN")}</p>
        {["pending", "running"].includes(job.status) && <p role="status" className="mt-2">正在结合已授权档案与课程语义计算推荐，刷新后可恢复进度……</p>}
        {job.result && <><p className="mt-2">{job.result.reason}</p><p className="mt-2 text-sm text-slate-600">视频合计 {duration(job.result.score.durationSeconds)} · {job.result.reused ? "已复核并沿用适合的组合" : "已通过预算与去重复核"}</p><div className="mt-4 flex flex-wrap gap-3">{recommendedCourses.map(course => <Button variant="outline" key={course.id} onClick={() => openCourse(course.id)}>{course.title}</Button>)}</div><p className="mt-3 break-all text-xs text-slate-500">真实模型：{job.result.model} · 语义模型：{job.result.embeddingModel}</p></>}
        {["failed", "unknown"].includes(job.status) && <><p className="mt-2 text-amber-900">{job.error}</p>{job.status === "unknown" && <p className="mt-1 text-sm">上游可能已经计费，重新生成将发起新的请求。</p>}<Button variant="outline" className="mt-3" onClick={generate} disabled={generating}><RefreshCw className="mr-2 h-4 w-4" />重新生成</Button></>}
      </section>}
      {loading ? <p role="status">正在加载适龄课程……</p> : !visibleCourses.length ? <div className="rounded-xl border bg-white p-5">当前没有适合所选月龄和模块的课程。可以切换模块，或先完善儿童档案。</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleCourses.map(course => {
        const done = catalog?.learning.some(event => event.courseId === course.id && event.courseVersion === course.version && event.type === "practice" && event.completed);
        return <article key={course.id} className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-indigo-700">{COURSE_MODULE_LABELS[course.module]} · {course.minAgeMonths}–{course.maxAgeMonths}月龄</p>
          <h2 className="mt-2 text-lg font-bold">{course.title}</h2><p className="mt-2 text-sm text-slate-600">{course.summary}</p>
          <p className="mt-3 text-xs text-slate-500">知识卡约 {course.estimatedMinutes} 分钟 · 视频 {duration(course.video.durationSeconds)}</p>
          {done && <p className="mt-2 flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />已反馈家庭实践</p>}
          <Button variant="outline" className="mt-4 w-full" onClick={() => openCourse(course.id)}><BookOpen className="mr-2 h-4 w-4" />开始微课</Button>
        </article>;
      })}</div>}
      {selected && <section ref={detailRef} className="scroll-mt-24 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm" aria-label="课程详情">
        <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-bold">{selected.title}</h2><Button variant="ghost" onClick={() => setSelectedId(null)}>关闭</Button></div>
        <p className="mt-2 text-sm text-slate-500">课程面向家长与照护者 · 版本 {selected.version}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">{selected.cards.map(card => <div className="rounded-xl bg-slate-50 p-4" key={card.title}><h3 className="font-semibold">{card.title}</h3><p className="mt-2 leading-relaxed">{card.body}</p></div>)}</div>
        <div className="mt-5 rounded-xl border p-4"><h3 className="font-semibold">补充视频：{selected.video.title}</h3><p className="mt-2 text-sm">来源：{selected.video.author} · {duration(selected.video.durationSeconds)}</p><p className="mt-1 text-xs text-slate-500">最近核验：{selected.video.verifiedAt ? new Date(selected.video.verifiedAt).toLocaleString("zh-CN") : "待核验"}。视频在B站打开，不下载或转载，打开不等于完成观看。</p>
          {safeBilibiliUrl(selected.video.url) && <a className="mt-3 inline-flex items-center gap-2 rounded-xl border px-4 py-3 font-medium text-indigo-700" href={safeBilibiliUrl(selected.video.url)!} target="_blank" rel="noopener noreferrer" onClick={() => { if (catalog?.canSave) void record(selected, { type: "opened" }).catch(() => setMessage("视频已打开，学习记录暂未保存。")); }}>在B站观看<ExternalLink className="h-4 w-4" /></a>}
        </div>
        <fieldset className="mt-5 rounded-xl border p-4"><legend className="px-2 font-semibold">情境自检</legend><p>{selected.question.prompt}</p><div className="mt-3 space-y-2">{selected.question.choices.map((choice, index) => <label className="flex cursor-pointer gap-3 rounded-lg bg-slate-50 p-3" key={choice}><input type="radio" name={`course-answer-${selected.id}`} checked={answer === index} onChange={() => setAnswer(index)} />{choice}</label>)}</div><Button className="mt-3" disabled={answer === null || !catalog?.canSave || saving} onClick={() => saveEvent({ type: "answer", answer: answer! })} loading={saving}>提交自检并保存</Button>{answerResult && <p className="mt-3" role="status">{answerResult}</p>}</fieldset>
        <div className="mt-5 rounded-xl border p-4"><h3 className="font-semibold">家庭实践</h3><p className="mt-2">{selected.practice}</p>{practiceSaved && <p className="mt-2 text-sm text-emerald-700">已保存本版本实践反馈，可继续补充。</p>}<label className="mt-3 block text-sm">观察与反馈<textarea className="mt-2 block min-h-24 w-full rounded-xl border p-3" maxLength={500} value={practiceNote} onChange={event => setPracticeNote(event.target.value)} placeholder="只记录实际观察，不必填写隐私细节。" /></label><div className="mt-3 flex flex-wrap gap-3"><Button disabled={!catalog?.canSave || saving} loading={saving} onClick={() => saveEvent({ type: "practice", completed: true, note: practiceNote })}>保存实践反馈</Button><Button variant="outline" disabled={!catalog?.canSave || saving} onClick={() => saveEvent({ type: "practice", completed: false, note: practiceNote })}>暂未完成，记录原因</Button></div></div>
        <div className="mt-5 flex flex-wrap items-center gap-2"><span className="mr-2 text-sm">这门课：</span>{([["helpful", "有帮助"], ["not-helpful", "没帮助"], ["too-long", "太长"], ["tried", "试过了"]] as const).map(([feedback, label]) => <Button key={feedback} variant="outline" disabled={!catalog?.canSave || saving} onClick={() => saveEvent({ type: "feedback", feedback, ...(job?.result?.courseIds.includes(selected.id) ? { recommendationJobId: job.jobId } : {}) })}>{label}</Button>)}</div>
      </section>}
    </div>
  </RolePageShell>;
}
