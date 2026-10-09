-- Additive upgrade. Apply after the existing guided-workflow migration.
begin;
create table if not exists public.application_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.application_administrators enable row level security;
create policy admin_read_own_role on public.application_administrators for select to authenticated using (user_id = auth.uid());
revoke all on public.application_administrators from public, anon, authenticated;
grant select on public.application_administrators to authenticated;

create table if not exists public.microsoft_default_configuration (
  id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
  name text not null default 'Application default', client_id uuid not null, tenant_id uuid not null,
  enabled boolean not null default false, allow_custom boolean not null default true,
  fallback_audience text check(fallback_audience in ('AzureADMyOrg','AzureADMultipleOrgs','AzureADandPersonalMicrosoftAccount','PersonalMicrosoftAccount')),
  detected_audience text check(detected_audience in ('AzureADMyOrg','AzureADMultipleOrgs','AzureADandPersonalMicrosoftAccount','PersonalMicrosoftAccount')),
  verified_at timestamptz, validated_at timestamptz, validation_error text, updated_at timestamptz not null default now()
);
create table if not exists public.microsoft_user_configurations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My configuration', client_id uuid not null, tenant_id uuid not null,
  fallback_audience text check(fallback_audience in ('AzureADMyOrg','AzureADMultipleOrgs','AzureADandPersonalMicrosoftAccount','PersonalMicrosoftAccount')),
  detected_audience text check(detected_audience in ('AzureADMyOrg','AzureADMultipleOrgs','AzureADandPersonalMicrosoftAccount','PersonalMicrosoftAccount')),
  verified_at timestamptz, validated_at timestamptz, validation_error text, updated_at timestamptz not null default now(),
  unique(user_id,client_id,tenant_id), unique(user_id,id)
);
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null, action text not null, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.security_rate_limits (
  key text primary key, window_started timestamptz not null default now(), attempts integer not null default 0
);
alter table public.microsoft_default_configuration enable row level security;
alter table public.microsoft_user_configurations enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.security_rate_limits enable row level security;
create policy microsoft_config_read_own on public.microsoft_user_configurations for select to authenticated using(user_id = auth.uid());
revoke all on public.microsoft_default_configuration, public.admin_audit_log, public.security_rate_limits, public.microsoft_user_configurations from public, anon, authenticated;
grant select on public.microsoft_user_configurations to authenticated;
grant all on public.application_administrators, public.microsoft_default_configuration, public.microsoft_user_configurations, public.admin_audit_log, public.security_rate_limits to service_role;

alter table public.microsoft_integrations add column if not exists configuration_id uuid;
alter table public.microsoft_integrations add column if not exists connection_method text not null default 'custom' check(connection_method in ('default','custom'));
alter table public.microsoft_integrations add column if not exists home_account_id text;
alter table public.microsoft_integrations add column if not exists display_name text;
alter table public.microsoft_integrations add column if not exists last_verified_at timestamptz;
alter table public.microsoft_integrations add column if not exists account_type text not null default 'unknown' check(account_type in ('personal','organization','unknown'));
alter table public.microsoft_integrations add column if not exists resolved_authority text;
alter table public.microsoft_integrations add column if not exists permission_scopes text[] not null default '{}';
alter table public.microsoft_integrations add column if not exists configuration_version timestamptz;
-- Preserve legacy metadata, but require explicit reconnect before using a cached sender.
insert into public.microsoft_user_configurations(user_id,name,client_id,tenant_id)
select user_id,'Existing Microsoft configuration',client_id::uuid,tenant_id::uuid from public.microsoft_integrations
where client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
and tenant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict(user_id,client_id,tenant_id) do nothing;
update public.microsoft_integrations i set configuration_id=c.id from public.microsoft_user_configurations c
where i.user_id=c.user_id and lower(i.client_id)=c.client_id::text and lower(i.tenant_id)=c.tenant_id::text and i.configuration_id is null;

create or replace function public.consume_security_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare counter integer;
begin
  if length(p_key)>200 or p_limit<1 or p_seconds<1 then raise exception 'Invalid security limit'; end if;
  insert into security_rate_limits(key,attempts) values(p_key,1)
  on conflict(key) do update set
    attempts=case when security_rate_limits.window_started < now()-make_interval(secs=>p_seconds) then 1 else security_rate_limits.attempts+1 end,
    window_started=case when security_rate_limits.window_started < now()-make_interval(secs=>p_seconds) then now() else security_rate_limits.window_started end
  returning attempts into counter;
  return counter<=p_limit;
end;
$$;
revoke all on function public.consume_security_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_security_limit(text,integer,integer) to service_role;

create or replace function public.save_microsoft_default(p_settings jsonb, p_actor uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare saved_id uuid;
begin
  insert into microsoft_default_configuration(name,client_id,tenant_id,enabled,allow_custom,fallback_audience)
  values(p_settings->>'name',(p_settings->>'client_id')::uuid,(p_settings->>'tenant_id')::uuid,(p_settings->>'enabled')::boolean,(p_settings->>'allow_custom')::boolean,p_settings->>'fallback_audience')
  on conflict(singleton) do update set name=excluded.name,client_id=excluded.client_id,tenant_id=excluded.tenant_id,enabled=excluded.enabled,allow_custom=excluded.allow_custom,fallback_audience=excluded.fallback_audience,detected_audience=null,verified_at=null,validated_at=null,validation_error=null,updated_at=now()
  returning id into saved_id;
  insert into admin_audit_log(actor_id,actor_email,action,details) values(p_actor,p_email,'microsoft_default_saved',p_settings);
  update microsoft_integrations set connection_status='not_connected',home_account_id=null,connected_email=null,resolved_authority=null where connection_method='default';
  return saved_id;
end;
$$;
revoke all on function public.save_microsoft_default(jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.save_microsoft_default(jsonb,uuid,text) to service_role;

-- Prevent clients from forging sender verification metadata. Retain owner DELETE for privacy reset.
create or replace function public.guard_microsoft_connection_metadata()
returns trigger language plpgsql set search_path = public as $$
declare config_client uuid; config_tenant uuid; config_version timestamptz; config_allowed boolean;
begin
  if auth.role() is distinct from 'service_role' and current_user not in ('postgres','supabase_admin') then
    raise exception 'Use the authenticated Microsoft settings endpoint';
  end if;
  if new.connection_status = 'connected' then
    if tg_op='UPDATE' then
      if old.configuration_id is distinct from new.configuration_id then raise exception 'Active configuration changed during login; reconnect explicitly'; end if;
    end if;
    if new.home_account_id is null or new.resolved_authority is null then raise exception 'Explicit account verification required'; end if;
    if nullif(new.expected_email,'') is not null and lower(new.connected_email) is distinct from lower(new.expected_email) then
      raise exception 'Mailbox does not match the sender safety check';
    end if;
    if new.connection_method='default' then
      select client_id,tenant_id,updated_at,enabled into config_client,config_tenant,config_version,config_allowed
      from microsoft_default_configuration where id=new.configuration_id for share;
    else
      select client_id,tenant_id,updated_at,true into config_client,config_tenant,config_version,config_allowed
      from microsoft_user_configurations where id=new.configuration_id and user_id=new.user_id for share;
      if exists(select 1 from microsoft_default_configuration where not allow_custom) then config_allowed=false; end if;
    end if;
    if config_client is null or not config_allowed or config_client::text<>lower(new.client_id) or config_tenant::text<>lower(new.tenant_id)
      or config_version is distinct from new.configuration_version then raise exception 'Configuration changed; reconnect explicitly'; end if;
  end if;
  return new;
end;
$$;
create trigger guard_microsoft_connection_metadata before insert or update on public.microsoft_integrations
for each row execute function public.guard_microsoft_connection_metadata();
revoke insert, update, truncate, references, trigger on public.microsoft_integrations from anon, authenticated;
grant select, delete on public.microsoft_integrations to authenticated;
grant all on public.microsoft_integrations to service_role;

-- Preserve the existing privacy reset while including newly added user-owned configurations.
create policy microsoft_config_delete_own on public.microsoft_user_configurations for delete to authenticated using(user_id=auth.uid());
grant delete on public.microsoft_user_configurations to authenticated;
create or replace function public.delete_my_application_data()
returns void language plpgsql set search_path = public, storage as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  delete from storage.objects where bucket_id in ('imports', 'signature-assets') and (storage.foldername(name))[1] = me::text;
  delete from public.datasets where user_id = me;
  delete from public.templates where user_id = me;
  delete from public.column_mapping_profiles where user_id = me;
  delete from public.signature_fields where user_id = me;
  delete from public.microsoft_integrations where user_id = me;
  delete from public.microsoft_user_configurations where user_id = me;
  delete from public.suppression_list where user_id = me;
  delete from public.user_preferences where user_id = me;
  update public.profiles set full_name = '', avatar_url = null, onboarding_completed = false where id = me;
  insert into public.user_preferences(user_id, live_sending_enabled) values(me, false) on conflict (user_id) do nothing;
end;
$$;
revoke execute on function public.delete_my_application_data() from public, anon;
grant execute on function public.delete_my_application_data() to authenticated;
commit;
