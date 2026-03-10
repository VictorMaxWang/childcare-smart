# Supabase Initialization

1. Create a new Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Run `supabase/post-migration-check.sql` and verify the final summary row shows `overall_passed=true`.
4. `schema.sql` auto-creates private storage buckets:

- `parent-media` (private)
- `institution-reports` (private)

5. Set environment values from `.env.example`.
   - Set `NEXT_PUBLIC_FORCE_MOCK_MODE=true` to force mock mode even if Supabase envs are configured.
6. `schema.sql` now includes an `auth.users` trigger that auto-creates `public.user_profiles` and backfills existing users.
7. `schema.sql` also seeds `public.institutions` and `public.institution_classes` for dynamic signup dropdown options.
8. `schema.sql` includes RLS write policies so `机构管理员` can maintain institution name and class list within their own institution scope.
9. `schema.sql` now includes `public.master_data_audit_logs` to keep an auditable trail for institution/class/assignment changes.
10. `schema.sql` now includes `public.parent_children` for multi-guardian mapping and backfills records from `children.parent_user_id`.
11. `schema.sql` now includes a trigger to auto-sync primary guardian linkage from `children.parent_user_id` into `parent_children`.
12. `schema.sql` now includes `storage.objects` policies for `parent-media` and `institution-reports` buckets.
13. `schema.sql` now includes `public.notification_events`, with triggers for晨检异常/反馈回执 and helper function for任务待打卡事件。
14. `schema.sql` now includes retry/dead-letter fields and `public.notification_dead_letters` for failed event management.

Optional signup metadata (recommended):

- `name`
- `role` (`家长` | `教师` | `机构管理员`)
- `institution_id`
- `class_name`
- `avatar`
- `wechat_openid` (optional, required for real WeChat subscription delivery)

## Next step

Role-based RLS is enabled for core tables and master data tables.
Use `/admin/master-data` (机构管理员身份) to maintain institution/class options used by signup.
Use `/api/admin/audit-logs` or the bottom section in `/admin/master-data` to review recent operations.
Use `/api/admin/notification-events` to query latest events, or POST `{ date, className? }` to enqueue task check-in pending events.
Use `/api/admin/notification-events` with PATCH `{ limit }` to dispatch pending events via configured provider (`NOTIFICATION_PROVIDER`).
Use `/api/admin/notification-dead-letters` to query dead letters, and PATCH `{ action, ids, maxRetries? }` to resolve or requeue.
Use `/api/cron/dispatch-notifications` (GET/POST) with `Authorization: Bearer <CRON_SECRET>` (or `?secret=`) for scheduled cross-institution dispatch.
For WeChat provider, set `WECHAT_SUBSCRIBE_TEMPLATE_ID` and ensure parent `user_profiles.wechat_openid` is populated.
Use `/api/mini-program/auth/bind-openid` with `POST { accessToken, wechatCode }` (or `wechatOpenId`) to bind app users and WeChat recipients.
Use `/api/public/health` for basic uptime health and `/api/admin/system-check` (admin only) for pre-release diagnostics. The response includes `releaseReady`, `blockers`, and `warnings`.
For existing projects, rerun `schema.sql` to create `parent_children` and apply updated storage policies.
`vercel.json` now includes a cron definition for `/api/cron/dispatch-notifications` (every 10 minutes).
Follow `docs/release-checklist.md` for an end-to-end production readiness and rollback checklist.
Next phase is to connect JWT custom claims (optional) and refine institution onboarding workflow.
