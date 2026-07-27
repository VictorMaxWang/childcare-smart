import { isPrivateBlobConfigured } from "@/lib/server/private-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function currentDeploymentUrl() {
  const value = process.env.VERCEL_URL?.trim();
  if (!value) return null;
  try {
    return new URL(
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`
    ).origin;
  } catch {
    return null;
  }
}

/**
 * 提供无需登录的部署探针，只返回能力是否已配置，不回传连接串、令牌或密钥内容。
 */
export function GET() {
  return Response.json(
    {
      ok: true,
      service: "childcare-smart-web",
      status: "ok",
      environment:
        process.env.VERCEL_ENV?.trim() ||
        process.env.NODE_ENV?.trim() ||
        "unknown",
      deployment: {
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null,
        deploymentId: process.env.VERCEL_DEPLOYMENT_ID?.trim() || null,
        deploymentUrl: currentDeploymentUrl(),
      },
      capabilities: {
        database: configured(process.env.DATABASE_URL),
        auth: configured(process.env.AUTH_SESSION_SECRET),
        privateBlob: isPrivateBlobConfigured(),
        dashscope: configured(process.env.DASHSCOPE_API_KEY),
      },
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
