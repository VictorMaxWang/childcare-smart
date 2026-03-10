-- App-level snapshot storage for MVP persistence.
create table if not exists public.app_state_snapshots (
  institution_id text primary key,
  snapshot jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_app_state_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_app_state_snapshots on public.app_state_snapshots;
create trigger trg_touch_app_state_snapshots
before update on public.app_state_snapshots
for each row
execute function public.touch_app_state_snapshots_updated_at();

alter table public.app_state_snapshots enable row level security;

-- MVP policy: service role writes through backend API.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_state_snapshots'
      and policyname = 'service_role_all_app_state_snapshots'
  ) then
    create policy service_role_all_app_state_snapshots
      on public.app_state_snapshots
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;
