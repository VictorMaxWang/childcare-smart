import type { CourseRecommendationJob } from "./types";

export class CourseJobReadError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "CourseJobReadError"; }
}

export interface CoursePollingRuntime {
  isOnline: () => boolean;
  isVisible: () => boolean;
  setTimer: (callback: () => void, delayMs: number) => unknown;
  clearTimer: (timer: unknown) => void;
  subscribe: (resume: () => void) => () => void;
}

/** 恢复只读取已创建的job，永远不调用创建接口或自动重发收费模型请求。 */
export function startCourseJobPolling(options: {
  jobId: string;
  childId: string;
  readJob: (jobId: string, signal: AbortSignal) => Promise<CourseRecommendationJob>;
  onJob: (job: CourseRecommendationJob) => void;
  onError: (message: string | null) => void;
  runtime: CoursePollingRuntime;
}) {
  const { runtime } = options;
  let timer: unknown, controller: AbortController | null = null;
  let stopped = false, busy = false, failures = 0, terminal = false, authorizationFailed = false;
  function clearTimer() { if (timer !== undefined) runtime.clearTimer(timer); timer = undefined; }
  function schedule(delay: number) { clearTimer(); timer = runtime.setTimer(() => { timer = undefined; void poll(); }, delay); }
  async function poll() {
    if (stopped || busy || !runtime.isOnline() || !runtime.isVisible()) return;
    busy = true;
    controller = new AbortController();
    const requestController = controller;
    let timedOut = false;
    // 读取状态也有截止时间；连接悬挂不能让恢复按钮和后续GET永久失效。
    const deadline = runtime.setTimer(() => { timedOut = true; requestController.abort(); }, 10000);
    try {
      const result = await options.readJob(options.jobId, requestController.signal);
      if (stopped || requestController.signal.aborted) return;
      if (result.jobId !== options.jobId || result.childId !== options.childId) throw new CourseJobReadError("推荐任务不属于当前儿童，已停止恢复。", 403);
      failures = 0; authorizationFailed = false;
      terminal = !["pending", "running"].includes(result.status);
      options.onJob(result); options.onError(null);
      if (!terminal) schedule(2500);
    } catch (issue) {
      if (stopped) return;
      const status = issue instanceof CourseJobReadError ? issue.status : null;
      authorizationFailed = status !== null && [401, 403, 404, 410].includes(status);
      failures += 1;
      if (authorizationFailed) options.onError("推荐任务已失效或当前账号无权读取，请确认账号与儿童。");
      else if (failures >= 5) options.onError("推荐状态连续读取失败，已暂停自动查询。可点击“刷新推荐状态”继续读取原任务。");
      else {
        options.onError(timedOut ? "推荐状态读取超时，正在重试原任务。" : "连接暂时中断，正在重试原推荐任务。");
        schedule(Math.min(2500 * 2 ** failures, 30000));
      }
    } finally {
      runtime.clearTimer(deadline);
      busy = false;
      if (controller === requestController) controller = null;
    }
  }
  function refresh() {
    if (stopped || busy) return;
    failures = 0; authorizationFailed = false;
    clearTimer(); void poll();
  }
  const unsubscribe = runtime.subscribe(() => {
    if (stopped || terminal || authorizationFailed || !runtime.isOnline() || !runtime.isVisible()) return;
    refresh();
  });
  schedule(0);
  return {
    refresh,
    stop() { stopped = true; clearTimer(); controller?.abort(); unsubscribe(); },
  };
}

export function courseJobStorageKey(institutionId: string, userId: string, childId: string) {
  return `childcare-course-job:v2:${encodeURIComponent(institutionId)}:${encodeURIComponent(userId)}:${encodeURIComponent(childId)}`;
}
