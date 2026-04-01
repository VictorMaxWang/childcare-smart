create table if not exists public.app_users (
  id text primary key,
  username_normalized text not null,
  display_name text not null,
  password_hash text not null,
  role text not null,
  avatar text,
  institution_id text not null,
  class_name text,
  child_ids jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_app_users_username_normalized
  on public.app_users (username_normalized);

create index if not exists idx_app_users_institution_id
  on public.app_users (institution_id);

create or replace function public.touch_app_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_app_users_updated_at on public.app_users;
create trigger trg_touch_app_users_updated_at
before update on public.app_users
for each row
execute function public.touch_app_users_updated_at();

alter table public.app_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_users'
      and policyname = 'service_role_all_app_users'
  ) then
    create policy service_role_all_app_users
      on public.app_users
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;
