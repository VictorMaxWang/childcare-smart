-- Post-migration verification checklist for supabase/schema.sql
-- Run this after applying supabase/schema.sql.

-- 1) Core tables present.
select
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_profiles') as has_user_profiles,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'children') as has_children,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parent_children') as has_parent_children,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notification_events') as has_notification_events,
  exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notification_dead_letters') as has_notification_dead_letters;

-- 2) Trigger function for parent-child sync exists.
select
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_parent_children_from_children'
  ) as has_sync_parent_children_function;

-- 3) Trigger for children.parent_user_id sync exists.
select
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'children'
      and t.tgname = 'on_children_parent_user_sync'
      and not t.tgisinternal
  ) as has_children_parent_sync_trigger;

-- 3.1) Notification event triggers and helper function exist.
select
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'health_checks'
      and t.tgname = 'on_health_check_created_emit_event'
      and not t.tgisinternal
  ) as has_health_event_trigger,
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'guardian_feedbacks'
      and t.tgname = 'on_guardian_feedback_created_emit_event'
      and not t.tgisinternal
  ) as has_feedback_event_trigger,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'enqueue_task_checkin_pending_events'
  ) as has_enqueue_task_checkin_pending_events_function;

-- 4) One-primary-per-child partial unique index exists.
select
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'parent_children'
      and indexname = 'idx_parent_children_one_primary_per_child'
  ) as has_primary_guardian_unique_index;

-- 5) Storage buckets exist.
select
  exists (select 1 from storage.buckets where id = 'parent-media') as has_parent_media_bucket,
  exists (select 1 from storage.buckets where id = 'institution-reports') as has_institution_reports_bucket,
  exists (select 1 from storage.buckets where id = 'parent-media' and public = false) as has_parent_media_private_bucket,
  exists (select 1 from storage.buckets where id = 'institution-reports' and public = false) as has_institution_reports_private_bucket;

-- 5.1) Notification retry/dead-letter indexes exist.
select
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'notification_events'
      and indexname = 'idx_notification_events_retry'
  ) as has_notification_events_retry_index,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'notification_dead_letters'
      and indexname = 'idx_notification_dead_letters_institution_created_at'
  ) as has_notification_dead_letters_index;

-- 5.2) Critical RLS policies exist for role-scope data access.
select
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'children'
      and policyname = 'children_select_by_role'
  ) as has_children_select_policy,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'parent_children'
      and policyname = 'parent_children_select_by_role'
  ) as has_parent_children_select_policy,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_events'
      and policyname = 'notification_events_select_by_role'
  ) as has_notification_events_select_policy,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_dead_letters'
      and policyname = 'notification_dead_letters_select_admin_scope'
  ) as has_notification_dead_letters_select_policy;

-- 5.3) Critical storage policies exist.
select
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'parent_media_select_authorized'
  ) as has_parent_media_select_policy,
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'institution_reports_select_admin'
  ) as has_institution_reports_select_policy;

-- 6) RLS is enabled for key tables.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'user_profiles',
    'children',
    'parent_children',
    'notification_events',
    'notification_dead_letters'
  )
order by c.relname;

-- 7) One-row summary for quick acceptance.
with checks as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_profiles') as has_user_profiles,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'children') as has_children,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'parent_children') as has_parent_children,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notification_events') as has_notification_events,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'notification_dead_letters') as has_notification_dead_letters,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'sync_parent_children_from_children'
    ) as has_sync_parent_children_function,
    exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'children'
        and t.tgname = 'on_children_parent_user_sync'
        and not t.tgisinternal
    ) as has_children_parent_sync_trigger,
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'parent_children'
        and indexname = 'idx_parent_children_one_primary_per_child'
    ) as has_primary_guardian_unique_index,
    exists (select 1 from storage.buckets where id = 'parent-media' and public = false) as has_parent_media_private_bucket,
    exists (select 1 from storage.buckets where id = 'institution-reports' and public = false) as has_institution_reports_private_bucket,
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'children'
        and policyname = 'children_select_by_role'
    ) as has_children_select_policy,
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'notification_events'
        and policyname = 'notification_events_select_by_role'
    ) as has_notification_events_select_policy,
    not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('user_profiles','children','parent_children','notification_events','notification_dead_letters')
        and c.relrowsecurity is distinct from true
    ) as key_rls_all_enabled
)
select
  *,
  (
    has_user_profiles
    and has_children
    and has_parent_children
    and has_notification_events
    and has_notification_dead_letters
    and has_sync_parent_children_function
    and has_children_parent_sync_trigger
    and has_primary_guardian_unique_index
    and has_parent_media_private_bucket
    and has_institution_reports_private_bucket
    and has_children_select_policy
    and has_notification_events_select_policy
    and key_rls_all_enabled
  ) as overall_passed
from checks;
