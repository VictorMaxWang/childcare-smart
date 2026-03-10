-- Core profile table linked to Supabase auth.users
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('家长', '教师', '机构管理员')),
  avatar text,
  wechat_openid text,
  institution_id text not null,
  class_name text,
  created_at timestamptz not null default now()
);

alter table public.user_profiles add column if not exists wechat_openid text;

-- Institution and class masters used by signup forms and administrative settings.
create table if not exists public.institutions (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.institution_classes (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references public.institutions(id) on delete cascade,
  class_name text not null,
  created_at timestamptz not null default now(),
  unique(institution_id, class_name)
);

insert into public.institutions (id, name)
values
  ('inst-1', '春芽普惠托育中心'),
  ('inst-2', '星河社区托育点')
on conflict (id) do nothing;

insert into public.institution_classes (institution_id, class_name)
values
  ('inst-1', '向阳班'),
  ('inst-1', '晨曦班'),
  ('inst-2', '星芽班'),
  ('inst-2', '小海豚班')
on conflict (institution_id, class_name) do nothing;

-- Auto-bootstrap user_profiles on auth signup to satisfy RLS dependencies.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, name, role, avatar, wechat_openid, institution_id, class_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), '新用户'),
    coalesce(new.raw_user_meta_data ->> 'role', '家长'),
    coalesce(new.raw_user_meta_data ->> 'avatar', '👤'),
    nullif(new.raw_user_meta_data ->> 'wechat_openid', ''),
    coalesce(new.raw_user_meta_data ->> 'institution_id', 'inst-1'),
    nullif(new.raw_user_meta_data ->> 'class_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- One-time backfill for existing auth users that do not yet have profiles.
insert into public.user_profiles (id, name, role, avatar, wechat_openid, institution_id, class_name)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'name', split_part(coalesce(au.email, ''), '@', 1), '新用户') as name,
  coalesce(au.raw_user_meta_data ->> 'role', '家长') as role,
  coalesce(au.raw_user_meta_data ->> 'avatar', '👤') as avatar,
  nullif(au.raw_user_meta_data ->> 'wechat_openid', '') as wechat_openid,
  coalesce(au.raw_user_meta_data ->> 'institution_id', 'inst-1') as institution_id,
  nullif(au.raw_user_meta_data ->> 'class_name', '') as class_name
from auth.users au
left join public.user_profiles up on up.id = au.id
where up.id is null;

update public.user_profiles up
set wechat_openid = nullif(au.raw_user_meta_data ->> 'wechat_openid', '')
from auth.users au
where up.id = au.id
  and up.wechat_openid is null
  and coalesce(au.raw_user_meta_data ->> 'wechat_openid', '') <> '';

create table if not exists public.children (
  id text primary key,
  name text not null,
  nickname text,
  birth_date date not null,
  gender text not null check (gender in ('男', '女')),
  allergies text[] not null default '{}',
  height_cm numeric not null default 0,
  weight_kg numeric not null default 0,
  guardians jsonb not null default '[]'::jsonb,
  institution_id text not null,
  class_name text not null,
  special_notes text not null default '',
  avatar text not null,
  parent_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Parent-child mapping for multi-guardian binding and future extensibility.
create table if not exists public.parent_children (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.user_profiles(id) on delete cascade,
  child_id text not null references public.children(id) on delete cascade,
  relation text not null default '监护人',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(parent_user_id, child_id)
);

-- Backfill mapping from legacy children.parent_user_id.
insert into public.parent_children (parent_user_id, child_id, relation, is_primary)
select c.parent_user_id, c.id, '监护人', true
from public.children c
where c.parent_user_id is not null
on conflict (parent_user_id, child_id) do nothing;

create index if not exists idx_parent_children_child_id
on public.parent_children (child_id);

create index if not exists idx_parent_children_parent_user_id
on public.parent_children (parent_user_id);

create unique index if not exists idx_parent_children_one_primary_per_child
on public.parent_children (child_id)
where is_primary;

-- Keep parent_children in sync with children.parent_user_id for primary guardian linkage.
create or replace function public.sync_parent_children_from_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_user_id is not null then
      insert into public.parent_children (parent_user_id, child_id, relation, is_primary)
      values (new.parent_user_id, new.id, '监护人', true)
      on conflict (parent_user_id, child_id)
      do update set is_primary = true;

      update public.parent_children
      set is_primary = false
      where child_id = new.id
        and parent_user_id <> new.parent_user_id
        and is_primary = true;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' and new.parent_user_id is distinct from old.parent_user_id then
    if old.parent_user_id is not null then
      update public.parent_children
      set is_primary = false
      where child_id = new.id
        and parent_user_id = old.parent_user_id;
    end if;

    if new.parent_user_id is not null then
      insert into public.parent_children (parent_user_id, child_id, relation, is_primary)
      values (new.parent_user_id, new.id, '监护人', true)
      on conflict (parent_user_id, child_id)
      do update set is_primary = true;

      update public.parent_children
      set is_primary = false
      where child_id = new.id
        and parent_user_id <> new.parent_user_id
        and is_primary = true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_children_parent_user_sync on public.children;
create trigger on_children_parent_user_sync
after insert or update of parent_user_id on public.children
for each row execute function public.sync_parent_children_from_children();

create table if not exists public.attendance_records (
  id text primary key,
  child_id text not null references public.children(id) on delete cascade,
  date date not null,
  is_present boolean not null,
  check_in_at text,
  check_out_at text,
  absence_reason text,
  created_at timestamptz not null default now(),
  unique(child_id, date)
);

create table if not exists public.health_checks (
  id text primary key,
  child_id text not null references public.children(id) on delete cascade,
  date date not null,
  temperature numeric not null,
  mood text not null,
  hand_mouth_eye text not null check (hand_mouth_eye in ('正常', '异常')),
  is_abnormal boolean not null,
  remark text,
  checked_by uuid references public.user_profiles(id) on delete set null,
  checked_by_role text not null,
  created_at timestamptz not null default now(),
  unique(child_id, date)
);

create table if not exists public.meal_records (
  id text primary key,
  child_id text not null references public.children(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('早餐', '午餐', '晚餐', '加餐')),
  foods jsonb not null default '[]'::jsonb,
  intake_level text not null,
  preference text not null,
  allergy_reaction text,
  water_ml int not null default 0,
  nutrition_score int not null default 0,
  recorded_by uuid references public.user_profiles(id) on delete set null,
  recorded_by_role text not null,
  created_at timestamptz not null default now(),
  unique(child_id, date, meal)
);

create table if not exists public.growth_records (
  id text primary key,
  child_id text not null references public.children(id) on delete cascade,
  created_at_text text not null,
  recorder text not null,
  recorder_role text not null,
  category text not null,
  tags text[] not null default '{}',
  selected_indicators text[] not null default '{}',
  description text not null,
  needs_attention boolean not null,
  follow_up_action text,
  review_date date,
  review_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.guardian_feedbacks (
  id text primary key,
  child_id text not null references public.children(id) on delete cascade,
  date date not null,
  status text not null,
  content text not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_by_role text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_checkins (
  id text primary key,
  child_id text not null references public.children(id) on delete cascade,
  task_id text not null,
  date date not null,
  created_at timestamptz not null default now(),
  unique(child_id, task_id, date)
);

-- Storage metadata for uploaded media (small program / web)
create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  child_id text references public.children(id) on delete cascade,
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  bucket text not null,
  object_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- Audit trail for institution/class/assignment changes.
create table if not exists public.master_data_audit_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references public.institutions(id) on delete cascade,
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Event stream for alerting and notifications.
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references public.institutions(id) on delete cascade,
  child_id text references public.children(id) on delete set null,
  event_type text not null,
  source text not null default 'system',
  created_by uuid references public.user_profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  retry_count int not null default 0,
  max_retries int not null default 3,
  next_retry_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notification_events add column if not exists retry_count int not null default 0;
alter table public.notification_events add column if not exists max_retries int not null default 3;
alter table public.notification_events add column if not exists next_retry_at timestamptz not null default now();
alter table public.notification_events add column if not exists last_error text;

create table if not exists public.notification_dead_letters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  institution_id text not null references public.institutions(id) on delete cascade,
  child_id text references public.children(id) on delete set null,
  event_type text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  retry_count int not null default 0,
  max_retries int not null default 3,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id)
);

create index if not exists idx_notification_events_institution_created_at
on public.notification_events (institution_id, created_at desc);

create index if not exists idx_notification_events_event_type_created_at
on public.notification_events (event_type, created_at desc);

create index if not exists idx_notification_events_retry
on public.notification_events (status, next_retry_at, retry_count, max_retries);

create index if not exists idx_notification_dead_letters_institution_created_at
on public.notification_dead_letters (institution_id, created_at desc);

-- Auto-emit event: morning health abnormal.
create or replace function public.emit_health_abnormal_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_institution_id text;
begin
  if new.is_abnormal is not true then
    return new;
  end if;

  select c.institution_id into v_institution_id
  from public.children c
  where c.id = new.child_id;

  if v_institution_id is null then
    return new;
  end if;

  insert into public.notification_events (
    institution_id,
    child_id,
    event_type,
    source,
    created_by,
    payload
  )
  values (
    v_institution_id,
    new.child_id,
    'health_check_abnormal',
    'health_checks_trigger',
    new.checked_by,
    jsonb_build_object(
      'health_check_id', new.id,
      'date', new.date,
      'temperature', new.temperature,
      'mood', new.mood,
      'hand_mouth_eye', new.hand_mouth_eye,
      'remark', new.remark
    )
  );

  return new;
end;
$$;

drop trigger if exists on_health_check_created_emit_event on public.health_checks;
create trigger on_health_check_created_emit_event
after insert on public.health_checks
for each row execute function public.emit_health_abnormal_event();

-- Auto-emit event: parent/teacher feedback receipt.
create or replace function public.emit_feedback_receipt_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_institution_id text;
begin
  select c.institution_id into v_institution_id
  from public.children c
  where c.id = new.child_id;

  if v_institution_id is null then
    return new;
  end if;

  insert into public.notification_events (
    institution_id,
    child_id,
    event_type,
    source,
    created_by,
    payload
  )
  values (
    v_institution_id,
    new.child_id,
    'feedback_receipt',
    'guardian_feedbacks_trigger',
    new.created_by,
    jsonb_build_object(
      'feedback_id', new.id,
      'date', new.date,
      'status', new.status,
      'created_by_role', new.created_by_role
    )
  );

  return new;
end;
$$;

drop trigger if exists on_guardian_feedback_created_emit_event on public.guardian_feedbacks;
create trigger on_guardian_feedback_created_emit_event
after insert on public.guardian_feedbacks
for each row execute function public.emit_feedback_receipt_event();

-- Helper function: enqueue task check-in pending events for a date.
create or replace function public.enqueue_task_checkin_pending_events(target_date date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int := 0;
begin
  with candidates as (
    select c.id as child_id, c.institution_id
    from public.children c
    where not exists (
      select 1
      from public.task_checkins tc
      where tc.child_id = c.id
        and tc.date = target_date
    )
  ), ins as (
    insert into public.notification_events (
      institution_id,
      child_id,
      event_type,
      source,
      payload
    )
    select
      candidate.institution_id,
      candidate.child_id,
      'task_checkin_pending',
      'task_checkin_scheduler',
      jsonb_build_object('date', target_date)
    from candidates candidate
    returning 1
  )
  select count(*) into inserted_count from ins;

  return inserted_count;
end;
$$;

alter table public.user_profiles enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_classes enable row level security;
alter table public.children enable row level security;
alter table public.parent_children enable row level security;
alter table public.attendance_records enable row level security;
alter table public.health_checks enable row level security;
alter table public.meal_records enable row level security;
alter table public.growth_records enable row level security;
alter table public.guardian_feedbacks enable row level security;
alter table public.task_checkins enable row level security;
alter table public.file_assets enable row level security;
alter table public.master_data_audit_logs enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_dead_letters enable row level security;

-- Replace permissive bootstrap policies with role-scoped policies.
drop policy if exists "read_profiles" on public.user_profiles;
drop policy if exists "institutions_select_authenticated" on public.institutions;
drop policy if exists "institutions_update_admin_scope" on public.institutions;
drop policy if exists "institution_classes_select_authenticated" on public.institution_classes;
drop policy if exists "institution_classes_insert_admin_scope" on public.institution_classes;
drop policy if exists "institution_classes_update_admin_scope" on public.institution_classes;
drop policy if exists "institution_classes_delete_admin_scope" on public.institution_classes;
drop policy if exists "read_children" on public.children;
drop policy if exists "parent_children_select_by_role" on public.parent_children;
drop policy if exists "parent_children_write_staff" on public.parent_children;
drop policy if exists "children_select_parent_linkage" on public.children;
drop policy if exists "attendance_select_parent_linkage" on public.attendance_records;
drop policy if exists "meals_write_parent_linkage" on public.meal_records;
drop policy if exists "meals_select_parent_linkage" on public.meal_records;
drop policy if exists "growth_write_parent_linkage" on public.growth_records;
drop policy if exists "growth_select_parent_linkage" on public.growth_records;
drop policy if exists "feedback_write_parent_linkage" on public.guardian_feedbacks;
drop policy if exists "feedback_select_parent_linkage" on public.guardian_feedbacks;
drop policy if exists "task_checkins_write_parent_linkage" on public.task_checkins;
drop policy if exists "task_checkins_select_parent_linkage" on public.task_checkins;
drop policy if exists "health_select_parent_linkage" on public.health_checks;
drop policy if exists "file_assets_select_parent_linkage" on public.file_assets;
drop policy if exists "file_assets_write_parent_linkage" on public.file_assets;
drop policy if exists "read_attendance" on public.attendance_records;
drop policy if exists "read_health" on public.health_checks;
drop policy if exists "read_meals" on public.meal_records;
drop policy if exists "read_growth" on public.growth_records;
drop policy if exists "read_feedback" on public.guardian_feedbacks;
drop policy if exists "read_tasks" on public.task_checkins;
drop policy if exists "read_files" on public.file_assets;
drop policy if exists "master_data_audit_select_admin_scope" on public.master_data_audit_logs;
drop policy if exists "master_data_audit_insert_admin_scope" on public.master_data_audit_logs;
drop policy if exists "notification_events_select_by_role" on public.notification_events;
drop policy if exists "notification_events_insert_by_role" on public.notification_events;
drop policy if exists "notification_events_update_admin_scope" on public.notification_events;
drop policy if exists "notification_dead_letters_select_admin_scope" on public.notification_dead_letters;
drop policy if exists "notification_dead_letters_update_admin_scope" on public.notification_dead_letters;
drop policy if exists "parent_media_select_authorized" on storage.objects;
drop policy if exists "parent_media_update_authorized" on storage.objects;
drop policy if exists "parent_media_delete_authorized" on storage.objects;
drop policy if exists "institution_reports_select_admin" on storage.objects;
drop policy if exists "institution_reports_insert_admin" on storage.objects;
drop policy if exists "institution_reports_update_admin" on storage.objects;
drop policy if exists "institution_reports_delete_admin" on storage.objects;

-- user_profiles: each user can read and edit only their own profile.
create policy if not exists "profiles_select_own"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

create policy if not exists "profiles_insert_own"
on public.user_profiles
for insert
to authenticated
with check (id = auth.uid());

create policy if not exists "profiles_update_own"
on public.user_profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- institutions/institution_classes: readable by authenticated users for signup and profile forms.
create policy if not exists "institutions_select_authenticated"
on public.institutions
for select
to authenticated
using (true);

create policy if not exists "institutions_update_admin_scope"
on public.institutions
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = institutions.id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = institutions.id
  )
);

create policy if not exists "institution_classes_select_authenticated"
on public.institution_classes
for select
to authenticated
using (true);

create policy if not exists "institution_classes_insert_admin_scope"
on public.institution_classes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = institution_classes.institution_id
  )
);

create policy if not exists "institution_classes_update_admin_scope"
on public.institution_classes
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = institution_classes.institution_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = institution_classes.institution_id
  )
);

create policy if not exists "institution_classes_delete_admin_scope"
on public.institution_classes
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = institution_classes.institution_id
  )
);

-- children visibility by role:
-- parent: own bound children; teacher: same institution + class; admin: same institution.
create policy if not exists "children_select_by_role"
on public.children
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        (up.role = '家长' and children.parent_user_id = auth.uid())
        or (up.role = '教师' and children.institution_id = up.institution_id and children.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and children.institution_id = up.institution_id)
      )
  )
);

-- children write: teacher/admin only (parent cannot create/update/delete child档案).
create policy if not exists "children_insert_staff"
on public.children
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        (up.role = '教师' and children.institution_id = up.institution_id and children.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and children.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "children_update_staff"
on public.children
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        (up.role = '教师' and children.institution_id = up.institution_id and children.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and children.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        (up.role = '教师' and children.institution_id = up.institution_id and children.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and children.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "children_delete_staff"
on public.children
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        (up.role = '教师' and children.institution_id = up.institution_id and children.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and children.institution_id = up.institution_id)
      )
  )
);

-- Parent linkage supplement: allow parent to read child via parent_children mapping.
create policy if not exists "children_select_parent_linkage"
on public.children
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = children.id
  )
);

-- parent_children table visibility and maintenance.
create policy if not exists "parent_children_select_by_role"
on public.parent_children
for select
to authenticated
using (
  parent_user_id = auth.uid()
  or exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = parent_children.child_id
      and (
        (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "parent_children_write_staff"
on public.parent_children
for all
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = parent_children.child_id
      and (
        (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = parent_children.child_id
      and (
        (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

-- attendance_records: teacher/admin manage attendance in authorized scope.
create policy if not exists "attendance_select_by_role"
on public.attendance_records
for select
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = attendance_records.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "attendance_write_staff"
on public.attendance_records
for all
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = attendance_records.child_id
      and (
        (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = attendance_records.child_id
      and (
        (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "attendance_select_parent_linkage"
on public.attendance_records
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = attendance_records.child_id
  )
);

-- health_checks: teacher/admin manage health checks in authorized scope.
create policy if not exists "health_select_by_role"
on public.health_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = health_checks.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "health_write_staff"
on public.health_checks
for all
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = health_checks.child_id
      and (
        (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = health_checks.child_id
      and (
        (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "health_select_parent_linkage"
on public.health_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = health_checks.child_id
  )
);

-- meal_records: parent can record own child; teacher/admin can manage authorized scope.
create policy if not exists "meals_select_by_role"
on public.meal_records
for select
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = meal_records.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "meals_write_by_role"
on public.meal_records
for all
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = meal_records.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = meal_records.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "meals_select_parent_linkage"
on public.meal_records
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = meal_records.child_id
  )
);

create policy if not exists "meals_write_parent_linkage"
on public.meal_records
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = meal_records.child_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = meal_records.child_id
  )
);

-- growth_records: parent can add own child observations; teacher/admin within authorized scope.
create policy if not exists "growth_select_by_role"
on public.growth_records
for select
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = growth_records.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "growth_write_by_role"
on public.growth_records
for all
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = growth_records.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = growth_records.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "growth_select_parent_linkage"
on public.growth_records
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = growth_records.child_id
  )
);

create policy if not exists "growth_write_parent_linkage"
on public.growth_records
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = growth_records.child_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = growth_records.child_id
  )
);

-- guardian_feedbacks: parent/teacher/admin all allowed within authorized scope.
create policy if not exists "feedback_select_by_role"
on public.guardian_feedbacks
for select
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = guardian_feedbacks.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "feedback_write_by_role"
on public.guardian_feedbacks
for all
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = guardian_feedbacks.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = guardian_feedbacks.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "feedback_select_parent_linkage"
on public.guardian_feedbacks
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = guardian_feedbacks.child_id
  )
);

create policy if not exists "feedback_write_parent_linkage"
on public.guardian_feedbacks
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = guardian_feedbacks.child_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = guardian_feedbacks.child_id
  )
);

-- task_checkins: parent/teacher/admin all allowed within authorized scope.
create policy if not exists "task_checkins_select_by_role"
on public.task_checkins
for select
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = task_checkins.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "task_checkins_write_by_role"
on public.task_checkins
for all
to authenticated
using (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = task_checkins.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = task_checkins.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "task_checkins_select_parent_linkage"
on public.task_checkins
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = task_checkins.child_id
  )
);

create policy if not exists "task_checkins_write_parent_linkage"
on public.task_checkins
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = task_checkins.child_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = task_checkins.child_id
  )
);

-- file_assets: scope by child; if child_id is null then only uploader can access.
create policy if not exists "file_assets_select_by_scope"
on public.file_assets
for select
to authenticated
using (
  (
    child_id is null
    and uploaded_by = auth.uid()
  )
  or exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = file_assets.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "file_assets_write_by_scope"
on public.file_assets
for all
to authenticated
using (
  (
    child_id is null
    and uploaded_by = auth.uid()
  )
  or exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = file_assets.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
)
with check (
  (
    child_id is null
    and uploaded_by = auth.uid()
  )
  or exists (
    select 1
    from public.children c
    join public.user_profiles up on up.id = auth.uid()
    where c.id = file_assets.child_id
      and (
        (up.role = '家长' and c.parent_user_id = auth.uid())
        or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
        or (up.role = '机构管理员' and c.institution_id = up.institution_id)
      )
  )
);

create policy if not exists "file_assets_select_parent_linkage"
on public.file_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = file_assets.child_id
  )
);

create policy if not exists "file_assets_write_parent_linkage"
on public.file_assets
for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = file_assets.child_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    join public.parent_children pc on pc.parent_user_id = up.id
    where up.id = auth.uid()
      and up.role = '家长'
      and pc.child_id = file_assets.child_id
  )
);

-- master_data_audit_logs: only institution admins can read/insert records for their institution.
create policy if not exists "master_data_audit_select_admin_scope"
on public.master_data_audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = master_data_audit_logs.institution_id
  )
);

create policy if not exists "master_data_audit_insert_admin_scope"
on public.master_data_audit_logs
for insert
to authenticated
with check (
  actor_id = auth.uid()
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = master_data_audit_logs.institution_id
  )
);

-- notification_events: parent/teacher/admin can read related events; only staff/admin can create; only admin can mark status.
create policy if not exists "notification_events_select_by_role"
on public.notification_events
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        (up.role = '机构管理员' and up.institution_id = notification_events.institution_id)
        or (
          up.role = '教师'
          and exists (
            select 1
            from public.children c
            where c.id = notification_events.child_id
              and c.institution_id = up.institution_id
              and c.class_name = coalesce(up.class_name, '')
          )
        )
        or (
          up.role = '家长'
          and exists (
            select 1
            from public.children c
            where c.id = notification_events.child_id
              and (
                c.parent_user_id = auth.uid()
                or exists (
                  select 1
                  from public.parent_children pc
                  where pc.parent_user_id = auth.uid()
                    and pc.child_id = c.id
                )
              )
          )
        )
      )
  )
);

create policy if not exists "notification_events_insert_by_role"
on public.notification_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and (
        (up.role = '机构管理员' and up.institution_id = notification_events.institution_id)
        or (
          up.role = '教师'
          and exists (
            select 1
            from public.children c
            where c.id = notification_events.child_id
              and c.institution_id = up.institution_id
              and c.class_name = coalesce(up.class_name, '')
          )
        )
      )
  )
);

create policy if not exists "notification_events_update_admin_scope"
on public.notification_events
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = notification_events.institution_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = notification_events.institution_id
  )
);

create policy if not exists "notification_dead_letters_select_admin_scope"
on public.notification_dead_letters
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = notification_dead_letters.institution_id
  )
);

create policy if not exists "notification_dead_letters_update_admin_scope"
on public.notification_dead_letters
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = notification_dead_letters.institution_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and up.institution_id = notification_dead_letters.institution_id
  )
);

-- Storage object policies for configured private buckets.
insert into storage.buckets (id, name, public)
values
  ('parent-media', 'parent-media', false),
  ('institution-reports', 'institution-reports', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

alter table if exists storage.objects enable row level security;

create policy if not exists "parent_media_select_authorized"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'parent-media'
  and exists (
    select 1
    from public.file_assets fa
    where fa.bucket = storage.objects.bucket_id
      and fa.object_path = storage.objects.name
      and (
        fa.uploaded_by = auth.uid()
        or exists (
          select 1
          from public.children c
          join public.user_profiles up on up.id = auth.uid()
          where c.id = fa.child_id
            and (
              (up.role = '家长' and (
                c.parent_user_id = auth.uid()
                or exists (
                  select 1
                  from public.parent_children pc
                  where pc.parent_user_id = auth.uid()
                    and pc.child_id = c.id
                )
              ))
              or (up.role = '教师' and c.institution_id = up.institution_id and c.class_name = coalesce(up.class_name, ''))
              or (up.role = '机构管理员' and c.institution_id = up.institution_id)
            )
        )
      )
  )
);

create policy if not exists "parent_media_update_authorized"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'parent-media'
  and exists (
    select 1
    from public.file_assets fa
    where fa.bucket = storage.objects.bucket_id
      and fa.object_path = storage.objects.name
      and fa.uploaded_by = auth.uid()
  )
)
with check (
  bucket_id = 'parent-media'
  and exists (
    select 1
    from public.file_assets fa
    where fa.bucket = storage.objects.bucket_id
      and fa.object_path = storage.objects.name
      and fa.uploaded_by = auth.uid()
  )
);

create policy if not exists "parent_media_delete_authorized"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'parent-media'
  and exists (
    select 1
    from public.file_assets fa
    where fa.bucket = storage.objects.bucket_id
      and fa.object_path = storage.objects.name
      and fa.uploaded_by = auth.uid()
  )
);

create policy if not exists "institution_reports_select_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'institution-reports'
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and storage.objects.name like up.institution_id || '/%'
  )
);

create policy if not exists "institution_reports_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'institution-reports'
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and storage.objects.name like up.institution_id || '/%'
  )
);

create policy if not exists "institution_reports_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'institution-reports'
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and storage.objects.name like up.institution_id || '/%'
  )
)
with check (
  bucket_id = 'institution-reports'
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and storage.objects.name like up.institution_id || '/%'
  )
);

create policy if not exists "institution_reports_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'institution-reports'
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = '机构管理员'
      and storage.objects.name like up.institution_id || '/%'
  )
);
