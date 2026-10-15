-- Apply AFTER 20261015_scheduled_mail.sql. Adds no timer and sends no mail.
begin;

-- A standalone test has no spreadsheet, row or reusable template. It still uses
-- the normal worker, leases, real-send switch, quota and outcome history.
alter table public.scheduled_mail_batches add column kind text not null default 'dataset' check(kind in ('dataset','test'));
alter table public.scheduled_mail_batches alter column dataset_id drop not null;
alter table public.scheduled_mail_batches add constraint scheduled_mail_source check(
  (kind='dataset' and dataset_id is not null) or (kind='test' and dataset_id is null and live_enabled));
alter table public.scheduled_mail_items alter column dataset_row_id drop not null;
alter table public.scheduled_mail_items alter column template_id drop not null;
alter table public.send_runs alter column dataset_id drop not null;
alter table public.send_runs add constraint send_run_source_required check(dataset_id is not null or (is_test and scheduled_batch_id is not null));
alter table public.send_run_items alter column dataset_row_id drop not null;
alter table public.email_history alter column dataset_id drop not null;
alter table public.email_history alter column dataset_row_id drop not null;
alter table public.scheduled_mail_daily_usage add column test_schedules integer not null default 0;

-- Keep every existing ownership check for real source IDs. Null sources are
-- restricted by the test-only guards below and scheduler-owned-run guards.
drop trigger send_runs_owner_guard on public.send_runs;
create trigger send_runs_owner_guard before insert or update on public.send_runs for each row when(new.dataset_id is not null) execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger send_run_items_row_owner_guard on public.send_run_items;
create trigger send_run_items_row_owner_guard before insert or update on public.send_run_items for each row when(new.dataset_row_id is not null) execute function public.enforce_same_owner('dataset_rows','dataset_row_id');
drop trigger email_history_dataset_owner_guard on public.email_history;
create trigger email_history_dataset_owner_guard before insert or update on public.email_history for each row when(new.dataset_id is not null) execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger email_history_row_owner_guard on public.email_history;
create trigger email_history_row_owner_guard before insert or update on public.email_history for each row when(new.dataset_row_id is not null) execute function public.enforce_same_owner('dataset_rows','dataset_row_id');
drop trigger send_run_items_link_guard on public.send_run_items;
create trigger send_run_items_link_guard before insert or update on public.send_run_items for each row when(new.dataset_row_id is not null) execute function public.validate_send_item_links();
drop trigger email_history_link_guard on public.email_history;
create trigger email_history_link_guard before insert or update on public.email_history for each row when(new.dataset_row_id is not null) execute function public.validate_history_links();

create function public.scheduler_test_source_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare test_run boolean;
begin
  select r.is_test and b.kind='test' and r.user_id=new.user_id into test_run
    from public.send_runs r join public.scheduled_mail_batches b on b.id=r.scheduled_batch_id
    where r.id=new.send_run_id;
  if new.dataset_row_id is null and not coalesce(test_run,false) then
    raise exception 'Only a scheduler-owned test email may omit its spreadsheet row.';
  end if;
  if coalesce(test_run,false) and (new.dataset_row_id is not null or new.template_id is not null) then raise exception 'Standalone tests cannot reference campaign rows or templates.'; end if;
  if tg_table_name='email_history' then
    if new.dataset_id is null and not coalesce(test_run,false) then raise exception 'Spreadsheet history requires its source.'; end if;
    -- Keep test messages out of campaign duplicate-history checks.
    if coalesce(test_run,false) then
      if new.dataset_id is not null or not exists(select 1 from public.send_run_items i where i.id=new.send_run_item_id and i.send_run_id=new.send_run_id and i.user_id=new.user_id and i.dataset_row_id is null) then raise exception 'Test history relationship mismatch'; end if;
      new.is_test:=true;
    end if;
  end if;
  return new;
end $$;
create trigger scheduler_test_source_guard before insert or update on public.send_run_items for each row execute function public.scheduler_test_source_guard();
create trigger scheduler_test_history_guard before insert or update on public.email_history for each row execute function public.scheduler_test_source_guard();

create function public.scheduler_create_test(p_owner uuid,p_recipient text,p_time timestamptz,p_timezone text,p_key uuid,p_sender text)
returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); ri uuid:=gen_random_uuid(); existing public.scheduled_mail_batches%rowtype; test_count integer;
  c public.background_mail_connections%rowtype; subject_line text:='[AUTMAIL test] Scheduled sending check';
  body_html text:='<p>Hello,</p><p>This is a scheduled test email from AUTMAIL.</p><p>You are receiving it because this address was entered manually to test scheduled sending. No spreadsheet or campaign was used.</p><p>AUTMAIL</p>';
  body_text text:=E'Hello,\n\nThis is a scheduled test email from AUTMAIL.\n\nYou are receiving it because this address was entered manually to test scheduled sending. No spreadsheet or campaign was used.\n\nAUTMAIL';
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,15));
  p_recipient:=lower(trim(p_recipient));
  select * into existing from public.scheduled_mail_batches where user_id=p_owner and request_key=p_key;
  if found then
    if existing.kind<>'test' or not exists(select 1 from public.scheduled_mail_items where batch_id=existing.id and recipient_email=p_recipient) then
      raise exception 'This confirmation was already used. Refresh Scheduled emails.';
    end if;
    return existing.id;
  end if;
  if exists(select 1 from public.admin_account_deletions where user_id=p_owner) then raise exception 'This workspace is unavailable.'; end if;
  if p_recipient is null or length(p_recipient)>254 or p_recipient !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+[.][^[:space:]@,;<>]+$' then raise exception 'Enter one valid recipient email address.'; end if;
  if p_time is null or p_time<now()+interval '5 minutes' or p_time>now()+interval '30 days' or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Choose a valid timezone and a time from 5 minutes to 30 days ahead.'; end if;
  if not exists(select 1 from public.scheduled_mail_control where enabled and last_tick_at>now()-interval '5 minutes') then raise exception 'The worker is paused or offline. Fix its check-in before scheduling a test.'; end if;
  if not exists(select 1 from public.user_preferences where user_id=p_owner and live_sending_enabled) then raise exception 'Turn on Real sending in Settings before scheduling a real test email.'; end if;
  select c0.* into c from public.background_mail_connections c0 join public.microsoft_integrations m on m.user_id=c0.user_id
    and m.connection_status='connected' and m.configuration_id=c0.configuration_id and m.configuration_version=c0.configuration_version
    and lower(m.connected_email)=lower(c0.sender_email) where c0.user_id=p_owner and c0.status='connected'
    and ((c0.connection_method='default' and exists(select 1 from public.microsoft_default_configuration x where x.id=c0.configuration_id and x.enabled and x.updated_at=c0.configuration_version))
      or (c0.connection_method='custom' and exists(select 1 from public.microsoft_user_configurations x where x.id=c0.configuration_id and x.user_id=p_owner and x.updated_at=c0.configuration_version)));
  if not found then raise exception 'Enable background access for your connected Microsoft sender first.'; end if;
  if p_sender is null or lower(c.sender_email)<>lower(p_sender) then raise exception 'Your Microsoft sender changed. Refresh checks and confirm the sender again.'; end if;
  if exists(select 1 from public.suppression_list where user_id=p_owner and email_normalized=p_recipient) then raise exception 'This address is on your do-not-email list. It cannot receive a test email.'; end if;
  if (select count(*) from public.scheduled_mail_batches where user_id=p_owner and status not in ('completed','completed_with_errors','cancelled'))>=10 then raise exception 'You already have 10 active schedules. Cancel an unused schedule first.'; end if;
  if exists(select 1 from public.scheduled_mail_items i join public.scheduled_mail_batches t on t.id=i.batch_id where i.user_id=p_owner and t.kind='test' and i.recipient_email=p_recipient
    and (i.status in ('sending','uncertain') or (i.status='pending' and t.status not in ('completed','completed_with_errors','cancelled')))) then raise exception 'This address already has a pending or unconfirmed test. Check Scheduled emails first.'; end if;
  insert into public.scheduled_mail_daily_usage(user_id,day) values(p_owner,(now() at time zone 'UTC')::date) on conflict do nothing;
  select test_schedules into test_count from public.scheduled_mail_daily_usage where user_id=p_owner and day=(now() at time zone 'UTC')::date for update;
  if test_count>=5 then raise exception 'You can create up to 5 scheduled test emails per UTC day, including cancelled tests.'; end if;
  update public.scheduled_mail_daily_usage set test_schedules=test_schedules+1 where user_id=p_owner and day=(now() at time zone 'UTC')::date;
  insert into public.send_runs(id,user_id,dataset_id,status,selected_count,is_test,live_enabled,microsoft_email,scheduled_batch_id)
    values(r,p_owner,null,'queued',1,true,true,c.sender_email,b);
  insert into public.scheduled_mail_batches(id,user_id,dataset_id,dataset_name,send_run_id,request_key,connection_id,sender_email,scheduled_at,timezone,live_enabled,duplicate_policy,kind)
    values(b,p_owner,null,'Scheduled test email',r,p_key,c.id,c.sender_email,p_time,p_timezone,true,'allow','test');
  insert into public.send_run_items(id,user_id,send_run_id,dataset_row_id,recipient_email,template_id,resolved_subject,resolved_html_body,resolved_plain_text_body)
    values(ri,p_owner,r,null,p_recipient,null,subject_line,body_html,body_text);
  insert into public.scheduled_mail_items(user_id,batch_id,send_run_item_id,dataset_row_id,recipient_email,template_id,template_name,subject,html_body,plain_text_body,next_attempt_at)
    values(p_owner,b,ri,null,p_recipient,null,'AUTMAIL scheduler test',subject_line,body_html,body_text,p_time);
  return b;
end $$;
revoke all on function public.scheduler_test_source_guard() from public,anon,authenticated;
grant execute on function public.scheduler_test_source_guard() to service_role;
revoke all on function public.scheduler_create_test(uuid,text,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.scheduler_create_test(uuid,text,timestamptz,text,uuid,text) to service_role;

-- Standalone tests no longer cascade from a dataset. Preserve the existing
-- invoker/RLS cleanup and explicitly delete owned queues before their sources.
create or replace function public.delete_my_application_data()
returns void language plpgsql set search_path = public, storage as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  delete from storage.objects where bucket_id in ('imports', 'signature-assets') and (storage.foldername(name))[1] = me::text;
  delete from public.send_runs where user_id = me;
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
