create extension if not exists "pgcrypto";

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'FlowBoard Team',
  owner_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = target_user_id
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = target_user_id
      and role = 'owner'
  );
$$;

drop policy if exists "members can read their workspaces" on public.workspaces;
create policy "members can read their workspaces"
on public.workspaces for select
using (
  owner_id = auth.uid()
  or public.is_workspace_member(id, auth.uid())
);

drop policy if exists "members can update their workspaces" on public.workspaces;
create policy "members can update their workspaces"
on public.workspaces for update
using (
  owner_id = auth.uid()
  or public.is_workspace_member(id, auth.uid())
)
with check (
  owner_id = auth.uid()
  or public.is_workspace_member(id, auth.uid())
);

drop policy if exists "users can create owned workspaces" on public.workspaces;
create policy "users can create owned workspaces"
on public.workspaces for insert
with check (owner_id = auth.uid());

drop policy if exists "members can read memberships" on public.workspace_members;
create policy "members can read memberships"
on public.workspace_members for select
using (
  user_id = auth.uid()
  or public.is_workspace_member(workspace_id, auth.uid())
);

drop policy if exists "owners can invite members" on public.workspace_members;
create policy "owners can invite members"
on public.workspace_members for insert
with check (
  user_id = auth.uid()
  or public.is_workspace_owner(workspace_id, auth.uid())
);

create or replace function public.touch_workspace_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_workspace_updated_at on public.workspaces;
create trigger touch_workspace_updated_at
before update on public.workspaces
for each row execute function public.touch_workspace_updated_at();

alter publication supabase_realtime add table public.workspaces;
