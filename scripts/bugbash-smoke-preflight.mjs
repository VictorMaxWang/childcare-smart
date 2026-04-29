import { existsSync } from "node:fs";

const port = process.env.BUGBASH_PORT?.trim() || "3330";
const baseURL = (process.env.BUGBASH_BASE_URL?.trim() || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const hasExplicitBaseURL = Boolean(process.env.BUGBASH_BASE_URL?.trim());
const skipWebServer = process.env.BUGBASH_SKIP_WEBSERVER === "1";
const devLockExists = existsSync(".next/dev/lock");

async function isReachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(new URL("/login", url), {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (hasExplicitBaseURL || skipWebServer || devLockExists) {
  const reachable = await isReachable(baseURL);
  if (!reachable) {
    const reason = hasExplicitBaseURL
      ? `BUGBASH_BASE_URL is set to ${baseURL}, but /login is not reachable.`
      : devLockExists
        ? `.next/dev/lock exists, so bugbash:smoke will not start another Next dev server, but ${baseURL}/login is not reachable.`
        : `BUGBASH_SKIP_WEBSERVER=1 is set, but ${baseURL}/login is not reachable.`;

    console.error(
      [
        `[bugbash:smoke] ${reason}`,
        "Start or reuse a local service, then run for example:",
        "  PowerShell: $env:BUGBASH_BASE_URL='http://127.0.0.1:3000'; npm run bugbash:smoke; Remove-Item Env:BUGBASH_BASE_URL",
        "Or stop the existing Next dev server and run npm run bugbash:smoke without BUGBASH_BASE_URL.",
      ].join("\n")
    );
    process.exit(1);
  }
}

