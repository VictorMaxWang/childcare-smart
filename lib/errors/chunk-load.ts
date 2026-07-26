const CHUNK_ERROR_PATTERNS = [
  /\bChunkLoadError\b/i,
  /failed to load chunk/i,
  /loading chunk .+ failed/i,
  /CSS_CHUNK_LOAD_FAILED/i,
];

/**
 * 判断错误是否来自发布后静态分片未能加载。
 *
 * 不依赖某个 Next.js 版本的错误类，因为不同浏览器和构建器可能只保留
 * name、message 或 cause 中的一部分文本。
 */
export function isChunkLoadError(value: unknown) {
  const error = value instanceof Error ? value : null;
  const cause =
    error?.cause instanceof Error
      ? `${error.cause.name} ${error.cause.message}`
      : typeof error?.cause === "string"
        ? error.cause
        : "";
  const text = [
    error?.name,
    error?.message,
    error?.stack,
    cause,
    typeof value === "string" ? value : "",
  ]
    .filter(Boolean)
    .join(" ");

  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}
