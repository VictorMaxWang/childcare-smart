# 功能审计清单

本文件是 C00 建立的第一版审计入口清单，不代表最终状态。各线程应按实际浏览器行为和源码证据补充或调整。

| 功能区域 | 角色 | 主要路由 | 初始审计线程 | 重点问题 |
| --- | --- | --- | --- | --- |
| 家长首页 | parent | `/parent?child=c-1` | C10 | 孩子参数、饮食/健康/提醒数据是否真实、刷新后是否稳定。 |
| 家长 AI 建议与反馈 | parent | `/parent/agent?child=c-1#feedback` | C10, C13, C15 | 家园沟通、回复、反馈提交、toast 成功是否真实持久化。 |
| 家长成长绘本 | parent | `/parent/storybook?child=c-1` | C10, C15 | 绘本生成是否真实 API、结果是否缓存、换孩子/账号隔离。 |
| 幼儿档案 | shared | `/children` | C20, C21 | 是否只展示 mock；不同角色数据范围。 |
| 晨检与健康 | shared | `/health` | C14, C20, C21 | 健康记录、材料解析、上传与高风险流转。 |
| 成长行为 | shared | `/growth` | C20, C22 | 新增/编辑/保存是否真实。 |
| 饮食记录 | shared | `/diet` | C20, C22 | 营养餐谱、视觉识别、评价结果是否持久化。 |
| 教师工作台 | teacher | `/teacher`, `/teacher/home` | C11 | 班级范围、记录提交、草稿确认。 |
| 教师 AI 助手 | teacher | `/teacher/agent` | C11, C22 | 语音/文本输入、生成记录、确认保存。 |
| 教师健康材料 | teacher | `/teacher/health-file-bridge` | C14 | 上传、OCR/解析、结果入库、错误态。 |
| 教师高风险会诊 | teacher | `/teacher/high-risk-consultation` | C11, C14 | 会诊 feed、流式结果、转办/反馈是否真实。 |
| 园长看板 | director | `/admin` | C12 | 管理看板是否真实数据、通知事件是否来自接口。 |
| 园长 AI 助手 | director | `/admin/agent` | C12 | 工作流执行、周报生成、管理动作是否持久。 |
| 周报分析 | director | `/admin/agent?action=weekly-report` | C12, C15 | 周报 API、刷新持久化、失败降级。 |
| 登录和权限 | shared | `/login`, `/api/auth/*` | C21 | 角色隔离、demo 账号、会话恢复。 |

