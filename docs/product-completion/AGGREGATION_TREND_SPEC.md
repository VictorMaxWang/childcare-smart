# Aggregation And Trend Spec

## Data Sources

聚合和趋势优先从业务数据服务读取：

- `children`
- `attendance`
- `health`
- `meals`
- `growth`
- `feedback`
- `consultations`
- `tasks`
- `weeklyReports`

FastAPI 的 `parent_trend_service.py` 和 `admin_quality_metrics_engine.py` 可以复用为算法来源，但 Next API 必须提供本地 fallback，不能在 brain 不可用时直接断链。

## Admin Aggregates

`GET /api/analytics/admin/summary` 返回：

- child count
- teacher count
- active consultation count
- high risk count
- feedback count
- record counts by type
- current week deltas
- `sourceRecordIds`
- `dataQuality`

`GET /api/analytics/admin/quality-metrics` 返回：

- communication response metrics
- health abnormal trend
- diet coverage
- growth observation coverage
- consultation closure rate
- sparse data warning

## Child Trend

`GET /api/children/[childId]/trend` 参数：

- `metric`: `health | diet | growth | mood | communication | overall`
- `windowDays`: default `7`

返回：

- `points`
- `summary`
- `recommendations`
- `sourceRecordIds`
- `dataQuality: { sparse, fallback, source }`

## E03 Implementation Notes

- `lib/server/analytics-aggregates.ts` is the single aggregation implementation for director summary, quality metrics, trend series, and weekly report payload source ids.
- No second data source is introduced. Aggregates read the E01 `ApiExtendedSnapshot` through `AppDataService`.
- `GET /api/analytics/admin/summary` returns real counts for children, teachers, today's records, health abnormal records, meal records, growth records, unresolved feedback, high-risk consultations, reminders, class stats, recent 7-day trend, and current-week trend.
- `GET /api/analytics/admin/quality-metrics` returns service-side quality metrics with `sourceRecordIds` and `dataQuality`.
- `GET /api/analytics/trends` supports `timeRange`, `classId`, `childId`, `metric`, and `windowDays`.
- `GET /api/children/[childId]/trend` reuses the same trend builder after `requireChildAccess`.
- Empty trend results return a zero-valued `series`, `emptyReason`, and `dataQuality.sparse=true` instead of mock prosperity.
- Scope enforcement is performed in `AppDataService` with `requireDirector`, `requireChildAccess`, `requireClassAccess`, and shared report helpers from `lib/server/scope.ts`.
