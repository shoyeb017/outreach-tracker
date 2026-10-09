-- Apply after 20261008_admin_microsoft.sql and storage.sql. No accounts are deleted here.
begin;

create table if not exists public.admin_account_deletions (
  user_id uuid primary key, -- intentionally retained after auth.users is deleted
  confirmation_email text,
  status text not null check (status in ('deleting', 'failed', 'deleted')),
  lease_id uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_account_deletions enable row level security;
revoke all on public.admin_account_deletions from public, anon, authenticated;
grant all on public.admin_account_deletions to service_role;

-- Existing JWTs can outlive account deletion. Freeze database and storage access
-- before cleanup, including retries following a timeout or Storage failure.
create or replace function public.workspace_access_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not exists (
    select 1 from public.admin_account_deletions where user_id = auth.uid()
  );
$$;
revoke all on function public.workspace_access_allowed() from public, anon;
grant execute on function public.workspace_access_allowed() to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','signature_fields','microsoft_integrations','templates',
    'datasets','dataset_columns','dataset_placeholder_mappings','dataset_rows',
    'column_mapping_profiles','template_versions','routing_rules','send_runs',
    'send_run_items','email_history','suppression_list','user_preferences',
    'microsoft_user_configurations'] loop
    execute format('drop policy if exists admin_deletion_freeze on public.%I', t);
    execute format('create policy admin_deletion_freeze on public.%I as restrictive for all to authenticated using ((select public.workspace_access_allowed())) with check ((select public.workspace_access_allowed()))', t);
  end loop;
end $$;
drop policy if exists admin_deletion_freeze on storage.objects;
create policy admin_deletion_freeze on storage.objects as restrictive for all to authenticated
  using ((select public.workspace_access_allowed())) with check ((select public.workspace_access_allowed()));

-- Service-role configuration writes must also respect the freeze. Only these
-- tables receive a trigger: FK SET NULL updates during cascading deletion of
-- other tables must remain possible. RLS protects browser writes to all tables.
create or replace function public.guard_deleting_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  owner_id := case when tg_table_name = 'profiles' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'user_id')::uuid end;
  if exists (select 1 from public.admin_account_deletions where user_id = owner_id) then
    -- Default-configuration saves clear every default sender; allow this safe
    -- reset even during cleanup so one frozen account cannot block others.
    if tg_table_name = 'microsoft_integrations' and to_jsonb(new)->>'connection_status' = 'not_connected'
       and to_jsonb(new)->>'connected_email' is null and to_jsonb(new)->>'home_account_id' is null then
      return new;
    end if;
    raise exception 'This account is being deleted and cannot change workspace data.';
  end if;
  return new;
end $$;
revoke all on function public.guard_deleting_workspace() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['profiles','microsoft_integrations','microsoft_user_configurations'] loop
    execute format('drop trigger if exists guard_deleting_workspace on public.%I', t);
    execute format('create trigger guard_deleting_workspace before insert or update on public.%I for each row execute function public.guard_deleting_workspace()', t);
  end loop;
end $$;

-- Parameterized Auth directory includes accounts without an application profile.
create or replace function public.admin_user_directory(p_search text default '', p_filter text default 'all', p_page integer default 1)
returns jsonb language sql stable security definer set search_path = '' as $$
  with account_source as (
    select id,email,created_at,last_sign_in_at,email_confirmed_at from auth.users
    union all
    select d.user_id,d.confirmation_email,d.updated_at,null::timestamptz,null::timestamptz
      from public.admin_account_deletions d where d.status <> 'deleted'
      and not exists(select 1 from auth.users u where u.id = d.user_id)
  ), matching as (
    select u.id, u.email, coalesce(p.full_name, '') as full_name, u.created_at,
      u.last_sign_in_at, (u.email_confirmed_at is not null) as confirmed,
      i.connected_email, i.connection_status, d.status as deletion_status,
      exists(select 1 from public.application_administrators a where a.user_id = u.id and a.enabled) as administrator
    from account_source u left join public.profiles p on p.id = u.id
    left join public.microsoft_integrations i on i.user_id = u.id
    left join public.admin_account_deletions d on d.user_id = u.id
    where (coalesce(p_search, '') = '' or strpos(lower(coalesce(u.email,'') || ' ' || coalesce(p.full_name,'')), lower(left(p_search, 120))) > 0)
      and (p_filter = 'all' or (p_filter = 'connected' and i.connection_status = 'connected' and d.user_id is null)
        or (p_filter = 'not_connected' and coalesce(i.connection_status,'not_connected') <> 'connected' and d.user_id is null)
        or (p_filter = 'cleanup' and d.status in ('deleting','failed')))
  ), paged as (
    select * from matching order by created_at desc, id limit 50 offset ((greatest(1, least(coalesce(p_page,1),100000))-1)*50)
  ) select jsonb_build_object('total', (select count(*) from matching), 'users', coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc,id) from paged), '[]'::jsonb));
$$;
revoke all on function public.admin_user_directory(text,text,integer) from public, anon, authenticated;
grant execute on function public.admin_user_directory(text,text,integer) to service_role;

create or replace function public.begin_admin_account_deletion(
  p_target uuid, p_confirmation text, p_actor uuid, p_email text, p_lease uuid
) returns text language plpgsql security definer set search_path = '' as $$
declare target_email text; existing public.admin_account_deletions%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target::text, 0));
  select email into target_email from auth.users where id = p_target;
  select * into existing from public.admin_account_deletions where user_id = p_target for update;
  if p_target = p_actor or exists (select 1 from public.application_administrators where user_id = p_target and enabled)
     or lower(target_email) = lower(p_email) then
    raise exception 'Administrator accounts cannot be deleted here.';
  end if;
  if existing.status = 'deleted' then raise exception 'This account has already been deleted.'; end if;
  target_email := coalesce(target_email, existing.confirmation_email);
  if target_email is null or lower(trim(p_confirmation)) <> lower(target_email) then
    raise exception 'Enter the account email exactly to confirm deletion.';
  end if;
  if existing.lease_until > now() then raise exception 'Cleanup is already running. Wait two minutes before retrying.'; end if;
  insert into public.admin_account_deletions(user_id, confirmation_email, status, lease_id, lease_until)
    values(p_target, target_email, 'deleting', p_lease, now() + interval '2 minutes')
    on conflict(user_id) do update set status = 'deleting', lease_id = p_lease, lease_until = now() + interval '2 minutes', updated_at = now();
  insert into public.admin_audit_log(actor_id,actor_email,action,details)
    values(p_actor,p_email,'account_deletion_started',jsonb_build_object('user_id',p_target));
  return 'deleting';
end $$;

create or replace function public.finish_admin_account_deletion(
  p_target uuid, p_lease uuid, p_complete boolean, p_actor uuid, p_email text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_complete and exists(select 1 from auth.users where id = p_target) then
    raise exception 'The authentication account still exists.';
  end if;
  update public.admin_account_deletions set status = case when p_complete then 'deleted' else 'failed' end,
    confirmation_email = case when p_complete then null else confirmation_email end,
    lease_id = null, lease_until = null, updated_at = now() where user_id = p_target and lease_id = p_lease;
  if not found then raise exception 'Cleanup ownership changed. Refresh the account before retrying.'; end if;
  insert into public.admin_audit_log(actor_id,actor_email,action,details)
    values(p_actor,p_email,case when p_complete then 'account_deleted' else 'account_deletion_failed' end,jsonb_build_object('user_id',p_target));
  return true;
end $$;

create or replace function public.admin_disconnect_sender(p_target uuid, p_actor uuid, p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = p_target) then raise exception 'Account not found.'; end if;
  if p_target = p_actor or exists (select 1 from public.application_administrators where user_id = p_target and enabled)
     or exists(select 1 from auth.users where id = p_target and lower(email) = lower(p_email)) then
    raise exception 'Administrator accounts cannot be changed here.';
  end if;
  if exists(select 1 from public.admin_account_deletions where user_id = p_target) then raise exception 'Finish account cleanup first.'; end if;
  update public.microsoft_integrations set connection_status = 'not_connected',
    connected_email = null, home_account_id = null, display_name = null,
    expected_email = null, resolved_authority = null, permission_scopes = '{}', last_error = null
    where user_id = p_target;
  insert into public.admin_audit_log(actor_id,actor_email,action,details)
    values(p_actor,p_email,'sender_disconnected',jsonb_build_object('user_id',p_target));
  return true;
end $$;

revoke all on function public.begin_admin_account_deletion(uuid,text,uuid,text,uuid),
  public.finish_admin_account_deletion(uuid,uuid,boolean,uuid,text),
  public.admin_disconnect_sender(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.begin_admin_account_deletion(uuid,text,uuid,text,uuid),
  public.finish_admin_account_deletion(uuid,uuid,boolean,uuid,text),
  public.admin_disconnect_sender(uuid,uuid,text) to service_role;
commit;
