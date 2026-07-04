# Normal Session AI Access

Last updated: 2026-06-01

## Summary

`/api/ai/*` no longer treats normal registered accounts as universally unavailable. AI access is now decided by the unified AI route guard:

- Missing session returns `401` with `limited=true` and `reason=login_required`.
- Wrong role returns `403` with `reason=role_mismatch`.
- Child/class/institution authorization failures return `403` with `reason=forbidden_child` or `forbidden_class`.
- Business scope limits return `423` with `code=limited`, including `reason=scope_required`, `normal_session_not_enabled`, or `demo_seed_only`.

All limited responses also include `requiredRole` and `demoAvailable`.

## Route Matrix

| Route | Normal access | Required role | Scope rule |
| --- | --- | --- | --- |
| `/api/ai/provider-status` | Open | any logged-in account | No business scope required |
| `/api/ai/voice-asr` | Open | any logged-in account | No business scope required |
| `/api/ai/diet-evaluation` | Open | any logged-in account | No business scope required |
| `/api/ai/intent-router` | Open | any logged-in account | `roleHint`, when present, must match session role |
| `/api/ai/suggestions` | Open | parent | Own child only |
| `/api/ai/follow-up` | Open | parent | Own child only |
| `/api/ai/parent-message-reflexion` | Open | parent | Own child only |
| `/api/ai/parent-trend-query` | Open | parent | Own child only |
| `/api/ai/parent-storybook` | Open | parent | Own child only; demo seed requests remain demo-only |
| `/api/ai/parent-storybook/media-status` | Open | parent | Own child only |
| `/api/ai/parent-storybook/media/[mediaKey]` | Open | parent | Cached media owner child must be accessible |
| `/api/ai/teacher-agent` | Open | teacher or admin | Child/class hints must be in session scope |
| `/api/ai/high-risk-consultation` | Open | teacher or admin | Child/class hints must be in session scope |
| `/api/ai/high-risk-consultation/stream` | Open | teacher or admin | Child/class hints must be in session scope |
| `/api/ai/health-file-bridge` | Open | teacher or admin | Child/class hints must be in session scope |
| `/api/ai/teacher-voice-understand` | Open | teacher or admin | Optional child/class hints must be in session scope |
| `/api/ai/teacher-voice-upload` | Open | teacher or admin | Optional child/class hints must be in session scope |
| `/api/ai/vision-meal` | Open | teacher or admin | Optional child/class hints must be in session scope |
| `/api/ai/admin-agent` | Open | admin | Institution/admin scope only |
| `/api/ai/admin-quality-metrics` | Open | admin | Institution/admin scope only |
| `/api/ai/weekly-report` | Scoped only | role from payload | Normal accounts must provide `scopeType/scopeId`; demo keeps legacy unscoped payloads |
| `/api/ai/high-risk-consultation/feed` | Scoped only | teacher or admin | Normal accounts must provide explicit child/class/institution scope |
| `/api/ai/react-agent` | Limited | demo only for now | `normal_session_not_enabled` |
| `/api/ai/stream` | Limited | demo only for now | `normal_session_not_enabled` |

## Testing Notes

- Guard unit tests use in-memory sessions and snapshots, so child/class scope behavior is covered without `DATABASE_URL`.
- Browser/API normal-account tests use `/api/auth/register`; they skip only when `DATABASE_URL` or `AUTH_SESSION_SECRET` is unavailable.
- Missing provider credentials are not treated as authorization failures. Routes may still return `provider_unavailable` after normal-session auth succeeds.
