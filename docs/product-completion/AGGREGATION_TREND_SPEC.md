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

