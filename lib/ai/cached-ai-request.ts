export interface CachedAiRequestOptions {
  cacheOnly: boolean;
  signal: AbortSignal;
  confirmRetryUnknown?: boolean;
}

export type CachedAiRequestOutcome<T> =
  | { status: "ready"; value: T }
  | { status: "superseded" | "busy" };

/**
 * 将免费读取与明确的生成动作分开，并阻止旧作用域结果覆盖当前页面。
 * 默认读取从不升级为生成；同一版本的重复点击也不会重复发出收费请求。
 */
export class CachedAiRequestController {
  private key: string | null = null;
  private cacheRead: { key: string; controller: AbortController } | null = null;
  private generations = new Set<string>();

  activate(key: string) {
    if (this.key !== key) this.cancelCacheRead();
    this.key = key;
  }

  isGenerating(key: string) {
    return this.generations.has(key);
  }

  cancelCacheRead(key?: string) {
    if (this.cacheRead && (!key || this.cacheRead.key === key)) {
      this.cacheRead.controller.abort();
      this.cacheRead = null;
    }
  }

  async readCached<T>(key: string, request: (options: CachedAiRequestOptions) => Promise<T>): Promise<CachedAiRequestOutcome<T>> {
    this.activate(key);
    if (this.generations.has(key)) return { status: "busy" };
    this.cancelCacheRead();
    const read = { key, controller: new AbortController() };
    this.cacheRead = read;
    try {
      const value = await request({ cacheOnly: true, signal: read.controller.signal });
      return this.key === key && this.cacheRead === read && !read.controller.signal.aborted
        ? { status: "ready", value } : { status: "superseded" };
    } catch (error) {
      if (read.controller.signal.aborted || this.key !== key) return { status: "superseded" };
      throw error;
    } finally {
      if (this.cacheRead === read) this.cacheRead = null;
    }
  }

  async generate<T>(key: string, request: (options: CachedAiRequestOptions) => Promise<T>, confirmRetryUnknown = false): Promise<CachedAiRequestOutcome<T>> {
    this.activate(key);
    if (this.generations.has(key)) return { status: "busy" };
    this.cancelCacheRead();
    this.generations.add(key);
    try {
      // 生成只由点击处理器进入，不依赖刷新nonce。切页不重发、不把旧请求当作新意图。
      const value = await request({ cacheOnly: false, signal: new AbortController().signal, confirmRetryUnknown });
      return this.key === key ? { status: "ready", value } : { status: "superseded" };
    } catch (error) {
      if (this.key !== key) return { status: "superseded" };
      throw error;
    } finally {
      this.generations.delete(key);
    }
  }
}
