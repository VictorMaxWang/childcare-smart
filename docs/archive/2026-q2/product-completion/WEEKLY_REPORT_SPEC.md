# Weekly Report Spec

## MVP Flow

1. 调用现有 `/api/ai/weekly-report` 生成预览。
2. 用户确认后调用 `POST /api/weekly-reports` 保存为周报记录。
3. 周报可在历史列表查看、归档、恢复。
4. 导出基于已保存记录，不基于页面临时内容。
5. 分享先做站内授权分享，不做公网匿名链接。

## Report Record

```ts
interface WeeklyReportRecord {
  reportId: string;
  institutionId: string;
  scopeType: "institution" | "class" | "child";
  scopeId: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  status: "draft" | "archived" | "shared";
  payload: Record<string, unknown>;
  sourceRecordIds: string[];
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archivedBy?: string;
  share?: WeeklyReportShare;
}
```

## Export

支持格式：

- `json`
- `markdown`
- `html`
- browser print-friendly HTML
- copy share text

PDF 不进入 MVP；如果按钮存在，必须明确标记暂未开放。

## Share

站内分享字段：

- `shareId`
- `reportId`
- `scope`
- `expiresAt`
- `createdBy`
- `createdAt`

分享访问仍需登录和 scope 校验。

## E03 Implementation Notes

- Production weekly report persistence now uses `/api/weekly-reports`; `/api/ai/weekly-report` remains preview compatibility only.
- `POST /api/weekly-reports` resolves scope on the server and generates `payload`, `sourceRecordIds`, and `dataQuality` from real E01 snapshot records.
- `GET /api/weekly-reports`, `GET /api/weekly-reports/[reportId]`, `PATCH /api/weekly-reports/[reportId]`, `POST /api/weekly-reports/[reportId]/archive`, `GET /api/weekly-reports/[reportId]/export`, and `POST /api/weekly-reports/[reportId]/share` use `AppDataService`.
- Archive hides reports from the default list. `includeArchived=1` shows archived history.
- Export MVP supports `json`, `markdown`, `html`, `print-html`, and `share-text`; PDF is outside E03 MVP.
- Share MVP stores `shareId`, `sharedBy`, `sharedAt`, `summary`, and `localText` on the report and still requires login plus report scope.
- The director weekly report workspace uses `lib/api/weekly-reports.ts` and browser Blob/clipboard APIs for MVP export/share.
