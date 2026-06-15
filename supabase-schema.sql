create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Guest',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 64)
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'FlowBoard Team',
  owner_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_length check (char_length(name) between 1 and 120)
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'viewer', 'guest')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members alter column role set default 'editor';
update public.workspace_members
set role = 'editor'
where role = 'member';
alter table public.workspace_members
add constraint workspace_members_role_check
check (role in ('owner', 'admin', 'editor', 'viewer', 'guest'));

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  constraint workspace_invites_token_length check (char_length(token) between 24 and 160)
);

create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);
create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);
create index if not exists workspace_members_workspace_id_idx on public.workspace_members(workspace_id);
create index if not exists workspace_invites_workspace_id_idx on public.workspace_invites(workspace_id);
create index if not exists workspace_invites_token_idx on public.workspace_invites(token);

create schema if not exists private;

create or replace function private.is_workspace_member(target_workspace_id uuid, target_user_id uuid)
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

create or replace function private.is_workspace_owner(target_workspace_id uuid, target_user_id uuid)
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

create or replace function private.workspace_role(target_workspace_id uuid, target_user_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = target_user_id
  limit 1;
$$;

create or replace function private.can_edit_workspace(target_workspace_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(private.workspace_role(target_workspace_id, target_user_id), '') in ('owner', 'admin', 'editor');
$$;

create or replace function private.can_manage_workspace(target_workspace_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(private.workspace_role(target_workspace_id, target_user_id), '') in ('owner', 'admin');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.accept_workspace_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_workspace_id uuid;
begin
  select workspace_id
    into invited_workspace_id
  from public.workspace_invites
  where token = invite_token
    and expires_at > now()
  limit 1;

  if invited_workspace_id is null then
    return null;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (invited_workspace_id, auth.uid(), 'editor')
  on conflict (workspace_id, user_id) do nothing;

  return invited_workspace_id;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_workspaces_updated_at on public.workspaces;
create trigger touch_workspaces_updated_at
before update on public.workspaces
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists "profiles are visible to authenticated users" on public.profiles;
create policy "profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users can create their own profile" on public.profiles;
create policy "users can create their own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "members can read their workspaces" on public.workspaces;
create policy "members can read their workspaces"
on public.workspaces for select
to authenticated
using (
  owner_id = auth.uid()
  or private.is_workspace_member(id, auth.uid())
);

drop policy if exists "users can create owned workspaces" on public.workspaces;
create policy "users can create owned workspaces"
on public.workspaces for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "members can update their workspaces" on public.workspaces;
create policy "members can update their workspaces"
on public.workspaces for update
to authenticated
using (
  owner_id = auth.uid()
  or private.can_edit_workspace(id, auth.uid())
)
with check (
  owner_id = auth.uid()
  or private.can_edit_workspace(id, auth.uid())
);

drop policy if exists "owners can delete their workspaces" on public.workspaces;
create policy "owners can delete their workspaces"
on public.workspaces for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "members can read workspace memberships" on public.workspace_members;
create policy "members can read workspace memberships"
on public.workspace_members for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_workspace_member(workspace_id, auth.uid())
);

drop policy if exists "owners can add workspace memberships" on public.workspace_members;
create policy "owners can add workspace memberships"
on public.workspace_members for insert
to authenticated
with check (
  private.can_manage_workspace(workspace_id, auth.uid())
  or (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1
      from public.workspaces
      where id = workspace_id
        and owner_id = auth.uid()
    )
  )
);

drop policy if exists "owners can update memberships" on public.workspace_members;
create policy "owners can update memberships"
on public.workspace_members for update
to authenticated
using (private.can_manage_workspace(workspace_id, auth.uid()))
with check (private.can_manage_workspace(workspace_id, auth.uid()));

drop policy if exists "owners can remove memberships" on public.workspace_members;
create policy "owners can remove memberships"
on public.workspace_members for delete
to authenticated
using (
  user_id = auth.uid()
  or private.can_manage_workspace(workspace_id, auth.uid())
);

drop policy if exists "members can read workspace invites" on public.workspace_invites;
create policy "members can read workspace invites"
on public.workspace_invites for select
to authenticated
using (
  expires_at > now()
  and private.can_manage_workspace(workspace_id, auth.uid())
);

drop policy if exists "members can create workspace invites" on public.workspace_invites;
create policy "members can create workspace invites"
on public.workspace_invites for insert
to authenticated
with check (
  created_by = auth.uid()
  and private.is_workspace_member(workspace_id, auth.uid())
);

drop policy if exists "invite creators and owners can delete invites" on public.workspace_invites;
create policy "invite creators and owners can delete invites"
on public.workspace_invites for delete
to authenticated
using (
  created_by = auth.uid()
  or private.can_manage_workspace(workspace_id, auth.uid())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'flowboard-images',
  'flowboard-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members can read workspace images" on storage.objects;
create policy "members can read workspace images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'flowboard-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_workspace((storage.foldername(name))[1]::uuid, auth.uid())
);

drop policy if exists "members can upload workspace images" on storage.objects;
create policy "members can upload workspace images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'flowboard-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_workspace((storage.foldername(name))[1]::uuid, auth.uid())
);

drop policy if exists "members can replace workspace images" on storage.objects;
create policy "members can replace workspace images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'flowboard-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_workspace((storage.foldername(name))[1]::uuid, auth.uid())
)
with check (
  bucket_id = 'flowboard-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_workspace((storage.foldername(name))[1]::uuid, auth.uid())
);

drop policy if exists "members can delete workspace images" on storage.objects;
create policy "members can delete workspace images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'flowboard-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.can_edit_workspace((storage.foldername(name))[1]::uuid, auth.uid())
);

grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, delete on public.workspace_invites to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on all functions in schema private to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.workspaces;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.workspace_members;
exception
  when duplicate_object then null;
end $$;
