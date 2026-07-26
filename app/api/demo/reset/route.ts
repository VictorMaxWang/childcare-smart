import { apiOk, withApiErrors } from "@/lib/server/api-errors";
import { resetDemoRepositorySnapshot } from "@/lib/server/app-data-repository";
import { requireDemoSession } from "@/lib/server/session";

export const runtime = "nodejs";

export function POST(request: Request) {
  return withApiErrors(async () => {
    const session = await requireDemoSession(request);
    const snapshot = resetDemoRepositorySnapshot(session.user);
    return apiOk({
      reset: true,
      institutionId: session.user.institutionId,
      childCount: snapshot.children.length,
    });
  });
}
