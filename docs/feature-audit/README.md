# 智慧托育平台功能完整性审计

本目录用于 C00 功能完整性审计总控。第一轮只审计，不修复业务源码。

## 审计目标

- 系统性找出功能不完整、只做前端、mock 数据、visual-only、没有持久化、没有真实 API 的地方。
- 用统一 finding schema 记录证据，避免不同线程重复改同一个汇总文件。
- 将 Browser Use 真实操作和代码扫描结果交给 C99 统一汇总、分级和路线图排序。

## 输出规则

- C10-C15 是 Browser Use 审计线程，必须像真实用户一样点击页面、提交表单、观察网络请求、刷新验证持久化。
- C20-C23 是代码扫描线程，必须给出 `sourceFiles`、`apiEndpoints`、`codeSignals` 和 likely implementation gap。
- 每个线程只写自己的 JSON findings 和同名 markdown 报告。
- 不要并行写 `INCOMPLETE_FEATURES.json`，该文件只由 C99 汇总线程维护。
- 第一轮不修业务源码，不做实现补丁，不重构。

## 统一 Finding Schema

每个 findings JSON 必须是数组。每条记录必须包含以下字段：

```json
{
  "findingId": "C10-001",
  "title": "家长端家园沟通回复按钮只有 UI，没有真实提交",
  "severity": "F1",
  "status": "open",
  "featureArea": "parent-communication",
  "role": "parent | teacher | director | shared",
  "demoAccount": "林妈妈 | 李老师 | 周老师 | 陈园长 | none",
  "route": "/parent/agent?child=c-1#feedback",
  "viewport": "desktop | mobile | tablet | code",
  "featureStatus": "complete | partial | ui-only | mock-only | visual-only | fake-success | not-persisted | backend-missing | permission-incomplete | broken | needs-product-spec",
  "userStory": "作为家长，我希望能回复老师消息",
  "reproSteps": [],
  "expected": "",
  "actual": "",
  "evidence": {
    "screenshots": [],
    "consoleErrors": [],
    "networkRequests": [],
    "sourceFiles": [],
    "apiEndpoints": [],
    "codeSignals": []
  },
  "dataPersistenceResult": "persisted | lost-after-refresh | no-submit | unknown | not-applicable",
  "apiIntegrationResult": "real-api | mock-only | no-api | local-state-only | unknown",
  "recommendedImplementation": "",
  "backendNeeded": true,
  "frontendNeeded": true,
  "productDecisionNeeded": false,
  "notes": ""
}
```

## 基线检查

C00 已验证以下命令可运行：

- `npm run lint`
- `npm run build`
- `npm run bugbash:smoke`

注意：`bugbash:smoke` 用例通过，但日志出现 Brain 代理访问 `127.0.0.1:8000/8010` 失败后 fallback。后续线程需要把相关功能是否真实接入后端作为审计重点。

