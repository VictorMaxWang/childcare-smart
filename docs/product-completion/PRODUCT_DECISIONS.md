# Product Decisions

## Safe Defaults

- 删除即归档，不提供硬删除。
- 周报分享为站内授权分享，不开放公网匿名链接。
- 导出先支持 JSON、Markdown、HTML、复制文本。
- 附件在没有真实存储前保存元数据和预览，不显示云端成功。
- OCR/ASR fallback 只生成草稿，确认后才能写正式记录。
- 教师管理 MVP 只做列表、详情、班级绑定、启用/停用。
- 绘本分享导出 MVP 做站内查看、文本/HTML 导出，不做音频/图片包下载。

## Disabled Policy

不能完成真实功能的按钮必须：

- `disabled` 或 `aria-disabled`
- 有可见说明：`暂未开放`、`需要接入存储服务`、`需要真实 provider`
- 不触发成功 toast
- 不写入正式数据

