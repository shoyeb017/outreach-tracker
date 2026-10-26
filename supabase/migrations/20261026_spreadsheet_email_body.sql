-- Apply AFTER all 20261019 migrations. No timers are created and no email is sent.
begin;
alter table public.datasets add column body_source text not null default 'template' check(body_source in ('template','spreadsheet'));
alter table public.datasets add column body_column_id uuid references public.dataset_columns(id) on delete set null;
alter table public.datasets add column spreadsheet_signature boolean not null default true;
alter table public.column_mapping_profiles add column body_source text not null default 'template' check(body_source in ('template','spreadsheet'));
alter table public.column_mapping_profiles add column spreadsheet_signature boolean not null default true;

create function public.validate_body_column() returns trigger language plpgsql set search_path='' as $$
begin
  if new.body_column_id is not null and not exists(select 1 from public.dataset_columns where id=new.body_column_id and dataset_id=new.id and user_id=new.user_id) then raise exception 'Body column must belong to this spreadsheet.'; end if;
  return new;
end $$;
create trigger datasets_body_column_guard before insert or update on public.datasets for each row execute function public.validate_body_column();

-- Freeze identity on insertion, rather than comparing NULL template IDs.
-- Spreadsheet-mode duplicate policy is recipient + source dataset (not body text).
-- Repeated addresses in this campaign are blocked even when their row text differs.
alter table public.send_run_items add column content_key text;
alter table public.send_run_items add column content_label text;
alter table public.email_history add column content_key text;
alter table public.email_history add column content_label text;
alter table public.scheduled_mail_items add column content_key text;
update public.send_run_items i set content_key=i.template_id::text,content_label=t.name from public.templates t where t.id=i.template_id;
update public.email_history h set content_key=h.template_id::text,content_label=t.name from public.templates t where t.id=h.template_id;
update public.scheduled_mail_items set content_key=template_id::text;

create function public.stamp_email_content() returns trigger language plpgsql set search_path='' as $$
declare source_id uuid; source_mode text; label0 text; key0 text;
begin
  if tg_op='UPDATE' then
    new.content_key:=old.content_key;
    if tg_table_name<>'scheduled_mail_items' then new.content_label:=old.content_label; end if;
    return new;
  end if;
  if tg_table_name='send_run_items' then
    select d.id,d.body_source,bc.original_label into source_id,source_mode,label0 from public.send_runs r join public.datasets d on d.id=r.dataset_id left join public.dataset_columns bc on bc.id=d.body_column_id where r.id=new.send_run_id and r.user_id=new.user_id;
    if new.template_id is not null then
      key0:=new.template_id::text;
      select name into label0 from public.templates where id=new.template_id;
    elsif source_mode='spreadsheet' then
      key0:='spreadsheet:'||source_id::text;
      label0:='Spreadsheet body'||coalesce(': '||label0,'');
    end if;
  else
    select content_key,content_label into key0,label0 from public.send_run_items where id=new.send_run_item_id and user_id=new.user_id;
    if key0 is null and new.template_id is not null then
      key0:=new.template_id::text;
      select name into label0 from public.templates where id=new.template_id;
    end if;
  end if;
  if tg_table_name='send_run_items' and new.content_key is not null and new.content_key is distinct from key0 then raise exception 'Email content source changed. Review this send again.'; end if;
  new.content_key:=key0;
  if tg_table_name<>'scheduled_mail_items' then new.content_label:=label0; end if;
  return new;
end $$;
create trigger send_items_content_stamp before insert or update on public.send_run_items for each row execute function public.stamp_email_content();
create trigger email_history_content_stamp before insert or update on public.email_history for each row execute function public.stamp_email_content();
create trigger scheduled_items_content_stamp before insert or update on public.scheduled_mail_items for each row execute function public.stamp_email_content();
create index send_items_content_protection on public.send_run_items(user_id,lower(trim(recipient_email)),content_key,status);
create index history_content_protection on public.email_history(user_id,lower(trim(recipient_email)),content_key,status);
create index scheduled_content_protection on public.scheduled_mail_items(user_id,lower(recipient_email),content_key,status);

create or replace function public.save_spreadsheet_setup(
  p_dataset_id uuid, p_email_column uuid, p_routing_column uuid,
  p_template uuid, p_subject_column uuid default null
) returns void language plpgsql set search_path = public as $$
declare old_column uuid;
begin
  select routing_column_id into old_column from public.datasets where id = p_dataset_id and user_id = auth.uid();
  if not found then raise exception 'Spreadsheet not found'; end if;
  if p_routing_column is null and p_template is null then raise exception 'Choose an email template'; end if;
  if p_subject_column = p_email_column then raise exception 'Email and subject must use different columns'; end if;
  perform public.set_dataset_standard_mapping(p_dataset_id, p_email_column, 'recipient_email');
  update public.dataset_columns set standard_field = null where dataset_id = p_dataset_id and standard_field = 'subject' and user_id = auth.uid();
  if p_subject_column is not null then perform public.set_dataset_standard_mapping(p_dataset_id, p_subject_column, 'subject'); end if;
  perform public.set_dataset_routing_column(p_dataset_id, p_routing_column);
  update public.datasets set body_source='template',body_column_id=null,fallback_template_id = p_template, subject_strategy = case when p_subject_column is null then 'template' else 'spreadsheet_fallback' end where id = p_dataset_id and user_id = auth.uid();
  if old_column is distinct from p_routing_column or p_routing_column is null then
    delete from public.routing_rules where dataset_id = p_dataset_id and user_id = auth.uid();
  end if;
  if p_subject_column is null then update public.dataset_rows set subject_value = null where dataset_id = p_dataset_id and user_id = auth.uid(); end if;
end;
$$;

create function public.save_spreadsheet_content_setup(
  p_dataset_id uuid,p_email_column uuid,p_routing_column uuid,p_template uuid,p_subject_column uuid,
  p_source text,p_body_column uuid,p_signature boolean
) returns void language plpgsql set search_path=public as $$
begin
  perform 1 from public.datasets where id=p_dataset_id and user_id=auth.uid() for update;
  if not found then raise exception 'Spreadsheet not found.'; end if;
  if p_source='template' then
    perform public.save_spreadsheet_setup(p_dataset_id,p_email_column,p_routing_column,p_template,p_subject_column);
    update public.dataset_columns set standard_field=null where dataset_id=p_dataset_id and user_id=auth.uid() and standard_field='email_body';
  elsif p_source='spreadsheet' then
    if p_email_column is null or p_subject_column is null or p_body_column is null then raise exception 'Choose recipient email, subject and body columns.'; end if;
    if p_email_column=p_subject_column or p_email_column=p_body_column or p_subject_column=p_body_column then raise exception 'Email, subject and body must use different columns.'; end if;
    if (select count(*) from public.dataset_columns where id=any(array[p_email_column,p_subject_column,p_body_column]) and dataset_id=p_dataset_id and user_id=auth.uid())<>3 then raise exception 'Choose columns from this spreadsheet.'; end if;
    -- Clear these mappings together so swapping roles cannot erase a column.
    update public.dataset_columns set standard_field=null where dataset_id=p_dataset_id and user_id=auth.uid() and (standard_field in ('recipient_email','subject','email_body') or id=any(array[p_email_column,p_subject_column,p_body_column]));
    perform public.set_dataset_standard_mapping(p_dataset_id,p_email_column,'recipient_email');
    perform public.set_dataset_standard_mapping(p_dataset_id,p_subject_column,'subject');
    perform public.set_dataset_standard_mapping(p_dataset_id,p_body_column,'email_body');
    perform public.set_dataset_routing_column(p_dataset_id,null);
    update public.datasets set body_source='spreadsheet',body_column_id=p_body_column,spreadsheet_signature=coalesce(p_signature,true),subject_strategy='spreadsheet',fallback_template_id=null where id=p_dataset_id and user_id=auth.uid();
    delete from public.routing_rules where dataset_id=p_dataset_id and user_id=auth.uid();
    delete from public.dataset_placeholder_mappings where dataset_id=p_dataset_id and user_id=auth.uid();
    update public.dataset_rows set template_override_id=null where dataset_id=p_dataset_id and user_id=auth.uid();
  else raise exception 'Choose an email body source.';
  end if;
end $$;
revoke all on function public.save_spreadsheet_content_setup(uuid,uuid,uuid,uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.save_spreadsheet_content_setup(uuid,uuid,uuid,uuid,uuid,text,uuid,boolean) to authenticated;

create or replace function public.review_spreadsheet_rows(
  p_dataset_id uuid, p_search text default '', p_email_filter text default 'all',
  p_status text default 'all', p_group text default '', p_sort text default 'row_number',
  p_desc boolean default false, p_limit integer default 100, p_offset integer default 0
) returns setof jsonb language sql stable set search_path = public as $$
  with enriched as (
    select r.*, h.status as outreach_status, h.sent_at as last_sent_at, h.error_message as last_error,
      exists(select 1 from public.suppression_list s where s.user_id = auth.uid() and s.email_normalized = r.email_normalized) as suppressed,
      t.id as chosen_template_id, case when d.body_source='spreadsheet' then 'Spreadsheet body: '||coalesce(bc.original_label,'missing column') else t.name end as chosen_template_name, d.body_source as email_body_source
    from public.dataset_rows r
    join public.datasets d on d.id = r.dataset_id
    left join lateral (select eh.status, eh.sent_at, eh.error_message from public.email_history eh
      where eh.dataset_row_id = r.id and not eh.is_test and eh.status in ('sent','failed','simulated')
      order by eh.sent_at desc limit 1) h on true
    left join public.dataset_columns bc on bc.id=d.body_column_id
    left join public.routing_rules rule on rule.dataset_id = r.dataset_id and d.routing_column_id is not null
      and rule.normalized_value = lower(trim(regexp_replace(normalize(coalesce(r.routing_value,''), NFKC), '[[:space:]]+', ' ', 'g')))
    left join public.templates t on t.id = coalesce(r.template_override_id,
      case when rule.action = 'skip' then null when rule.action = 'template' then rule.template_id else d.fallback_template_id end)
      and t.is_active and not t.is_archived
    where r.dataset_id = p_dataset_id and r.user_id = auth.uid()
  ), filtered as (
    select * from enriched r
    where (coalesce(p_search,'') = '' or r.data::text ilike '%' || p_search || '%' or coalesce(r.recipient_email,'') ilike '%' || p_search || '%')
      and (p_email_filter = 'all' or (p_email_filter = 'valid' and r.email_valid) or (p_email_filter = 'missing' and coalesce(r.recipient_email,'') = '') or (p_email_filter = 'invalid' and coalesce(r.recipient_email,'') <> '' and not r.email_valid))
      and (coalesce(p_group,'') = '' or lower(trim(regexp_replace(normalize(coalesce(r.routing_value,''), NFKC), '[[:space:]]+', ' ', 'g'))) = lower(trim(regexp_replace(normalize(p_group, NFKC), '[[:space:]]+', ' ', 'g'))))
      and (p_status = 'all' or (p_status = 'not_sent' and r.outreach_status is null) or r.outreach_status = p_status
        or (p_status = 'suppressed' and r.suppressed) or (p_status = 'missing_template' and r.email_body_source='template' and r.chosen_template_id is null))
  )
  select to_jsonb(r) || jsonb_build_object('total_count', count(*) over()) from filtered r
  order by
    case when p_sort = 'row_number' and not p_desc then r.row_number end asc,
    case when p_sort = 'row_number' and p_desc then r.row_number end desc,
    case when not p_desc then lower(case p_sort when 'recipient_email' then r.recipient_email when 'routing_value' then r.routing_value when 'outreach_status' then coalesce(r.outreach_status,'not_sent') when 'last_sent_at' then r.last_sent_at::text when 'chosen_template_name' then r.chosen_template_name else r.data->>(case when p_sort like 'data:%' then substring(p_sort from 6) else p_sort end) end) end asc nulls last,
    case when p_desc then lower(case p_sort when 'recipient_email' then r.recipient_email when 'routing_value' then r.routing_value when 'outreach_status' then coalesce(r.outreach_status,'not_sent') when 'last_sent_at' then r.last_sent_at::text when 'chosen_template_name' then r.chosen_template_name else r.data->>(case when p_sort like 'data:%' then substring(p_sort from 6) else p_sort end) end) end desc nulls last,
    r.row_number
  limit least(greatest(p_limit,1),10000) offset greatest(p_offset,0);
$$;

create or replace function public.scheduler_create_batch_without_engagement(p_owner uuid,p_dataset uuid,p_time timestamptz,p_timezone text,p_live boolean,p_policy text,p_key uuid,p_items jsonb)
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
  select * into d from public.datasets where id=p_dataset and user_id=p_owner for share;
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
    if d.body_source='spreadsheet' and ((item->>'template_id') is not null or (item->>'content_key') is distinct from 'spreadsheet:'||d.id::text) then raise exception 'Spreadsheet body source changed. Review again.'; end if;
    if d.body_source='template' and (item->>'template_id') is null then raise exception 'Choose an email template.'; end if;
    if nullif(trim(item->>'subject'),'') is null or nullif(trim(item->>'html_body'),'') is null then raise exception 'Every email needs a subject and body.'; end if;
    if p_live and exists(select 1 from public.send_run_items si join public.send_runs sr on sr.id=si.send_run_id
      where si.user_id=p_owner and lower(trim(si.recipient_email))=lower(item->>'recipient_email') and coalesce(si.content_key,si.template_id::text)=coalesce(item->>'content_key',item->>'template_id')
      and sr.id<>r and sr.live_enabled and si.status in ('queued','sending')) then raise exception 'This recipient and email content are already queued or unconfirmed. Check Scheduled emails and Send history.'; end if;
    if p_policy='block_template_recipient' and (
      exists(select 1 from public.email_history where user_id=p_owner and lower(trim(recipient_email))=lower(item->>'recipient_email') and coalesce(content_key,template_id::text)=coalesce(item->>'content_key',item->>'template_id') and status='sent' and not is_test)
      or exists(select 1 from public.scheduled_mail_items where batch_id=b and lower(recipient_email)=lower(item->>'recipient_email') and coalesce(content_key,template_id::text)=coalesce(item->>'content_key',item->>'template_id'))
    ) then raise exception 'A duplicate was found. Review the recipients again.'; end if;
    ri:=gen_random_uuid();
    insert into public.send_run_items(id,user_id,send_run_id,dataset_row_id,recipient_email,template_id,resolved_subject,resolved_html_body,resolved_plain_text_body)
      values(ri,p_owner,r,(item->>'row_id')::uuid,item->>'recipient_email',(item->>'template_id')::uuid,item->>'subject',item->>'html_body',item->>'plain_text_body');
    insert into public.scheduled_mail_items(user_id,batch_id,send_run_item_id,dataset_row_id,recipient_email,template_id,template_name,subject,html_body,plain_text_body,next_attempt_at)
      values(p_owner,b,ri,(item->>'row_id')::uuid,item->>'recipient_email',(item->>'template_id')::uuid,item->>'template_name',item->>'subject',item->>'html_body',item->>'plain_text_body',p_time);
  end loop;
  return b;
end $$;

create or replace function public.scheduler_arm_item_without_engagement(p_item uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path = '' as $$
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
  elsif exists(select 1 from public.send_run_items si join public.send_runs sr on sr.id=si.send_run_id where si.user_id=i.user_id and si.id<>i.send_run_item_id and lower(trim(si.recipient_email))=lower(i.recipient_email) and coalesce(si.content_key,si.template_id::text)=coalesce(i.content_key,i.template_id::text) and si.status='sending' and sr.live_enabled) then why:='Skipped: another send to this recipient and email content has an unconfirmed outcome.';
  elsif b.duplicate_policy='block_template_recipient' and exists(select 1 from public.email_history where user_id=i.user_id and lower(trim(recipient_email))=lower(i.recipient_email) and coalesce(content_key,template_id::text)=coalesce(i.content_key,i.template_id::text) and status='sent' and not is_test) then why:='Skipped: this recipient already received this template or spreadsheet campaign.';
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

create or replace function public.send_recipient_protection(p_emails text[])
returns jsonb language sql stable set search_path = public as $$
select jsonb_build_object(
  'history',coalesce((select jsonb_agg(x) from(select distinct lower(trim(recipient_email)) recipient_email,template_id,content_key,status from public.email_history where user_id=auth.uid() and status='sent' and not is_test and lower(trim(recipient_email))=any(p_emails))x),'[]'::jsonb),
  'suppressed',coalesce((select jsonb_agg(email_normalized) from public.suppression_list where user_id=auth.uid() and email_normalized=any(p_emails)),'[]'::jsonb),
  'uncertain',coalesce((select jsonb_agg(x) from(select distinct lower(trim(recipient_email)) recipient_email,template_id,content_key from public.send_run_items where user_id=auth.uid() and status='sending' and lower(trim(recipient_email))=any(p_emails))x),'[]'::jsonb),
  'scheduled',coalesce((select jsonb_agg(x) from(select distinct lower(i.recipient_email) recipient_email,i.template_id,i.content_key from public.scheduled_mail_items i join public.scheduled_mail_batches b on b.id=i.batch_id where i.user_id=auth.uid() and b.live_enabled and b.status not in ('completed','completed_with_errors','cancelled') and i.status='pending' and lower(i.recipient_email)=any(p_emails))x),'[]'::jsonb)
);
$$;

create or replace function public.claim_send_run_item(p_item_id uuid,p_expected_attempts integer)
returns boolean language plpgsql set search_path = public as $$
declare owner_id uuid; recipient text; template uuid; content text;
begin
  select user_id,lower(trim(recipient_email)),template_id,content_key into owner_id,recipient,template,content from public.send_run_items where id=p_item_id and user_id=auth.uid();
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,15));
  if exists(select 1 from public.scheduled_mail_items i join public.scheduled_mail_batches b on b.id=i.batch_id where i.user_id=owner_id and b.live_enabled and lower(i.recipient_email)=recipient and coalesce(i.content_key,i.template_id::text)=coalesce(content,template::text)
    and (i.status in ('sending','uncertain') or (b.status not in ('completed','completed_with_errors','cancelled') and i.status='pending'))) then raise exception 'This recipient is reserved by Scheduled emails or has an unknown send outcome. Check Scheduled emails before continuing.'; end if;
  update public.send_run_items set status='sending',attempts=attempts+1,error_message=null,sent_at=null where id=p_item_id and user_id=auth.uid() and status in ('queued','failed') and attempts=p_expected_attempts
    and not exists(select 1 from public.send_runs where id=send_run_items.send_run_id and scheduled_batch_id is not null);
  return found;
end $$;

create or replace function public.engagement_prepare_send(p_item uuid,p_origin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.send_run_items%rowtype; r public.send_runs%rowtype; d public.datasets%rowtype; row0 public.dataset_rows%rowtype; cfg jsonb; secret text; url text; dest text;
begin
  select * into i from public.send_run_items where id=p_item for update;
  if not found then raise exception 'Email item not found.'; end if;
  select * into r from public.send_runs where id=i.send_run_id;
  cfg:=i.engagement_snapshot;
  if i.status<>'sending' or not r.live_enabled or r.is_test then raise exception 'Only a claimed real email can activate a link.'; end if;
  if cfg is null or coalesce((cfg->>'enabled')::boolean,false)=false then
    return jsonb_build_object('htmlBody',i.resolved_html_body,'plainTextBody',i.resolved_plain_text_body);
  end if;
  if exists(select 1 from public.admin_account_deletions where user_id=i.user_id) then raise exception 'Workspace unavailable.'; end if;
  if exists(select 1 from public.email_engagement_messages where send_run_item_id=i.id) then
    if exists(select 1 from public.email_engagement_messages where send_run_item_id=i.id and expires_at<=now()) then raise exception 'This saved engagement link expired. Create a new reviewed send instead of resuming this email.'; end if;
    return jsonb_build_object('htmlBody',i.resolved_html_body,'plainTextBody',i.resolved_plain_text_body);
  end if;
  if p_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' and p_origin !~ '^http://localhost:[0-9]+$' then raise exception 'Configure the public website URL before enabling engagement.'; end if;
  dest:=cfg->>'destination';
  if dest is null or length(dest)>2048 or dest !~ '^https://[^/@[:space:]]+\.[^/[:space:]]+' or dest ~ '[[:cntrl:]]' then raise exception 'Invalid engagement destination.'; end if;
  if position('https://autmail.invalid/engagement-preview' in i.resolved_html_body)=0 then raise exception 'The engagement button is missing. Review a new send.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(i.user_id::text,19));
  perform pg_advisory_xact_lock(190019);
  perform public.engagement_prune();
  if pg_database_size(current_database())>400::bigint*1024*1024 then raise exception 'Engagement preparation stopped to protect database capacity (400 MB safeguard). Ask the administrator to review database usage or start a new send without the engagement button.'; end if;
  if (select count(*) from public.email_engagement_messages where user_id=i.user_id)>=2000 or (select count(*) from public.email_engagement_messages)>=10000 then raise exception 'Engagement storage limit reached (2,000 messages per workspace; 10,000 per project). Clear older history or turn off the button for this send.'; end if;
  select * into d from public.datasets where id=r.dataset_id and user_id=i.user_id;
  select * into row0 from public.dataset_rows where id=i.dataset_row_id and user_id=i.user_id;
  if d.id is null or row0.id is null or octet_length(row0.data::text)+octet_length(row0.original_data::text)>16000 then raise exception 'Engagement needs a source row under 16 KB. Turn it off for this send.'; end if;
  secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); url:=p_origin||'/e/'||secret;
  insert into public.email_engagement_messages(user_id,send_run_item_id,dataset_id,dataset_row_id,campaign_id,dataset_name,template_name,recipient_email,subject,destination,row_data,original_data,token_hash)
    values(i.user_id,i.id,d.id,row0.id,r.id,d.name,coalesce(i.content_label,(select name from public.templates where id=i.template_id),'Deleted template'),i.recipient_email,i.resolved_subject,dest,row0.data,row0.original_data,encode(sha256(convert_to(secret,'UTF8')),'hex'));
  update public.send_run_items set resolved_html_body=replace(resolved_html_body,'https://autmail.invalid/engagement-preview',url),resolved_plain_text_body=replace(resolved_plain_text_body,'https://autmail.invalid/engagement-preview',url) where id=i.id returning * into i;
  update public.scheduled_mail_items set html_body=i.resolved_html_body,plain_text_body=i.resolved_plain_text_body where send_run_item_id=i.id;
  return jsonb_build_object('htmlBody',i.resolved_html_body,'plainTextBody',i.resolved_plain_text_body);
end $$;

-- Retain service-only access for background and engagement preparation functions.
revoke all on function public.scheduler_create_batch_without_engagement(uuid,uuid,timestamptz,text,boolean,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.scheduler_create_batch_without_engagement(uuid,uuid,timestamptz,text,boolean,text,uuid,jsonb) to service_role;
revoke all on function public.scheduler_arm_item_without_engagement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.scheduler_arm_item_without_engagement(uuid,uuid) to service_role;
revoke all on function public.engagement_prepare_send(uuid,text) from public,anon,authenticated;
grant execute on function public.engagement_prepare_send(uuid,text) to service_role;
revoke all on function public.validate_body_column(),public.stamp_email_content() from public,anon;
commit;
