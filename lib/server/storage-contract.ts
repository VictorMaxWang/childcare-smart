import type { SessionUser } from "@/lib/auth/accounts";
import type {
  ApiAttachment,
  ApiWeeklyReport,
  AttachmentRelatedType,
  ReportScopeType,
  StorageObject,
  StorageObjectKind,
  StorageObjectMode,
  StorageObjectPermissions,
} from "@/lib/api/types";

type StorageEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

const LOCAL_DEMO_PREFIXES = [
  "/demo-media/",
  "/storybook/",
  "/demo-growth/",
  "/pixel-replica/",
  "/api/ai/parent-storybook/media/",
];

function readEnvFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function normalizeProvider(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isObjectStorageConfigured(env: StorageEnv = process.env) {
  const provider = normalizeProvider(env.OBJECT_STORAGE_PROVIDER ?? env.STORAGE_PROVIDER);
  if (!provider || provider === "none" || provider === "local" || provider === "demo") return false;
  if (!readEnvFlag(env.OBJECT_STORAGE_UPLOAD_ENABLED ?? env.OBJECT_STORAGE_ENABLED)) return false;
  return Boolean(
    env.OBJECT_STORAGE_BUCKET &&
      (env.OBJECT_STORAGE_ACCESS_KEY_ID ||
        env.OBJECT_STORAGE_TOKEN ||
        env.OBJECT_STORAGE_CONNECTION_STRING ||
        env.BLOB_READ_WRITE_TOKEN)
  );
}

export function isDataUrl(value?: string | null) {
  return typeof value === "string" && /^data:[^,]+,/i.test(value);
}

export function isCachedMediaUrl(value?: string | null) {
  return typeof value === "string" && value.startsWith("/api/ai/parent-storybook/media/");
}

export function isPublicLocalDemoUrl(value?: string | null) {
  return typeof value === "string" && LOCAL_DEMO_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function isLocalDemoPreviewUrl(value?: string | null) {
  return isDataUrl(value) || isPublicLocalDemoUrl(value);
}

export function canServeAttachmentLocalPreview(value?: string | null) {
  return isDataUrl(value);
}

export function resolveAttachmentStorageMode(input: {
  storageMode?: string | null;
  localPreviewUrl?: string | null;
}) {
  if (isObjectStorageConfigured() && input.storageMode === "object_storage") return "object_storage";
  if (isLocalDemoPreviewUrl(input.localPreviewUrl)) return "local_demo";
  return "metadata_only";
}

function buildPermissions(
  session: SessionUser | undefined,
  permissions: Omit<StorageObjectPermissions, "actorId" | "actorRole">
): StorageObjectPermissions {
  return {
    actorId: session?.id,
    actorRole: session?.role,
    ...permissions,
  };
}

function storageUrlFor(mode: StorageObjectMode, value?: string | null) {
  return mode === "object_storage" ? value ?? null : null;
}

function ownerFor(input: {
  institutionId: string;
  childId?: string;
  createdBy?: string;
}): StorageObject["owner"] {
  if (input.childId) {
    return {
      ownerType: "child",
      ownerId: input.childId,
      institutionId: input.institutionId,
      childId: input.childId,
      createdBy: input.createdBy,
    };
  }
  return {
    ownerType: "institution",
    ownerId: input.institutionId,
    institutionId: input.institutionId,
    createdBy: input.createdBy,
  };
}

export function buildAttachmentStorageObject(
  attachment: Pick<
    ApiAttachment,
    | "attachmentId"
    | "institutionId"
    | "childId"
    | "relatedType"
    | "relatedId"
    | "kind"
    | "storageMode"
    | "localPreviewUrl"
    | "createdBy"
  >,
  session?: SessionUser
): StorageObject {
  const mode = resolveAttachmentStorageMode(attachment);
  const previewUrl = isLocalDemoPreviewUrl(attachment.localPreviewUrl) ? attachment.localPreviewUrl ?? null : null;
  const canPreview = Boolean(previewUrl);
  const canDownload = canServeAttachmentLocalPreview(previewUrl);
  const metadataOnly = mode === "metadata_only";

  return {
    id: attachment.attachmentId,
    owner: ownerFor({
      institutionId: attachment.institutionId,
      childId: attachment.childId,
      createdBy: attachment.createdBy,
    }),
    scope: {
      institutionId: attachment.institutionId,
      childId: attachment.childId,
      relatedType: attachment.relatedType,
      relatedId: attachment.relatedId,
    },
    kind: "attachment",
    storageMode: mode,
    url: storageUrlFor(mode, previewUrl),
    localPreviewUrl: previewUrl,
    metadataOnly,
    expiresAt: null,
    permissions: buildPermissions(session, {
      canRead: true,
      canPreview,
      canDownload,
      canShare: false,
      reason: metadataOnly
        ? "metadata_only_waiting_object_storage"
        : canDownload
          ? "scoped_local_demo_preview"
          : "local_demo_preview_only",
    }),
  };
}

export function decorateAttachmentStorage(attachment: ApiAttachment, session?: SessionUser): ApiAttachment {
  const storageObject = buildAttachmentStorageObject(attachment, session);
  const downloadUrl = storageObject.permissions.canDownload
    ? `/api/attachments/${attachment.attachmentId}/content`
    : undefined;

  return {
    ...attachment,
    storageMode: storageObject.storageMode,
    uploadStatus: storageObject.storageMode === "object_storage" ? attachment.uploadStatus : "metadata_saved",
    localPreviewUrl: storageObject.localPreviewUrl ?? undefined,
    downloadUrl,
    metadataOnly: storageObject.metadataOnly,
    storageObject,
  };
}

export function normalizeAttachmentStorageForSnapshot(
  attachment: ApiAttachment,
  session?: SessionUser
): ApiAttachment {
  return decorateAttachmentStorage(
    {
      ...attachment,
      uploadStatus:
        isObjectStorageConfigured() && attachment.storageMode === "object_storage"
          ? attachment.uploadStatus
          : "metadata_saved",
      downloadUrl: undefined,
    },
    session
  );
}

export function buildWeeklyReportExportStorageObject(
  report: ApiWeeklyReport,
  format: string,
  session?: SessionUser
): StorageObject {
  return {
    id: `${report.reportId}:export:${format}`,
    owner: ownerFor({
      institutionId: report.institutionId,
      childId: report.scopeType === "child" ? report.scopeId : undefined,
      createdBy: report.createdBy,
    }),
    scope: {
      institutionId: report.institutionId,
      childId: report.scopeType === "child" ? report.scopeId : undefined,
      scopeType: report.scopeType,
      scopeId: report.scopeId,
      relatedType: "weekly-report",
      relatedId: report.reportId,
    },
    kind: "weekly-report-export",
    storageMode: "metadata_only",
    url: null,
    localPreviewUrl: null,
    metadataOnly: true,
    expiresAt: null,
    permissions: buildPermissions(session, {
      canRead: true,
      canPreview: false,
      canDownload: true,
      canShare: false,
      reason: "generated_local_artifact_not_object_storage",
    }),
  };
}

export function buildWeeklyReportShareStorageObject(
  report: ApiWeeklyReport,
  shareId: string,
  session?: SessionUser
): StorageObject {
  return {
    id: `${report.reportId}:share:${shareId}`,
    owner: ownerFor({
      institutionId: report.institutionId,
      childId: report.scopeType === "child" ? report.scopeId : undefined,
      createdBy: report.createdBy,
    }),
    scope: {
      institutionId: report.institutionId,
      childId: report.scopeType === "child" ? report.scopeId : undefined,
      scopeType: report.scopeType,
      scopeId: report.scopeId,
      relatedType: "weekly-report",
      relatedId: report.reportId,
    },
    kind: "weekly-report-share",
    storageMode: "metadata_only",
    url: null,
    localPreviewUrl: null,
    metadataOnly: true,
    expiresAt: null,
    permissions: buildPermissions(session, {
      canRead: true,
      canPreview: false,
      canDownload: false,
      canShare: true,
      reason: "generated_local_share_text_not_public_link",
    }),
  };
}

function resolveStorybookMediaMode(sourceUrl?: string | null, requestedMode?: StorageObjectMode): StorageObjectMode {
  if (requestedMode === "cached_media" || isCachedMediaUrl(sourceUrl)) return "cached_media";
  if (requestedMode === "local_demo" || isLocalDemoPreviewUrl(sourceUrl)) return "local_demo";
  if (requestedMode === "metadata_only") return "metadata_only";
  return "fallback";
}

export function buildStorybookMediaStorageObject(input: {
  id: string;
  kind: Extract<StorageObjectKind, "storybook-image" | "storybook-audio">;
  institutionId?: string;
  childId: string;
  storybookId: string;
  sourceUrl?: string | null;
  storageMode?: StorageObjectMode;
  expiresAt?: string | null;
  session?: SessionUser;
}): StorageObject {
  const mode = resolveStorybookMediaMode(input.sourceUrl, input.storageMode);
  const previewUrl = input.sourceUrl && (mode === "local_demo" || mode === "cached_media" || mode === "fallback")
    ? input.sourceUrl
    : null;
  const metadataOnly = mode === "metadata_only";
  return {
    id: input.id,
    owner: {
      ownerType: "child",
      ownerId: input.childId,
      institutionId: input.institutionId,
      childId: input.childId,
    },
    scope: {
      institutionId: input.institutionId ?? "",
      childId: input.childId,
      relatedType: "storybook-media",
      relatedId: input.storybookId,
    },
    kind: input.kind,
    storageMode: mode,
    url: storageUrlFor(mode, previewUrl),
    localPreviewUrl: previewUrl,
    metadataOnly,
    expiresAt: input.expiresAt ?? null,
    permissions: buildPermissions(input.session, {
      canRead: true,
      canPreview: Boolean(previewUrl),
      canDownload: mode === "cached_media",
      canShare: false,
      reason:
        mode === "cached_media"
          ? "in_memory_cached_media"
          : mode === "local_demo"
            ? "local_demo_static_asset"
            : mode === "metadata_only"
              ? "metadata_only_waiting_object_storage"
              : "provider_or_fallback_media_not_persisted",
    }),
  };
}

export function buildDeniedStorageObject(input: {
  id: string;
  kind: StorageObjectKind;
  institutionId: string;
  childId?: string;
  scopeType?: ReportScopeType;
  scopeId?: string;
  relatedType?: AttachmentRelatedType | "storybook-media" | "weekly-report";
  relatedId?: string;
  session?: SessionUser;
  reason?: string;
}): StorageObject {
  return {
    id: input.id,
    owner: ownerFor({
      institutionId: input.institutionId,
      childId: input.childId,
      createdBy: input.session?.id,
    }),
    scope: {
      institutionId: input.institutionId,
      childId: input.childId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
    },
    kind: input.kind,
    storageMode: "metadata_only",
    url: null,
    localPreviewUrl: null,
    metadataOnly: true,
    expiresAt: null,
    permissions: buildPermissions(input.session, {
      canRead: false,
      canPreview: false,
      canDownload: false,
      canShare: false,
      reason: input.reason ?? "permission_denied",
    }),
  };
}
