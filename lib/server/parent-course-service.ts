import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { CARE_COURSES, COURSE_CATALOG_VERSION, safeBilibiliUrl } from "@/lib/courses/catalog";
import type { CareCourse, CourseLearningEvent, CourseModule, CourseRecommendation, CourseRecommendationJob } from "@/lib/courses/types";
import { normalizedCosine, pairKey, RECOMMENDATION_ALGORITHM_VERSION, reuseRecommendations, type OptimizationInput } from "@/lib/courses/optimizer";
import { dbQuery, decodeDatabaseJson, encodeDatabaseJson, withDbTransaction } from "@/lib/db/server";
import { isMaasConfigured, MaasProviderError, requestMaasChat, requestMaasEmbeddings, resolveMaasConfig } from "@/lib/providers/maas/maas-provider";
import { ApiRouteError } from "@/lib/server/api-errors";
import { requireSession } from "@/lib/server/session";
import { getSessionScope, requireScopedChild, type SessionScope } from "@/lib/server/session-scope";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENT_NOTE = 500;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
// MySQL JSON 会重排对象键；幂等比较必须使用规范化内容，不能比较序列化时的键顺序。
export const courseInputFingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const hash = courseInputFingerprint;
const token = (value: unknown, label: string, max = 120) => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new ApiRouteError("invalid_request", `${label} 格式无效。`);
  return value.trim();
};
export function courseAgeMonths(birthDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(now.getTime())) return null;
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate) return null;
  // 出生日期是业务日而非UTC时刻；台北午夜即进入新月龄，未来/溢出日期不能归零冒充新生儿。
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (birthDate > today) return null;
  const [year, month, day] = today.split("-").map(Number);
  return (year - birth.getUTCFullYear()) * 12 + month - 1 - birth.getUTCMonth() - (day < birth.getUTCDate() ? 1 : 0);
}
export function videoMetadataIsFresh(course: CareCourse, now = Date.now()) {
  const verified = course.video.verifiedAt ? Date.parse(course.video.verifiedAt) : NaN;
  return course.video.verificationStatus === "verified" && Boolean(safeBilibiliUrl(course.video.url)) && Number.isInteger(course.video.durationSeconds)
    && (course.video.durationSeconds ?? 0) > 0 && Number.isFinite(verified) && verified <= now && now - verified < DAY_MS;
}
/** 网络中断可能发生在上游计费后；只能把明确未发送或明确拒绝的请求标为 failed。 */
export function recommendationFailureStatus(error: unknown, upstreamStarted: boolean): "failed" | "unknown" {
  if (!upstreamStarted || error instanceof ApiRouteError) return "failed";
  if (error instanceof MaasProviderError) {
    return ["request-timeout", "request-cancelled"].includes(error.failureKind) || (error.failureKind === "provider-response" && !error.httpStatus) ? "unknown" : "failed";
  }
  // 例如模型已经成功，但提交结果时数据库断线；保守保留未知状态，不自动重复计费。
  return "unknown";
}
export async function parentCourseScope(request: Request) {
  const session = await requireSession(request);
  if (session.user.role !== "家长") throw new ApiRouteError("forbidden_scope", "三元课程仅家长账号可访问。");
  return getSessionScope(session);
}
function requireNormal(scope: SessionScope) {
  if (scope.user.accountKind !== "normal") throw new ApiRouteError("forbidden_scope", "请使用普通账号保存学习记录或生成个性化推荐，演示课程可以直接阅读。");
}
function childFor(scope: SessionScope, childId: string) { return requireScopedChild(scope, token(childId, "儿童编号", 100)); }
export async function loadCourseCatalog() {
  const { rows } = await dbQuery<{ course_id: string; course_json: unknown }>("SELECT course_id, course_json FROM parent_course_catalog");
  const overrides = new Map(rows.map(row => [row.course_id, decodeDatabaseJson<CareCourse>(row.course_json)]));
  return CARE_COURSES.map(course => {
    const stored = overrides.get(course.id);
    // 可编辑的公共元数据不能改变课程本身的来源或注入任意 URL。
    return stored?.version === course.version && safeBilibiliUrl(stored.video?.url ?? "")
      ? { ...course, video: stored.video }
      : { ...course, video: { ...course.video } };
  });
}
export async function listCourseLearning(scope: SessionScope, childId: string) {
  childFor(scope, childId);
  if (scope.user.accountKind === "demo") return [];
  const { rows } = await dbQuery<{ event_json: unknown; created_at: Date }>(
    "SELECT event_json, created_at FROM parent_course_learning_events WHERE institution_id=? AND user_id=? AND child_id=? ORDER BY event_sequence DESC LIMIT 200",
    [scope.institutionId, scope.user.id, childId],
  );
  return rows.map(row => ({ ...decodeDatabaseJson<CourseLearningEvent>(row.event_json)!, createdAt: new Date(row.created_at).toISOString() }));
}
export async function getParentCourses(scope: SessionScope, requestedChild?: string | null) {
  const childId = requestedChild || scope.visibleChildren[0]?.id || null;
  const child = childId ? childFor(scope, childId) : null;
  const months = child ? courseAgeMonths(child.birthDate) : null;
  const courses = await loadCourseCatalog();
  return {
    catalogVersion: COURSE_CATALOG_VERSION,
    children: scope.visibleChildren.map(item => ({ id: item.id, name: item.name })),
    selectedChildId: childId, ageMonths: months,
    courses: courses.filter(course => child ? months !== null && months >= course.minAgeMonths && months <= course.maxAgeMonths : true),
    learning: childId ? await listCourseLearning(scope, childId) : [],
    canSave: scope.user.accountKind === "normal" && Boolean(childId) && months !== null,
    ageWarning: child && months === null ? "儿童出生日期无效或晚于今天，请先修正档案后查看适龄课程。" : null,
  };
}
export async function saveCourseLearning(scope: SessionScope, courseId: string, input: Record<string, unknown>) {
  requireNormal(scope);
  const childId = token(input.childId, "儿童编号", 100), child = childFor(scope, childId);
  const ageMonths = courseAgeMonths(child.birthDate);
  if (ageMonths === null) throw new ApiRouteError("invalid_request", "儿童出生日期无效，请先修正档案。");
  const course = (await loadCourseCatalog()).find(item => item.id === courseId);
  if (!course) throw new ApiRouteError("not_found", "课程不存在。");
  if (ageMonths < course.minAgeMonths || ageMonths > course.maxAgeMonths) throw new ApiRouteError("forbidden_scope", "该课程不适合当前儿童月龄。");
  const requestId = token(input.requestId, "请求编号");
  const type = input.type;
  if (!["opened", "answer", "practice", "feedback"].includes(String(type))) throw new ApiRouteError("invalid_request", "学习事件无效。");
  if (type === "answer" && (!Number.isInteger(input.answer) || Number(input.answer) < 0 || Number(input.answer) >= course.question.choices.length)) throw new ApiRouteError("invalid_request", "请选择有效答案。");
  if (type === "practice" && typeof input.completed !== "boolean") throw new ApiRouteError("invalid_request", "请明确填写实践完成情况。");
  if (type === "feedback" && !["helpful", "not-helpful", "too-long", "tried"].includes(String(input.feedback))) throw new ApiRouteError("invalid_request", "反馈选项无效。");
  if (typeof input.note === "string" && input.note.length > MAX_EVENT_NOTE) throw new ApiRouteError("invalid_request", "备注不能超过500字。");
  const event: CourseLearningEvent = {
    requestId, courseId, courseVersion: course.version, type: type as CourseLearningEvent["type"],
    ...(type === "answer" ? { answer: Number(input.answer) } : {}),
    ...(type === "practice" ? { completed: Boolean(input.completed) } : {}),
    ...(type === "feedback" ? { feedback: input.feedback as CourseLearningEvent["feedback"] } : {}),
    ...(typeof input.note === "string" ? { note: input.note.trim() } : {}),
  };
  if (input.recommendationJobId) {
    const job = await getCourseRecommendationJob(scope, token(input.recommendationJobId, "推荐编号", 100));
    if (job.childId !== childId || !job.result?.courseIds.includes(courseId)) throw new ApiRouteError("forbidden_scope", "该课程不属于当前推荐。");
    event.recommendationJobId = job.jobId;
  }
  return withDbTransaction(async connection => {
    await connection.execute("INSERT IGNORE INTO parent_course_learning_events (event_id,institution_id,user_id,child_id,request_id,course_id,course_version,event_type,event_json) VALUES (?,?,?,?,?,?,?,?,?)", [
      `course-event-${randomUUID()}`, scope.institutionId, scope.user.id, childId, requestId, courseId, course.version, event.type, encodeDatabaseJson(event),
    ]);
    const [rows] = await connection.execute("SELECT child_id, event_json FROM parent_course_learning_events WHERE institution_id=? AND user_id=? AND request_id=?", [scope.institutionId, scope.user.id, requestId]);
    const saved = (rows as Array<{ child_id: string; event_json: unknown }>)[0];
    const old = decodeDatabaseJson<CourseLearningEvent>(saved?.event_json);
    if (!old || saved.child_id !== childId || hash(old) !== hash(event)) throw new ApiRouteError("conflict", "该请求编号已用于另一条学习记录。");
    return { event: old, correct: type === "answer" ? event.answer === course.question.answer : null, explanation: type === "answer" ? course.question.explanation : null };
  });
}
type JobRow = { job_id: string; request_id: string; child_id: string; status: CourseRecommendationJob["status"]; result_json: unknown; error_text: string | null; created_at: Date; expires_at: Date; input_json: unknown };
function publicJob(row: JobRow): CourseRecommendationJob {
  return { jobId: row.job_id, requestId: row.request_id, childId: row.child_id, status: row.status, result: decodeDatabaseJson<CourseRecommendation>(row.result_json), error: row.error_text, createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString() };
}
export async function getCourseRecommendationJob(scope: SessionScope, jobId: string) {
  const { rows } = await dbQuery<JobRow>("SELECT * FROM parent_course_recommendation_jobs WHERE job_id=? AND institution_id=? AND user_id=? LIMIT 1", [token(jobId, "推荐编号", 100), scope.institutionId, scope.user.id]);
  if (!rows[0]) throw new ApiRouteError("not_found", "推荐任务不存在。");
  childFor(scope, rows[0].child_id);
  await dbQuery("UPDATE parent_course_recommendation_jobs SET status='unknown',error_text='任务中断且上游结果未知，请确认后重新生成。' WHERE job_id=? AND status='running' AND updated_at < DATE_SUB(NOW(),INTERVAL 5 MINUTE)", [jobId]);
  const refreshed = await dbQuery<JobRow>("SELECT * FROM parent_course_recommendation_jobs WHERE job_id=? AND institution_id=? AND user_id=?", [jobId, scope.institutionId, scope.user.id]);
  return publicJob(refreshed.rows[0]);
}
interface RecommendationInput { childId: string; module: CourseModule | "all"; budgetMinutes: 5 | 10 | 20; dataVersion: string; facts: Record<string, unknown>; feedback: CourseLearningEvent[] }
export async function createCourseRecommendationJob(scope: SessionScope, input: Record<string, unknown>) {
  requireNormal(scope);
  const childId = token(input.childId, "儿童编号", 100), child = childFor(scope, childId);
  const ageMonths = courseAgeMonths(child.birthDate);
  if (ageMonths === null) throw new ApiRouteError("invalid_request", "儿童出生日期无效，请先修正档案。");
  if (process.env.AI_SERVICE_UNAVAILABLE === "1" || !isMaasConfigured()) throw new ApiRouteError("provider_unavailable", "智慧推荐服务暂不可用，课程阅读和已保存进度不受影响。");
  const requestId = token(input.requestId, "请求编号");
  if (![5, 10, 20].includes(Number(input.budgetMinutes))) throw new ApiRouteError("invalid_request", "视频预算只能选择5、10或20分钟。");
  const selectedModule = input.module ?? "all";
  if (!["all", "nutrition", "psychology", "movement"].includes(String(selectedModule))) throw new ApiRouteError("invalid_request", "课程模块无效。");
  const feedback = (await listCourseLearning(scope, childId)).filter(event => event.type === "feedback");
  const snapshot = scope.scopedSnapshot;
  const facts = {
    ageMonths,
    health: snapshot.health.filter(record => record.childId === childId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map(record => ({ date: record.date, mood: record.mood, abnormal: record.isAbnormal })),
    meals: snapshot.meals.filter(record => record.childId === childId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map(record => ({ date: record.date, intake: record.intakeLevel })),
    growth: snapshot.growth.filter(record => record.childId === childId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 7).map(record => ({ date: record.createdAt, category: record.category, needsAttention: record.needsAttention })),
  };
  const payload: RecommendationInput = { childId, module: selectedModule as RecommendationInput["module"], budgetMinutes: Number(input.budgetMinutes) as 5 | 10 | 20, dataVersion: hash({ facts, feedback }), facts, feedback };
  const config = resolveMaasConfig();
  const cacheKey = hash({ institution: scope.institutionId, user: scope.user.id, ...payload, catalog: COURSE_CATALOG_VERSION, algorithm: RECOMMENDATION_ALGORITHM_VERSION, textModel: config.textModel, embedding: config.embeddingModel, endpoint: config.baseUrl });
  return withDbTransaction(async connection => {
    // 锁定当前家长行，使同一用户并发点击在查重和创建之间保持原子性，不锁整条机构快照。
    const [actors] = await connection.execute("SELECT id FROM app_users WHERE id=? AND institution_id=? FOR UPDATE", [scope.user.id, scope.institutionId]);
    if (!Array.isArray(actors) || !actors.length) throw new ApiRouteError("unauthorized", "账号状态已变化，请重新登录。");
    const [requestRows] = await connection.execute("SELECT * FROM parent_course_recommendation_jobs WHERE institution_id=? AND user_id=? AND request_id=? LIMIT 1", [scope.institutionId, scope.user.id, requestId]);
    const replay = (requestRows as JobRow[])[0];
    if (replay) {
      if (replay.child_id !== childId || hash(decodeDatabaseJson<RecommendationInput>(replay.input_json)) !== hash(payload)) throw new ApiRouteError("conflict", "请求编号已用于不同推荐条件。");
      return publicJob(replay);
    }
    // 请求编号冲突优先于结果缓存；不能被另一条较新的同条件任务掩盖。
    const [cachedRows] = await connection.execute("SELECT * FROM parent_course_recommendation_jobs WHERE institution_id=? AND user_id=? AND child_id=? AND cache_key=? AND status IN ('pending','running','completed') AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [scope.institutionId, scope.user.id, childId, cacheKey]);
    const cached = (cachedRows as JobRow[])[0];
    if (cached) return publicJob(cached);
    const jobId = `course-job-${randomUUID()}`, expiresAt = new Date(Date.now() + DAY_MS);
    await connection.execute("INSERT INTO parent_course_recommendation_jobs (job_id,institution_id,user_id,child_id,request_id,cache_key,status,input_json,expires_at) VALUES (?,?,?,?,?,?,'pending',?,?)", [jobId, scope.institutionId, scope.user.id, childId, requestId, cacheKey, encodeDatabaseJson(payload), expiresAt]);
    return { jobId, requestId, childId, status: "pending" as const, result: null, error: null, createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
  });
}

async function refreshVideoMetadata(courses: CareCourse[]) {
  const refreshed: CareCourse[] = [];
  for (const course of courses) {
    if (videoMetadataIsFresh(course)) { refreshed.push(course); continue; }
    const safe = safeBilibiliUrl(course.video.url);
    if (!safe) continue;
    const link = new URL(safe), bvid = link.pathname.split("/")[2];
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "SmartChildcare-CourseCatalog/1.0" }, redirect: "error", cache: "no-store" });
    if (response.status === 412 || response.status === 429) throw new ApiRouteError("provider_unavailable", "视频来源暂时限制核验，请稍后再试；不会绕过平台限制。");
    if (!response.ok) continue;
    const payload = await response.json() as { code?: number; data?: { title?: string; owner?: { name?: string }; duration?: number; rights?: { pay?: number; arc_pay?: number }; pages?: Array<{ part?: string; duration?: number }> } };
    if (payload.code !== 0 || !payload.data || payload.data.rights?.pay || payload.data.rights?.arc_pay) continue;
    const selected = payload.data.pages?.[Number(link.searchParams.get("p") || "1") - 1];
    if (link.searchParams.has("p") && !selected) continue;
    const duration = selected?.duration ?? payload.data.duration;
    if (!Number.isInteger(duration) || !duration || duration < 1) continue;
    const item: CareCourse = { ...course, video: { ...course.video, title: selected?.part || payload.data.title || course.video.title, author: payload.data.owner?.name || course.video.author, durationSeconds: duration, verifiedAt: new Date().toISOString(), verificationStatus: "verified", evidence: "B站公开元数据接口核验免费状态、当前分P及实际时长；未下载或转载。" } };
    await dbQuery("INSERT INTO parent_course_catalog (course_id,catalog_version,course_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE catalog_version=VALUES(catalog_version),course_json=VALUES(course_json)", [item.id, COURSE_CATALOG_VERSION, encodeDatabaseJson(item)]);
    refreshed.push(item);
  }
  return refreshed;
}

async function generateRecommendation(input: RecommendationInput, institutionId: string, userId: string, onRequestStart: () => void): Promise<CourseRecommendation> {
  const deadlineAtMs = Date.now() + 150000;
  const months = Number(input.facts.ageMonths);
  const eligible = (await loadCourseCatalog()).filter(course => (input.module === "all" || course.module === input.module) && months >= course.minAgeMonths && months <= course.maxAgeMonths);
  const courses = (await refreshVideoMetadata(eligible)).filter(course => videoMetadataIsFresh(course)).slice(0, 20);
  if (!courses.length) throw new ApiRouteError("provider_unavailable", "当前没有已核验且适龄的视频课程，请先阅读微课或稍后更新推荐。");
  const allowedGoals = [...new Set(courses.flatMap(course => course.goals))];
  const chat = await requestMaasChat({ json: true, maxTokens: 800, deadlineAtMs, onRequestStart, messages: [
    { role: "system", content: "你为婴幼儿家长选择通用照护学习目标，不诊断、不编造事实。仅返回JSON：{\"goals\":[从允许列表选择1到3项],\"reason\":\"简短说明已有事实与学习目标关系；资料稀疏就明确说明\"}。不得返回姓名、视频链接或新增目标。" },
    { role: "user", content: JSON.stringify({ facts: input.facts, allowedGoals, requestedModule: input.module }) },
  ] });
  let selected: { goals?: unknown; reason?: unknown };
  try { selected = JSON.parse(chat.text.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "")); } catch { throw new ApiRouteError("provider_unavailable", "学习目标生成格式无效，请稍后重试。"); }
  const goals = Array.isArray(selected.goals) ? [...new Set(selected.goals.filter((goal): goal is string => typeof goal === "string" && allowedGoals.includes(goal)))].slice(0, 3) : [];
  if (!goals.length || typeof selected.reason !== "string") throw new ApiRouteError("provider_unavailable", "学习目标生成不完整，没有生成占位推荐。");
  const config = resolveMaasConfig(), identity = `${config.baseUrl}|${config.embeddingModel}`;
  const texts = courses.map(course => `${course.title}\n${course.summary}\n${course.goals.join("、")}`);
  const vectorKey = hash({ identity, catalog: COURSE_CATALOG_VERSION, texts });
  const { rows } = await dbQuery<{ model_identity: string; dimensions: number; vectors_json: unknown }>("SELECT model_identity,dimensions,vectors_json FROM parent_course_semantic_cache WHERE cache_key=? AND expires_at>NOW()", [vectorKey]);
  let vectors = rows[0]?.model_identity === identity ? decodeDatabaseJson<number[][]>(rows[0].vectors_json) : null;
  let query: number[], embeddingModel: string;
  if (vectors?.length === courses.length) {
    const result = await requestMaasEmbeddings([goals.join("、")], { deadlineAtMs, onRequestStart }); query = result.vectors[0]; embeddingModel = result.model;
  } else {
    // 网关批次上限为10；20候选也只能顺序分批，同一批失败不会自动重发。
    const embeddingInputs = [...texts, goals.join("、")], combinedVectors: number[][] = [];
    embeddingModel = config.embeddingModel;
    for (let offset = 0; offset < embeddingInputs.length; offset += 10) {
      const result = await requestMaasEmbeddings(embeddingInputs.slice(offset, offset + 10), { deadlineAtMs, onRequestStart });
      if (result.model !== embeddingModel) throw new ApiRouteError("provider_unavailable", "语义模型身份发生变化，未混用不同语义空间。");
      combinedVectors.push(...result.vectors);
    }
    if (combinedVectors.length !== texts.length + 1) throw new ApiRouteError("provider_unavailable", "语义向量结果数量无效。");
    vectors = combinedVectors.slice(0, courses.length); query = combinedVectors[courses.length];
    vectors.forEach(vector => normalizedCosine(query, vector));
    await dbQuery("INSERT INTO parent_course_semantic_cache (cache_key,model_identity,dimensions,vectors_json,expires_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE model_identity=VALUES(model_identity),dimensions=VALUES(dimensions),vectors_json=VALUES(vectors_json),expires_at=VALUES(expires_at)", [vectorKey, identity, query.length, encodeDatabaseJson(vectors), new Date(Date.now() + DAY_MS)]);
  }
  if (embeddingModel !== config.embeddingModel || (rows[0] && rows[0].dimensions !== query.length)) {
    await dbQuery("DELETE FROM parent_course_semantic_cache WHERE cache_key=?", [vectorKey]);
    throw new ApiRouteError("provider_unavailable", "向量模型或维度已变化，已废弃旧语义缓存；请重新生成。");
  }
  const latestFeedback = new Map<string, CourseLearningEvent>();
  input.feedback.filter(event => event.type === "feedback").forEach(event => { if (!latestFeedback.has(event.courseId)) latestFeedback.set(event.courseId, event); });
  const pairSimilarities: Record<string, number> = {};
  for (let left = 0; left < courses.length; left++) for (let right = left + 1; right < courses.length; right++) pairSimilarities[pairKey(courses[left].id, courses[right].id)] = normalizedCosine(vectors[left], vectors[right]);
  const optimization: OptimizationInput = {
    candidates: courses.map((course, index) => ({ id: course.id, durationSeconds: course.video.durationSeconds!, goals: course.goals, purpose: course.purpose,
      relevance: normalizedCosine(query, vectors[index]), complementarity: course.purpose === "practice" ? 1 : course.purpose === "demonstrate" ? 0.8 : 0.6,
      preference: latestFeedback.get(course.id)?.feedback === "helpful" ? 1 : ["not-helpful", "too-long", "tried"].includes(latestFeedback.get(course.id)?.feedback || "") ? 0 : 0.5,
      eligible: true, duplicateGroup: safeBilibiliUrl(course.video.url)!,
    })), targetGoals: goals, budgetSeconds: input.budgetMinutes * 60, preferenceAvailable: latestFeedback.size > 0, pairSimilarities,
  };
  const old = await dbQuery<{ result_json: unknown }>("SELECT result_json FROM parent_course_recommendation_jobs WHERE institution_id=? AND user_id=? AND child_id=? AND status='completed' ORDER BY created_at DESC LIMIT 1", [institutionId, userId, input.childId]);
  const previous = decodeDatabaseJson<CourseRecommendation>(old.rows[0]?.result_json);
  const result = reuseRecommendations(optimization, previous?.algorithmVersion === RECOMMENDATION_ALGORITHM_VERSION ? previous.courseIds : []);
  // 独立复核实际资源集合，不信任模型返回的时长、URL或组合。
  if (result.score.durationSeconds > optimization.budgetSeconds || result.ids.some(id => !courses.find(course => course.id === id))) throw new Error("Recommendation verification failed");
  return { courseIds: result.ids, reason: result.ids.length ? selected.reason.slice(0, 500) : "当前预算内没有适合的已核验组合，可增加视频时间预算或先阅读微课。", goals, score: result.score, algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION, model: chat.model, embeddingModel, embeddingDimension: query.length, reused: result.reused };
}

/** 仅 pending 可以被工作者领取。running 中断后标记 unknown，不自动重复付费请求。 */
export async function runCourseRecommendationJob(scope: SessionScope, jobId: string) {
  const job = await getCourseRecommendationJob(scope, jobId);
  if (job.status !== "pending") return;
  const claimed = await withDbTransaction(async connection => {
    const [result] = await connection.execute("UPDATE parent_course_recommendation_jobs SET status='running' WHERE job_id=? AND institution_id=? AND user_id=? AND status='pending'", [jobId, scope.institutionId, scope.user.id]);
    return (result as { affectedRows: number }).affectedRows === 1;
  });
  if (!claimed) return;
  let upstreamStarted = false;
  try {
    const { rows } = await dbQuery<JobRow>("SELECT * FROM parent_course_recommendation_jobs WHERE job_id=? AND institution_id=? AND user_id=?", [jobId, scope.institutionId, scope.user.id]);
    const input = decodeDatabaseJson<RecommendationInput>(rows[0].input_json);
    if (!input) throw new Error("Invalid stored recommendation input");
    const result = await generateRecommendation(input, scope.institutionId, scope.user.id, () => { upstreamStarted = true; });
    await dbQuery("UPDATE parent_course_recommendation_jobs SET status='completed',result_json=?,error_text=NULL WHERE job_id=? AND status='running'", [encodeDatabaseJson(result), jobId]);
  } catch (error) {
    const message = error instanceof ApiRouteError ? error.message : "智慧推荐暂未完成，请稍后重试；已有课程可继续阅读。";
    const status = recommendationFailureStatus(error, upstreamStarted);
    await dbQuery("UPDATE parent_course_recommendation_jobs SET status=?,error_text=? WHERE job_id=? AND status='running'", [status, message.slice(0, 500), jobId]);
  }
}
