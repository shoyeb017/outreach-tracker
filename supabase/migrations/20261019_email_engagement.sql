-- Apply after schema.sql, admin-controls, scheduled-mail and scheduled-test-mail.
-- This migration sends no email. New-message insertion and activity collection are separate controls.
begin;
create table public.email_engagement_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false, collection_enabled boolean not null default true,
  destination text not null default '', intro text not null default 'Explore how we can help your business.',
  button_text text not null default 'Visit our website', button_color text not null default '#174579', text_color text not null default '#ffffff',
  alignment text not null default 'left' check(alignment in ('left','center','right')),
  size text not null default 'medium' check(size in ('small','medium','large')),
  placement text not null default 'before_signature' check(placement in ('before_signature','after_signature')),
  updated_at timestamptz not null default now(),
  check(length(destination)<=2048 and length(intro)<=600 and length(button_text) between 1 and 80),
  check(button_color ~ '^#[0-9a-fA-F]{6}$' and text_color ~ '^#[0-9a-fA-F]{6}$'),
  check(not enabled or destination ~ '^https://[^/@[:space:]]+\.[^/[:space:]]+'),
  check(not enabled or length(trim(button_text))>0)
);
alter table public.send_run_items add column engagement_snapshot jsonb;
alter table public.scheduled_mail_items add column engagement_snapshot jsonb;
alter table public.send_run_items add constraint engagement_snapshot_size check(engagement_snapshot is null or (jsonb_typeof(engagement_snapshot)='object' and octet_length(engagement_snapshot::text)<=8000));
create table public.email_engagement_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  send_run_item_id uuid not null unique references public.send_run_items(id) on delete cascade,
  dataset_id uuid references public.datasets(id) on delete cascade, dataset_row_id uuid references public.dataset_rows(id) on delete cascade,
  campaign_id uuid not null, dataset_name text not null, template_name text not null,
  recipient_email text not null, subject text not null, destination text not null,
  row_data jsonb not null, original_data jsonb not null,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check(status in ('pending','accepted','failed','uncertain','cancelled')),
  accepted_at timestamptz, first_activity_at timestamptz, last_activity_at timestamptz,
  activity_count integer not null default 0, suspected_count integer not null default 0, last_suspected_at timestamptz,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days'
);
create index engagement_owner_recent on public.email_engagement_messages(user_id,created_at desc,id);
create index engagement_expiry on public.email_engagement_messages(expires_at);
create table public.email_engagement_followups (
  user_id uuid not null references auth.users(id) on delete cascade, request_key uuid not null,
  dataset_id uuid not null references public.datasets(id) on delete cascade, created_at timestamptz not null default now(), primary key(user_id,request_key)
);
alter table public.datasets add column engagement_source_dataset_id uuid references public.datasets(id) on delete set null;
alter table public.datasets add column engagement_source_campaign_ids uuid[];
alter table public.datasets add constraint engagement_source_not_self check(engagement_source_dataset_id is null or engagement_source_dataset_id<>id);
create trigger engagement_source_owner_guard before insert or update on public.datasets for each row
  when(new.engagement_source_dataset_id is not null) execute function public.enforce_same_owner('datasets','engagement_source_dataset_id');
alter table public.email_engagement_settings enable row level security;
alter table public.email_engagement_messages enable row level security;
alter table public.email_engagement_followups enable row level security;
revoke all on public.email_engagement_settings,public.email_engagement_messages,public.email_engagement_followups from public,anon,authenticated;
grant all on public.email_engagement_settings,public.email_engagement_messages,public.email_engagement_followups to service_role;
create trigger engagement_settings_freeze before insert or update on public.email_engagement_settings for each row execute function public.guard_deleting_workspace();

create function public.engagement_prepare_send(p_item uuid,p_origin text) returns jsonb
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
    values(i.user_id,i.id,d.id,row0.id,r.id,d.name,coalesce((select name from public.templates where id=i.template_id),'Deleted template'),i.recipient_email,i.resolved_subject,dest,row0.data,row0.original_data,encode(sha256(convert_to(secret,'UTF8')),'hex'));
  update public.send_run_items set resolved_html_body=replace(resolved_html_body,'https://autmail.invalid/engagement-preview',url),resolved_plain_text_body=replace(resolved_plain_text_body,'https://autmail.invalid/engagement-preview',url) where id=i.id returning * into i;
  update public.scheduled_mail_items set html_body=i.resolved_html_body,plain_text_body=i.resolved_plain_text_body where send_run_item_id=i.id;
  return jsonb_build_object('htmlBody',i.resolved_html_body,'plainTextBody',i.resolved_plain_text_body);
end $$;
create function public.engagement_sync_outcome() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    update public.email_engagement_messages set
      status=case new.status when 'sent' then 'accepted' when 'failed' then 'failed' when 'cancelled' then 'cancelled' when 'sending' then 'uncertain' else status end,
      accepted_at=case when new.status='sent' then coalesce(accepted_at,new.sent_at,now()) else accepted_at end where send_run_item_id=new.id;
  end if;
  return new;
end $$;
create trigger engagement_outcome after update of status on public.send_run_items for each row execute function public.engagement_sync_outcome();

-- Bounded counter updates, not an unlimited event log. No visitor IP or raw user-agent is stored.
create function public.engagement_visit(p_hash text,p_kind text,p_viewer uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare m public.email_engagement_messages%rowtype; collecting boolean;
begin
  select * into m from public.email_engagement_messages where token_hash=p_hash;
  if not found or m.expires_at<=now() then return null; end if;
  select collection_enabled into collecting from public.email_engagement_settings where user_id=m.user_id;
  if m.status='accepted' and p_viewer is distinct from m.user_id and coalesce(collecting,false) and p_kind in ('visit','suspected') then
    if p_kind='suspected' or m.accepted_at>now()-interval '10 seconds' then
      update public.email_engagement_messages set suspected_count=least(10000,suspected_count+1),last_suspected_at=now()
        where id=m.id and (last_suspected_at is null or last_suspected_at<now()-interval '1 minute');
    else
      update public.email_engagement_messages set activity_count=least(10000,activity_count+1),first_activity_at=coalesce(first_activity_at,now()),last_activity_at=now()
        where id=m.id and (last_activity_at is null or last_activity_at<now()-interval '1 minute');
    end if;
  end if;
  return m.destination;
end $$;

-- Wrapper preserves every existing scheduler safety check and freezes the reviewed settings atomically.
-- An old deployed worker must not send an engagement-preview URL during a rolling deployment.
alter function public.scheduler_arm_item(uuid,uuid) rename to scheduler_arm_item_without_engagement;
create function public.scheduler_arm_item(p_item uuid,p_lease uuid,p_engagement_capable boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare i public.scheduled_mail_items%rowtype;
begin
  select * into i from public.scheduled_mail_items where id=p_item;
  if coalesce((i.engagement_snapshot->>'enabled')::boolean,false) and not p_engagement_capable then
    perform public.scheduler_hold_batch(i.batch_id,p_lease,'needs_attention','The scheduler worker needs the email-engagement update. Redeploy scheduled-mail-worker, then review and reschedule. No email was attempted.');
    return false;
  end if;
  return public.scheduler_arm_item_without_engagement(p_item,p_lease);
end $$;
revoke all on function public.scheduler_arm_item(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.scheduler_arm_item(uuid,uuid,boolean) to service_role;
alter function public.scheduler_create_batch(uuid,uuid,timestamptz,text,boolean,text,uuid,jsonb) rename to scheduler_create_batch_without_engagement;
create function public.scheduler_create_batch(p_owner uuid,p_dataset uuid,p_time timestamptz,p_timezone text,p_live boolean,p_policy text,p_key uuid,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid; item jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,15));
  select id into b from public.scheduled_mail_batches where user_id=p_owner and request_key=p_key;
  if found then return b; end if;
  b:=public.scheduler_create_batch_without_engagement(p_owner,p_dataset,p_time,p_timezone,p_live,p_policy,p_key,p_items);
  for item in select value from jsonb_array_elements(p_items) loop
    update public.send_run_items set engagement_snapshot=item->'engagement_snapshot' where send_run_id=(select send_run_id from public.scheduled_mail_batches where id=b) and dataset_row_id=(item->>'row_id')::uuid;
    update public.scheduled_mail_items set engagement_snapshot=item->'engagement_snapshot' where batch_id=b and dataset_row_id=(item->>'row_id')::uuid;
  end loop;
  return b;
end $$;

create function public.engagement_create_followup(p_owner uuid,p_ids uuid[],p_name text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result_id uuid; source_id uuid; source_count integer; email_slug text; m public.email_engagement_messages%rowtype; col public.dataset_columns%rowtype; mapping public.dataset_placeholder_mappings%rowtype; new_col uuid; cols jsonb:='{}'; seen text[]:='{}'; added integer:=0; omitted integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,19));
  select dataset_id into result_id from public.email_engagement_followups where user_id=p_owner and request_key=p_key;
  if found then return jsonb_build_object('id',result_id,'existing',true); end if;
  if exists(select 1 from public.admin_account_deletions where user_id=p_owner) then raise exception 'Workspace unavailable.'; end if;
  if coalesce(array_length(p_ids,1),0) not between 1 and 500 or length(trim(p_name)) not between 1 and 120 then raise exception 'Select 1–500 messages and give the spreadsheet a name.'; end if;
  if (select count(*) from public.email_engagement_messages where user_id=p_owner and id=any(p_ids) and status='accepted' and expires_at>now())<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'Some selected messages are unavailable. Refresh your selection.'; end if;
  select count(distinct dataset_id) into source_count from public.email_engagement_messages where user_id=p_owner and id=any(p_ids);
  if source_count<>1 or exists(select 1 from public.email_engagement_messages where user_id=p_owner and id=any(p_ids) and dataset_id is null) then raise exception 'Choose messages from one source spreadsheet so its column mappings stay consistent.'; end if;
  select dataset_id into source_id from public.email_engagement_messages where user_id=p_owner and id=any(p_ids) limit 1;
  select placeholder_slug into email_slug from public.dataset_columns where dataset_id=source_id and user_id=p_owner and standard_field='recipient_email';
  if email_slug is null then raise exception 'Choose the source spreadsheet recipient email column before creating a follow-up.'; end if;
  insert into public.datasets(user_id,name,source_file_name,source_sheet_name,subject_strategy,engagement_source_dataset_id)
    values(p_owner,trim(p_name),'Email engagement follow-up','Follow-up','template',source_id) returning id into result_id;
  update public.datasets set engagement_source_campaign_ids=(select array_agg(distinct campaign_id) from public.email_engagement_messages where user_id=p_owner and id=any(p_ids)) where id=result_id;
  for col in select * from public.dataset_columns where dataset_id=source_id and user_id=p_owner order by display_order loop
    new_col:=gen_random_uuid(); cols:=cols||jsonb_build_object(col.id::text,new_col);
    insert into public.dataset_columns(id,user_id,dataset_id,original_label,placeholder_slug,standard_field,display_order,data_type)
      values(new_col,p_owner,result_id,col.original_label,col.placeholder_slug,col.standard_field,col.display_order,col.data_type);
  end loop;
  for mapping in select * from public.dataset_placeholder_mappings where dataset_id=source_id and user_id=p_owner loop
    insert into public.dataset_placeholder_mappings(user_id,dataset_id,placeholder,column_id) values(p_owner,result_id,mapping.placeholder,(cols->>mapping.column_id::text)::uuid);
  end loop;
  for m in select * from public.email_engagement_messages where user_id=p_owner and id=any(p_ids) order by created_at desc,id loop
    if lower(trim(m.recipient_email))=any(seen) or exists(select 1 from public.suppression_list where user_id=p_owner and email_normalized=lower(trim(m.recipient_email))) then omitted:=omitted+1; continue; end if;
    seen:=array_append(seen,lower(trim(m.recipient_email))); added:=added+1;
    insert into public.dataset_rows(user_id,dataset_id,row_number,data,original_data,recipient_email,email_normalized,email_valid)
      values(p_owner,result_id,added,jsonb_set(m.row_data,array[email_slug],to_jsonb(m.recipient_email),true),m.original_data,m.recipient_email,lower(trim(m.recipient_email)),true);
  end loop;
  if added=0 then raise exception 'No eligible recipients remain after removing blocked and duplicate addresses.'; end if;
  update public.datasets set row_count=added,valid_email_count=added,missing_email_count=0,invalid_email_count=0 where id=result_id and user_id=p_owner;
  insert into public.email_engagement_followups(user_id,request_key,dataset_id) values(p_owner,p_key,result_id);
  return jsonb_build_object('id',result_id,'added',added,'omitted',omitted);
end $$;
create function public.engagement_prune() returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  delete from public.email_engagement_messages where id in (select id from public.email_engagement_messages where expires_at<now() order by expires_at limit 1000);
  get diagnostics removed=row_count; return removed;
end $$;
create function public.engagement_sources(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'collectionEnabled',coalesce((select collection_enabled from public.email_engagement_settings where user_id=p_owner),true),
    'sources',coalesce((select jsonb_agg(s) from (select dataset_id id,max(dataset_name) name from public.email_engagement_messages where user_id=p_owner and expires_at>now() group by dataset_id order by max(created_at) desc limit 1000) s),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(c) from (select campaign_id id,dataset_id,max(dataset_name) name,min(created_at) created_at from public.email_engagement_messages where user_id=p_owner and expires_at>now() group by campaign_id,dataset_id order by min(created_at) desc limit 1000) c),'[]'::jsonb));
$$;
-- Existing "delete all my data" removes queues before preferences. Clear server-only settings then too.
create function public.engagement_clear_preferences() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.email_engagement_settings where user_id=old.user_id;
  delete from public.email_engagement_messages where user_id=old.user_id;
  delete from public.email_engagement_followups where user_id=old.user_id;
  return old;
end $$;
create trigger engagement_clear_preferences after delete on public.user_preferences for each row execute function public.engagement_clear_preferences();
revoke all on function public.engagement_sources(uuid),public.engagement_clear_preferences() from public,anon,authenticated;
grant execute on function public.engagement_sources(uuid) to service_role;
revoke all on function public.engagement_prepare_send(uuid,text),public.engagement_sync_outcome(),public.engagement_visit(text,text,uuid),public.engagement_create_followup(uuid,uuid[],text,uuid),public.engagement_prune(),public.scheduler_create_batch(uuid,uuid,timestamptz,text,boolean,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.engagement_prepare_send(uuid,text),public.engagement_visit(text,text,uuid),public.engagement_create_followup(uuid,uuid[],text,uuid),public.engagement_prune(),public.scheduler_create_batch(uuid,uuid,timestamptz,text,boolean,text,uuid,jsonb) to service_role;
commit;
