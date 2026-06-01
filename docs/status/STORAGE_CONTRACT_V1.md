# Storage Contract V1

## 目标

Storage Contract V1 用于让附件、绘本媒体、周报导出/分享明确说明当前存储事实。V1 不接入 S3、COS、OSS、Vercel Blob 或其他对象存储，不生成匿名公网链接，也不把本地演示资源描述成生产云存储。

## StorageObject Schema

`StorageObject` 是 API 的附加合同字段：

- `id`: 存储对象或生成物的稳定标识。
- `owner`: 所属主体，包含 `ownerType`、`ownerId`、`institutionId`、`childId`、`createdBy`。
- `scope`: 访问边界，包含 `institutionId`、`childId`、`scopeType`、`scopeId`、`relatedType`、`relatedId`。
- `kind`: `attachment`、`storybook-image`、`storybook-audio`、`weekly-report-export`、`weekly-report-share` 等。
- `storageMode`: 当前事实模式。
- `url`: 仅生产对象存储可填写；V1 本地演示、缓存、仅元数据均为 `null`。
- `localPreviewUrl`: 本地演示或缓存可预览地址；仅元数据为 `null`。
- `metadataOnly`: 是否只有元数据，没有可服务二进制。
- `expiresAt`: 短期缓存媒体过期时间；非缓存为 `null`。
- `permissions`: actor/role 可读的权限布尔值：`canRead`、`canPreview`、`canDownload`、`canShare`，以及可选 `reason`。

## Storage Modes

- `object_storage`: 预留未来生产对象存储。V1 不会在对象存储 env 缺失时返回该模式。
- `local_demo`: 本地演示预览，例如 data URL、`public/demo-media`、`public/storybook` 等静态资源。
- `metadata_only`: 只保存文件名、类型、大小、归属等元数据，等待对象存储接入。
- `cached_media`: 绘本媒体短期内存缓存，通过 scoped route 读取，有 `expiresAt`。
- `fallback`: 来自 provider/fallback 的未持久化媒体地址或占位媒体，不声明生产持久化。

## 当前行为

### Attachments

- `ApiAttachment.storageObject` 和 `metadataOnly` 已加入响应。
- 无对象存储 env 时，旧的 `uploaded` 或客户端传入的上传状态不会被信任。
- 有 data URL 本地预览的附件返回 `local_demo`，页面文案为“本地演示预览”。
- 没有可服务预览的附件返回 `metadata_only`，页面文案为“仅保存元数据，待接入对象存储”。
- `downloadUrl` 只在 scoped content route 可以实际返回本地 data URL 二进制时暴露。

### Storybook Media

- 场景媒体可带 `imageStorageObject`、`audioStorageObject`。
- `public/demo-media`、`public/storybook` 和固定绘本资源保留为稳定本地演示，标记为 `local_demo`。
- `/api/ai/parent-storybook/media/[mediaKey]` 内存缓存媒体标记为 `cached_media`，响应头暴露 storage mode 和过期时间。
- provider/fallback 未持久化媒体标记为 `fallback`，页面文案使用“待接入对象存储”。

### Weekly Export/Share

- 周报导出返回 `storageObject`。
- 周报分享写入 `share.storageObject`。
- 二者均为 `metadata_only` 生成物，`url: null`，没有公网分享链接。
- 页面 toast 使用本地下载/本地复制文案，不声明外部分享或云存储。

## Permission Model

- 权限判断仍由现有 session、institution、child、weekly report/storybook scope 完成。
- `StorageObject.permissions` 只反映已经通过 scope 校验后的可读能力，或在 denied 测试对象中明确 `canRead: false`。
- 附件本地 data URL：`canPreview: true`、`canDownload: true`。
- 附件仅元数据：`canPreview: false`、`canDownload: false`。
- 绘本缓存媒体：`canPreview: true`、`canDownload: true`，但只能由所属 child session 读取。
- 周报导出：`canDownload: true`，但下载内容来自即时响应，不是对象存储 URL。
- 周报分享：`canShare: true`，但仅表示本地分享文案可复制，不是公网链接。

## Non-goals

- 不实现云上传。
- 不生成匿名公网链接。
- 不持久化 PDF、音频、图片包到对象存储。
- 不把 provider 返回的媒体 URL 当作本系统生产存储。
- 不把本地静态 demo 资源删除或替换。

## Future Adapter Requirements

在任何 API 返回 `object_storage` 或 `uploaded` 前，必须先补齐：

- 明确的对象存储 provider 配置和健康检查。
- 服务端上传、下载、删除、签名 URL 适配器。
- owner/scope 到 bucket/key 的隔离规则。
- 私有读权限校验和过期签名策略。
- 对附件、绘本媒体、周报导出包的持久化生命周期策略。
- 针对跨机构、跨 child、过期 URL、删除后访问的测试。

在这些条件完成前，所有本地 demo、缓存、fallback 和 metadata-only 状态都必须按 V1 合同诚实呈现。
