export const CHUNK_RECOVERY_SERVICE_WORKER_PATH = "/chunk-recovery-sw.js";

/**
 * 这段脚本必须内联在 HTML 中，不能依赖 Next.js 客户端分片。
 * 否则共享分片本身加载失败时，错误边界和恢复逻辑也无法执行。
 */
export const CHUNK_RECOVERY_BOOTSTRAP = `
(function () {
  var workerPath = "${CHUNK_RECOVERY_SERVICE_WORKER_PATH}";
  var retryKey = "smartchildcare.chunk-resource-retry.v1";
  var recoveryScheduled = false;
  var resourceFailed = false;

  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(workerPath, {
        scope: "/",
        updateViaCache: "none"
      }).catch(function () {});
    }
  } catch (_) {}

  window.addEventListener("error", function (event) {
    var target = event.target;
    var source = target && target.tagName === "SCRIPT" ? target.src : "";
    if (!source || source.indexOf("/_next/static/chunks/") === -1) return;

    resourceFailed = true;
    if (recoveryScheduled) return;
    recoveryScheduled = true;

    var now = Date.now();
    var path = window.location.pathname;
    var previous = {};
    try {
      previous = JSON.parse(window.sessionStorage.getItem(retryKey) || "{}");
    } catch (_) {}

    var recent = previous.path === path && now - Number(previous.at || 0) < 300000;
    var attempts = recent ? Number(previous.attempts || 0) : 0;
    if (attempts >= 2) return;

    try {
      window.sessionStorage.setItem(retryKey, JSON.stringify({
        path: path,
        at: now,
        attempts: attempts + 1
      }));
    } catch (_) {}

    var reload = function () {
      window.setTimeout(function () {
        window.location.reload();
      }, 500);
    };

    if ("serviceWorker" in navigator && navigator.serviceWorker.ready) {
      Promise.race([
        navigator.serviceWorker.ready,
        new Promise(function (resolve) { window.setTimeout(resolve, 2000); })
      ]).then(reload, reload);
    } else {
      reload();
    }
  }, true);

  window.addEventListener("load", function () {
    if (resourceFailed) return;
    try {
      window.sessionStorage.removeItem(retryKey);
    } catch (_) {}
  }, { once: true });
})();
`.trim();
