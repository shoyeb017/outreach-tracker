-- Apply AFTER 20261009_admin_controls.sql. Does not enable Cron or send any mail.
begin;

create table public.scheduled_mail_control (
  id boolean primary key default true check (id), enabled boolean not null default false,
  last_tick_at timestamptz, lease_id uuid, lease_until timestamptz
);
insert into public.scheduled_mail_control(id) values(true);
create table public.background_mail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(), configuration_id uuid not null,
  configuration_version timestamptz not null, connection_method text not null check(connection_method in ('default','custom')),
  client_id uuid not null, authority text not null, sender_email text not null, microsoft_user_id text not null,
  status text not null check(status in ('connected','disconnected','reconnect_required')),
  refresh_ciphertext text, credential_ciphertext text, reason text,
  updated_at timestamptz not null default now()
);
create table public.background_mail_oauth_states (
  state_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null, expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.send_runs add column scheduled_batch_id uuid;
create table public.scheduled_mail_batches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade, dataset_name text not null,
  send_run_id uuid not null unique references public.send_runs(id) on delete cascade,
  request_key uuid not null, connection_id uuid, sender_email text,
  scheduled_at timestamptz not null, timezone text not null, live_enabled boolean not null,
  duplicate_policy text not null check(duplicate_policy in ('block_template_recipient','warn','allow')),
  status text not null default 'scheduled' check(status in ('scheduled','running','paused','reconnect_required','needs_attention','completed','completed_with_errors','cancelled')),
  reason text, last_progress_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,request_key)
);
create table public.scheduled_mail_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.scheduled_mail_batches(id) on delete cascade,
  send_run_item_id uuid not null unique references public.send_run_items(id) on delete cascade,
  dataset_row_id uuid not null references public.dataset_rows(id) on delete cascade,
  recipient_email text not null, template_id uuid not null, template_name text not null,
  subject text not null, html_body text not null, plain_text_body text not null,
  status text not null default 'pending' check(status in ('pending','sending','accepted','simulated','failed','skipped','cancelled','uncertain')),
  attempts integer not null default 0, reason text, next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz, accepted_at timestamptz, lease_id uuid,
  unique(batch_id,dataset_row_id)
);
create index scheduled_batches_due on public.scheduled_mail_batches(scheduled_at) where status in ('scheduled','running');
create index scheduled_batches_owner on public.scheduled_mail_batches(user_id,created_at desc);
create index scheduled_items_batch on public.scheduled_mail_items(batch_id,status,next_attempt_at);
create index scheduled_items_protection on public.scheduled_mail_items(user_id,lower(recipient_email),template_id,status);
create table public.scheduled_mail_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade, day date not null,
  attempts integer not null default 0, primary key(user_id,day)
);

-- Tokens, credentials, OAuth states, usage and worker controls are NEVER browser-readable.
do $$ declare t text; begin
  foreach t in array array['scheduled_mail_control','background_mail_connections','background_mail_oauth_states','scheduled_mail_batches','scheduled_mail_items','scheduled_mail_daily_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant select on public.scheduled_mail_batches,public.scheduled_mail_items to authenticated;
create policy scheduled_batch_read on public.scheduled_mail_batches for select to authenticated using(user_id = (select auth.uid()) and (select public.workspace_access_allowed()));
create policy scheduled_item_read on public.scheduled_mail_items for select to authenticated using(user_id = (select auth.uid()) and (select public.workspace_access_allowed()));

-- The existing browser queue must not resume or mutate a scheduler-owned run.
create function public.scheduler_guard_run() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'DELETE' and auth.role() = 'authenticated' and (
    (tg_table_name = 'send_runs' and coalesce(to_jsonb(new)->>'scheduled_batch_id',to_jsonb(old)->>'scheduled_batch_id') is not null)
    or (tg_table_name <> 'send_runs' and exists(select 1 from public.send_runs r where r.id = coalesce((to_jsonb(new)->>'send_run_id')::uuid,(to_jsonb(old)->>'send_run_id')::uuid) and r.scheduled_batch_id is not null))
  ) then raise exception 'Manage this send from Scheduled emails.'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger scheduler_guard_run before insert or update or delete on public.send_runs for each row execute function public.scheduler_guard_run();
create trigger scheduler_guard_item before insert or update or delete on public.send_run_items for each row execute function public.scheduler_guard_run();
create trigger scheduler_guard_history before insert or update or delete on public.email_history for each row execute function public.scheduler_guard_run();

create function public.scheduler_disconnect_on_sender_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.connection_status <> 'connected' or old.home_account_id is distinct from new.home_account_id
    or old.configuration_id is distinct from new.configuration_id or old.configuration_version is distinct from new.configuration_version
    or old.connected_email is distinct from new.connected_email or old.resolved_authority is distinct from new.resolved_authority then
    delete from public.background_mail_oauth_states where user_id=new.user_id;
    update public.background_mail_connections set status='disconnected',refresh_ciphertext=null,credential_ciphertext=null,
      reason='The Microsoft sender or configuration changed. Enable background access again.',updated_at=now() where user_id=new.user_id;
    update public.scheduled_mail_batches set status='paused',reason='Microsoft was disconnected or changed. Reconnect and choose a new send time.',updated_at=now()
      where user_id=new.user_id and live_enabled and status in ('scheduled','running','reconnect_required');
  end if;
  return new;
end $$;
create trigger scheduler_sender_change after update on public.microsoft_integrations for each row execute function public.scheduler_disconnect_on_sender_change();
create function public.scheduler_remove_background_on_sender_delete() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.background_mail_oauth_states where user_id=old.user_id;
  delete from public.background_mail_connections where user_id=old.user_id;
  update public.scheduled_mail_batches set status='paused',reason='The Microsoft sender was removed. Reconnect and review before sending.',updated_at=now()
    where user_id=old.user_id and live_enabled and status in ('scheduled','running','reconnect_required');
  return old;
end $$;
create trigger scheduler_sender_delete after delete on public.microsoft_integrations for each row execute function public.scheduler_remove_background_on_sender_delete();
create function public.scheduler_pause_when_live_disabled() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.live_sending_enabled and not new.live_sending_enabled then
    update public.scheduled_mail_batches set status='paused',reason='Real sending was turned off in Settings. Review and choose a new time after enabling it again.',updated_at=now()
      where user_id=new.user_id and live_enabled and status in ('scheduled','running','reconnect_required');
  end if;
  return new;
end $$;
create trigger scheduler_live_disabled after update on public.user_preferences for each row execute function public.scheduler_pause_when_live_disabled();
create function public.scheduler_guard_connection() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.admin_account_deletions where user_id=new.user_id)
    and not (new.status='disconnected' and new.refresh_ciphertext is null and new.credential_ciphertext is null)
    then raise exception 'This account is being deleted and cannot enable background access.'; end if;
  return new;
end $$;
create trigger scheduler_connection_freeze before insert or update on public.background_mail_connections for each row execute function public.scheduler_guard_connection();
create trigger scheduler_oauth_freeze before insert or update on public.background_mail_oauth_states for each row execute function public.guard_deleting_workspace();

create function public.scheduler_save_connection(p_owner uuid,p_home_account text,p_connection jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare c public.background_mail_connections%rowtype; m public.microsoft_integrations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,15));
  select * into m from public.microsoft_integrations where user_id=p_owner for update;
  c:=jsonb_populate_record(null::public.background_mail_connections,p_connection);
  if m.user_id is null or c.user_id is distinct from p_owner or m.connection_status<>'connected'
    or m.home_account_id is distinct from p_home_account or m.configuration_id is distinct from c.configuration_id
    or m.configuration_version is distinct from c.configuration_version or lower(m.connected_email) is distinct from lower(c.sender_email)
    or lower(m.client_id) is distinct from c.client_id::text or m.connection_method is distinct from c.connection_method
    or m.resolved_authority is distinct from c.authority or c.status<>'connected'
    or c.refresh_ciphertext is null or c.credential_ciphertext is null
    or exists(select 1 from public.admin_account_deletions where user_id=p_owner) then
    raise exception 'The selected Microsoft sender changed during authorization. Reconnect explicitly.';
  end if;
  if not ((c.connection_method='default' and exists(select 1 from public.microsoft_default_configuration x where x.id=c.configuration_id and x.enabled and x.updated_at=c.configuration_version))
    or (c.connection_method='custom' and exists(select 1 from public.microsoft_user_configurations x where x.id=c.configuration_id and x.user_id=p_owner and x.updated_at=c.configuration_version))) then
    raise exception 'The Microsoft registration changed during authorization.';
  end if;
  insert into public.background_mail_connections select c.* on conflict(user_id) do update set
    id=excluded.id,configuration_id=excluded.configuration_id,configuration_version=excluded.configuration_version,
    connection_method=excluded.connection_method,client_id=excluded.client_id,authority=excluded.authority,
    sender_email=excluded.sender_email,microsoft_user_id=excluded.microsoft_user_id,status=excluded.status,
    refresh_ciphertext=excluded.refresh_ciphertext,credential_ciphertext=excluded.credential_ciphertext,reason=null,updated_at=now();
  update public.scheduled_mail_batches set status='paused',reason='Background access was renewed. Review pending recipients and choose a new time.',updated_at=now()
    where user_id=p_owner and live_enabled and status in ('scheduled','running','reconnect_required');
end $$;

create function public.scheduler_create_batch(p_owner uuid,p_dataset uuid,p_time timestamptz,p_timezone text,p_live boolean,p_policy text,p_key uuid,p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); item jsonb; ri uuid; c public.background_mail_connections%rowtype; d public.datasets%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,15));
  select id into b from public.scheduled_mail_batches where user_id=p_owner and request_key=p_key;
  if found then return b; end if;
  b:=gen_random_uuid();
  if exists(select 1 from public.admin_account_deletions where user_id=p_owner) then raise exception 'This workspace is unavailable.'; end if;
  if not exists(select 1 from public.scheduled_mail_control where enabled and last_tick_at>now()-interval '5 minutes') then raise exception 'Scheduled sending is paused or its worker is offline. Ask the administrator to check setup.'; end if;
  if p_time < now()+interval '5 minutes' or p_time>now()+interval '30 days' then raise exception 'Choose a time from 5 minutes to 30 days ahead.'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
  if p_policy not in ('block_template_recipient','warn','allow') or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or octet_length(p_items::text)>1000000 then raise exception 'Choose 1–100 ready recipients; the saved email snapshot must fit within 1 MB.'; end if;
  if (select count(*) from public.scheduled_mail_batches where user_id=p_owner and status not in ('completed','completed_with_errors','cancelled'))>=10 then raise exception 'You can keep up to 10 active schedules. Cancel an unused schedule first.'; end if;
  select * into d from public.datasets where id=p_dataset and user_id=p_owner;
  if not found then raise exception 'Spreadsheet not found.'; end if;
  if p_live then
    if not exists(select 1 from public.user_preferences where user_id=p_owner and live_sending_enabled) then raise exception 'Real sending is off in Settings.'; end if;
    select c0.* into c from public.background_mail_connections c0 join public.microsoft_integrations i on i.user_id=c0.user_id
      and i.configuration_id=c0.configuration_id and i.configuration_version=c0.configuration_version and lower(i.connected_email)=lower(c0.sender_email)
      where c0.user_id=p_owner and c0.status='connected' and i.connection_status='connected';
    if not found then raise exception 'Enable background Microsoft access before scheduling real emails.'; end if;
  end if;
  insert into public.send_runs(id,user_id,dataset_id,status,selected_count,live_enabled,microsoft_email,scheduled_batch_id)
    values(r,p_owner,p_dataset,'queued',jsonb_array_length(p_items),p_live,c.sender_email,b);
  insert into public.scheduled_mail_batches(id,user_id,dataset_id,dataset_name,send_run_id,request_key,connection_id,sender_email,scheduled_at,timezone,live_enabled,duplicate_policy)
    values(b,p_owner,p_dataset,d.name,r,p_key,c.id,c.sender_email,p_time,p_timezone,p_live,p_policy);
  for item in select value from jsonb_array_elements(p_items) loop
    if not exists(select 1 from public.dataset_rows where id=(item->>'row_id')::uuid and dataset_id=p_dataset and user_id=p_owner) then raise exception 'A selected row changed. Review again.'; end if;
    if p_live and exists(select 1 from public.send_run_items si join public.send_runs sr on sr.id=si.send_run_id
      where si.user_id=p_owner and lower(trim(si.recipient_email))=lower(item->>'recipient_email') and si.template_id=(item->>'template_id')::uuid
      and sr.id<>r and sr.live_enabled and si.status in ('queued','sending')) then raise exception 'This recipient and template are already queued or unconfirmed. Check Scheduled emails and Send history.'; end if;
    if p_policy='block_template_recipient' and (
      exists(select 1 from public.email_history where user_id=p_owner and lower(trim(recipient_email))=lower(item->>'recipient_email') and template_id=(item->>'template_id')::uuid and status='sent' and not is_test)
      or exists(select 1 from public.scheduled_mail_items where batch_id=b and lower(recipient_email)=lower(item->>'recipient_email') and template_id=(item->>'template_id')::uuid)
    ) then raise exception 'A duplicate was found. Review the recipients again.'; end if;
    ri:=gen_random_uuid();
    insert into public.send_run_items(id,user_id,send_run_id,dataset_row_id,recipient_email,template_id,resolved_subject,resolved_html_body,resolved_plain_text_body)
      values(ri,p_owner,r,(item->>'row_id')::uuid,item->>'recipient_email',(item->>'template_id')::uuid,item->>'subject',item->>'html_body',item->>'plain_text_body');
    insert into public.scheduled_mail_items(user_id,batch_id,send_run_item_id,dataset_row_id,recipient_email,template_id,template_name,subject,html_body,plain_text_body,next_attempt_at)
      values(p_owner,b,ri,(item->>'row_id')::uuid,item->>'recipient_email',(item->>'template_id')::uuid,item->>'template_name',item->>'subject',item->>'html_body',item->>'plain_text_body',p_time);
  end loop;
  return b;
end $$;

create function public.scheduler_begin_tick(p_lease uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.scheduled_mail_control set last_tick_at=now(),lease_id=p_lease,lease_until=now()+interval '110 seconds'
    where id and (lease_until is null or lease_until<now());
  if not found then return false; end if;
  delete from public.background_mail_oauth_states where expires_at<now();
  delete from public.scheduled_mail_daily_usage where day<current_date-40;
  update public.scheduled_mail_items i set status=case when b.live_enabled then 'uncertain' else 'failed' end,
    reason=case when b.live_enabled then 'The worker stopped before saving the outcome. Check Microsoft Sent Items. This email will not be automatically retried.' else 'The practice result could not be saved. No real email was sent. Create a new reviewed practice run if needed.' end
    from public.scheduled_mail_batches b where i.batch_id=b.id and i.status='sending' and i.last_attempt_at<now()-interval '2 minutes';
  update public.send_run_items r set status='failed',error_message=i.reason from public.scheduled_mail_items i
    where i.send_run_item_id=r.id and i.status='failed' and r.status='sending';
  update public.scheduled_mail_batches b set status='needs_attention',reason='An email outcome is unknown. Check Sent Items before taking further action.',updated_at=now()
    where status in ('scheduled','running','paused','reconnect_required','cancelled') and exists(select 1 from public.scheduled_mail_items i where i.batch_id=b.id and i.status='uncertain');
  update public.scheduled_mail_batches set status='needs_attention',reason='Sending was delayed by more than 15 minutes. Nothing overdue will start automatically. Review and choose a new time.',updated_at=now()
    where status in ('scheduled','running') and coalesce(last_progress_at,scheduled_at)<now()-interval '15 minutes';
  return true;
end $$;

create function public.scheduler_next_item(p_lease uuid) returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('batch',to_jsonb(b),'item',to_jsonb(i)) from public.scheduled_mail_batches b
    join public.scheduled_mail_items i on i.batch_id=b.id
    where b.status in ('scheduled','running') and b.scheduled_at<=now() and i.status='pending' and i.next_attempt_at<=now()
      and exists(select 1 from public.scheduled_mail_control where enabled and lease_id=p_lease and lease_until>now())
    order by coalesce(b.last_progress_at,b.scheduled_at),b.created_at,i.id limit 1;
$$;

create function public.scheduler_arm_item(p_item uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare i public.scheduled_mail_items%rowtype; b public.scheduled_mail_batches%rowtype; used integer; why text;
begin
  select * into i from public.scheduled_mail_items where id=p_item;
  if not found or i.status<>'pending' then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(i.user_id::text,15));
  select * into i from public.scheduled_mail_items where id=p_item for update;
  if not found or i.status<>'pending' then return false; end if;
  select * into b from public.scheduled_mail_batches where id=i.batch_id for update;
  if b.status not in ('scheduled','running') or b.scheduled_at>now() or i.next_attempt_at>now()
    or not exists(select 1 from public.scheduled_mail_control where enabled and lease_id=p_lease and lease_until>now()) then return false; end if;
  if exists(select 1 from public.admin_account_deletions where user_id=i.user_id) then why:='The workspace is being deleted.';
  elsif b.live_enabled and not exists(select 1 from public.user_preferences where user_id=i.user_id and live_sending_enabled) then why:='Real sending was turned off in Settings.';
  elsif b.live_enabled and not exists(select 1 from public.background_mail_connections c join public.microsoft_integrations m on m.user_id=c.user_id
    and m.connection_status='connected' and m.configuration_id=c.configuration_id and m.configuration_version=c.configuration_version
    and lower(m.connected_email)=lower(c.sender_email) where c.id=b.connection_id and c.status='connected'
    and ((c.connection_method='default' and exists(select 1 from public.microsoft_default_configuration x where x.id=c.configuration_id and x.enabled and x.updated_at=c.configuration_version))
      or (c.connection_method='custom' and exists(select 1 from public.microsoft_user_configurations x where x.id=c.configuration_id and x.user_id=c.user_id and x.updated_at=c.configuration_version)))) then why:='Microsoft background access changed. Reconnect and reschedule.';
  end if;
  if why is not null then update public.scheduled_mail_batches set status='paused',reason=why,updated_at=now() where id=b.id; return false; end if;
  if exists(select 1 from public.suppression_list where user_id=i.user_id and email_normalized=lower(i.recipient_email)) then why:='Skipped: this address is now on your do-not-email list.';
  elsif exists(select 1 from public.send_run_items si join public.send_runs sr on sr.id=si.send_run_id where si.user_id=i.user_id and si.id<>i.send_run_item_id and lower(trim(si.recipient_email))=lower(i.recipient_email) and si.template_id=i.template_id and si.status='sending' and sr.live_enabled) then why:='Skipped: another send to this recipient and template has an unconfirmed outcome.';
  elsif b.duplicate_policy='block_template_recipient' and exists(select 1 from public.email_history where user_id=i.user_id and lower(trim(recipient_email))=lower(i.recipient_email) and template_id=i.template_id and status='sent' and not is_test) then why:='Skipped: this recipient already received this template.';
  end if;
  if why is not null then
    update public.scheduled_mail_items set status='skipped',reason=why where id=i.id;
    update public.send_run_items set status='skipped',error_message=why where id=i.send_run_item_id;
    update public.scheduled_mail_batches set last_progress_at=now(),updated_at=now() where id=b.id;
    return false;
  end if;
  if b.live_enabled then
    insert into public.scheduled_mail_daily_usage(user_id,day) values(i.user_id,(now() at time zone 'UTC')::date) on conflict do nothing;
    select attempts into used from public.scheduled_mail_daily_usage where user_id=i.user_id and day=(now() at time zone 'UTC')::date for update;
    if used>=100 then update public.scheduled_mail_batches set status='needs_attention',reason='Daily scheduled-send safety limit reached (100 attempts per user per UTC day). Review and choose a later time.',updated_at=now() where id=b.id; return false; end if;
    update public.scheduled_mail_daily_usage set attempts=attempts+1 where user_id=i.user_id and day=(now() at time zone 'UTC')::date;
  end if;
  update public.scheduled_mail_items set status='sending',attempts=attempts+1,last_attempt_at=now(),lease_id=p_lease,reason=null where id=i.id;
  update public.send_run_items set status='sending',attempts=attempts+1,error_message=null where id=i.send_run_item_id;
  update public.scheduled_mail_batches set status='running',last_progress_at=now(),updated_at=now() where id=b.id;
  update public.send_runs set status='running',started_at=coalesce(started_at,now()) where id=b.send_run_id;
  return true;
end $$;

create function public.scheduler_finish_item(p_item uuid,p_lease uuid,p_status text,p_reason text default null,p_retry_seconds integer default 60)
returns boolean language plpgsql security definer set search_path = '' as $$
declare i public.scheduled_mail_items%rowtype; b public.scheduled_mail_batches%rowtype; mapped text;
begin
  if p_status not in ('accepted','simulated','failed','uncertain','pending') then raise exception 'Invalid result'; end if;
  select * into i from public.scheduled_mail_items where id=p_item for update;
  if not found or i.lease_id is distinct from p_lease or i.status not in ('sending','uncertain') then return false; end if;
  select * into b from public.scheduled_mail_batches where id=i.batch_id;
  mapped:=case p_status when 'accepted' then 'sent' when 'simulated' then 'simulated' when 'pending' then 'queued' when 'uncertain' then 'sending' else 'failed' end;
  update public.scheduled_mail_items set status=p_status,reason=left(p_reason,500),accepted_at=case when p_status in ('accepted','simulated') then now() else null end,
    next_attempt_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_retry_seconds,60),3600))) where id=i.id;
  update public.send_run_items set status=mapped,error_message=left(p_reason,500),sent_at=case when p_status in ('accepted','simulated') then now() else null end where id=i.send_run_item_id;
  if p_status in ('accepted','simulated','failed') then
    insert into public.email_history(user_id,dataset_id,dataset_row_id,send_run_id,send_run_item_id,template_id,recipient_email,subject,final_html_body,final_plain_text_body,sender_microsoft_email,status,error_message)
      values(i.user_id,b.dataset_id,i.dataset_row_id,b.send_run_id,i.send_run_item_id,i.template_id,i.recipient_email,i.subject,i.html_body,i.plain_text_body,b.sender_email,mapped,left(p_reason,500))
      on conflict(send_run_item_id) do update set status=excluded.status,error_message=excluded.error_message;
  end if;
  update public.scheduled_mail_batches set last_progress_at=now(),updated_at=now(),
    status=case when p_status='uncertain' then 'needs_attention' else status end,
    reason=case when p_status='uncertain' then 'An email outcome is unknown. Check Microsoft Sent Items. It will not be automatically resent.' else reason end where id=b.id;
  return true;
end $$;

create function public.scheduler_refresh_counts() returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.scheduled_mail_batches b set
    status=case when exists(select 1 from public.scheduled_mail_items i where i.batch_id=b.id and i.status in ('failed','skipped','uncertain')) then 'completed_with_errors' else 'completed' end,
    completed_at=now(),updated_at=now()
    where b.status not in ('completed','completed_with_errors','cancelled') and not exists(select 1 from public.scheduled_mail_items i where i.batch_id=b.id and i.status in ('pending','sending','uncertain'));
  update public.send_runs r set
    sent_count=(select count(*) from public.scheduled_mail_items i where i.batch_id=b.id and i.status in ('accepted','simulated')),
    failed_count=(select count(*) from public.scheduled_mail_items i where i.batch_id=b.id and i.status in ('failed','uncertain')),
    skipped_count=(select count(*) from public.scheduled_mail_items i where i.batch_id=b.id and i.status in ('skipped','cancelled')),
    status=case when b.status in ('completed','completed_with_errors') then 'completed' when b.status='cancelled' then 'cancelled' else 'paused' end,
    completed_at=b.completed_at from public.scheduled_mail_batches b where b.send_run_id=r.id and b.updated_at>now()-interval '2 minutes';
end $$;

create function public.scheduler_hold_batch(p_batch uuid,p_lease uuid,p_status text,p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare b public.scheduled_mail_batches%rowtype;
begin
  if not exists(select 1 from public.scheduled_mail_control where lease_id=p_lease and lease_until>now()) then return; end if;
  select * into b from public.scheduled_mail_batches where id=p_batch for update;
  if b.status not in ('scheduled','running') then return; end if;
  if p_status='retry' then
    update public.scheduled_mail_items set next_attempt_at=now()+interval '2 minutes',reason=left(p_reason,500) where batch_id=b.id and status='pending';
  elsif p_status in ('needs_attention','reconnect_required') then
    if p_status='reconnect_required' then
      update public.background_mail_connections set status='reconnect_required',refresh_ciphertext=null,reason=left(p_reason,500),updated_at=now() where id=b.connection_id;
      update public.scheduled_mail_batches set status=p_status,reason=left(p_reason,500),updated_at=now() where connection_id=b.connection_id and status in ('scheduled','running');
    else
      update public.scheduled_mail_batches set status=p_status,reason=left(p_reason,500),updated_at=now() where id=b.id;
    end if;
  else raise exception 'Invalid hold status'; end if;
end $$;

create function public.scheduler_change_batch(p_owner uuid,p_batch uuid,p_action text,p_time timestamptz default null,p_timezone text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.scheduled_mail_batches%rowtype; c public.background_mail_connections%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,15));
  select * into b from public.scheduled_mail_batches where id=p_batch and user_id=p_owner for update;
  if not found then raise exception 'Schedule not found.'; end if;
  if b.status in ('completed','completed_with_errors','cancelled') then raise exception 'This schedule is finished. Create a new reviewed schedule instead.'; end if;
  if p_action='cancel' then
    update public.scheduled_mail_batches set status='cancelled',reason='Cancelled by you. An email already handed to Microsoft may still complete.',completed_at=now(),updated_at=now() where id=b.id;
    update public.scheduled_mail_items set status='cancelled',reason='Cancelled before sending.' where batch_id=b.id and status='pending';
    update public.send_run_items set status='cancelled',error_message='Cancelled before sending.' where id in(select send_run_item_id from public.scheduled_mail_items where batch_id=b.id and status='cancelled');
  elsif p_action='pause' then
    update public.scheduled_mail_batches set status='paused',reason='Paused by you. An email already handed to Microsoft may still complete.',updated_at=now() where id=b.id;
  elsif p_action='reschedule' then
    if exists(select 1 from public.scheduled_mail_items where batch_id=b.id and status in ('sending','uncertain')) then raise exception 'Check the unknown or in-flight email outcomes before rescheduling.'; end if;
    if not exists(select 1 from public.scheduled_mail_items where batch_id=b.id and status='pending') then raise exception 'No pending recipients remain. Failed emails are not automatically retried.'; end if;
    if p_time is null or p_time<now()+interval '5 minutes' or p_time>now()+interval '30 days' or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid timezone and a time from 5 minutes to 30 days ahead.'; end if;
    if not exists(select 1 from public.scheduled_mail_control where enabled and last_tick_at>now()-interval '5 minutes') then raise exception 'The scheduled-send worker is paused or offline.'; end if;
    if b.live_enabled then
      select c0.* into c from public.background_mail_connections c0 join public.microsoft_integrations m on m.user_id=c0.user_id and m.connection_status='connected' and m.configuration_id=c0.configuration_id and m.configuration_version=c0.configuration_version
        where c0.user_id=p_owner and c0.status='connected' and lower(c0.sender_email)=lower(b.sender_email) and lower(m.connected_email)=lower(b.sender_email);
      if not found then raise exception 'Reconnect the original sending mailbox before rescheduling.'; end if;
      if not exists(select 1 from public.user_preferences where user_id=p_owner and live_sending_enabled) then raise exception 'Real sending is off in Settings.'; end if;
    end if;
    update public.scheduled_mail_batches set status='scheduled',reason=null,scheduled_at=p_time,timezone=p_timezone,connection_id=c.id,last_progress_at=null,updated_at=now() where id=b.id;
    update public.scheduled_mail_items set next_attempt_at=p_time,reason=null where batch_id=b.id and status='pending';
  else raise exception 'Unknown schedule action.'; end if;
  perform public.scheduler_refresh_counts();
end $$;

create function public.scheduler_resolve_unknown(p_owner uuid,p_batch uuid,p_item uuid,p_accepted boolean) returns void language plpgsql security definer set search_path = '' as $$
declare i public.scheduled_mail_items%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,15));
  select * into i from public.scheduled_mail_items where id=p_item and batch_id=p_batch and user_id=p_owner for update;
  if not found or i.status<>'uncertain' then raise exception 'This email no longer has an unknown outcome. Refresh the schedule.'; end if;
  perform public.scheduler_finish_item(i.id,i.lease_id,case when p_accepted then 'accepted' else 'failed' end,
    case when p_accepted then 'You confirmed this email in Microsoft Sent Items. It was not resent.' else 'You checked Sent Items and confirmed this email was not sent. No retry was made.' end);
  perform public.scheduler_refresh_counts();
end $$;

-- Include scheduler reservations in existing previews and preserve current history checks.
create or replace function public.send_recipient_protection(p_emails text[])
returns jsonb language sql stable set search_path = public as $$
select jsonb_build_object(
  'history',coalesce((select jsonb_agg(x) from(select distinct lower(trim(recipient_email)) recipient_email,template_id,status from public.email_history where user_id=auth.uid() and status='sent' and not is_test and lower(trim(recipient_email))=any(p_emails))x),'[]'::jsonb),
  'suppressed',coalesce((select jsonb_agg(email_normalized) from public.suppression_list where user_id=auth.uid() and email_normalized=any(p_emails)),'[]'::jsonb),
  'uncertain',coalesce((select jsonb_agg(x) from(select distinct lower(trim(recipient_email)) recipient_email,template_id from public.send_run_items where user_id=auth.uid() and status='sending' and lower(trim(recipient_email))=any(p_emails))x),'[]'::jsonb),
  'scheduled',coalesce((select jsonb_agg(x) from(select distinct lower(i.recipient_email) recipient_email,i.template_id from public.scheduled_mail_items i join public.scheduled_mail_batches b on b.id=i.batch_id where i.user_id=auth.uid() and b.live_enabled and b.status not in ('completed','completed_with_errors','cancelled') and i.status='pending' and lower(i.recipient_email)=any(p_emails))x),'[]'::jsonb)
);
$$;
create or replace function public.claim_send_run_item(p_item_id uuid,p_expected_attempts integer)
returns boolean language plpgsql set search_path = public as $$
declare owner_id uuid; recipient text; template uuid;
begin
  select user_id,lower(trim(recipient_email)),template_id into owner_id,recipient,template from public.send_run_items where id=p_item_id and user_id=auth.uid();
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,15));
  if exists(select 1 from public.scheduled_mail_items i join public.scheduled_mail_batches b on b.id=i.batch_id where i.user_id=owner_id and b.live_enabled and lower(i.recipient_email)=recipient and i.template_id=template
    and (i.status in ('sending','uncertain') or (b.status not in ('completed','completed_with_errors','cancelled') and i.status='pending'))) then raise exception 'This recipient is reserved by Scheduled emails or has an unknown send outcome. Check Scheduled emails before continuing.'; end if;
  update public.send_run_items set status='sending',attempts=attempts+1,error_message=null,sent_at=null where id=p_item_id and user_id=auth.uid() and status in ('queued','failed') and attempts=p_expected_attempts
    and not exists(select 1 from public.send_runs where id=send_run_items.send_run_id and scheduled_batch_id is not null);
  return found;
end $$;

-- All scheduler mutations and private data are service-role only. Browser reads use RLS.
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'scheduler\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
commit;
