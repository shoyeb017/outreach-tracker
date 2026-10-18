-- Apply AFTER 20261019_email_engagement.sql. This migration sends no email.
begin;
-- Capture every terminal scheduled outcome, including skips and cancellations.
-- Existing scheduler RPCs still own sending and uncertainty handling; this only saves history.
create function public.history_capture_scheduled_result() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.send_runs%rowtype;
begin
  select * into r from public.send_runs where id=new.send_run_id and scheduled_batch_id is not null;
  if not found then return new; end if;
  insert into public.email_history(user_id,dataset_id,dataset_row_id,send_run_id,send_run_item_id,template_id,recipient_email,subject,final_html_body,final_plain_text_body,sender_microsoft_email,status,error_message,is_test,sent_at)
    values(new.user_id,r.dataset_id,new.dataset_row_id,r.id,new.id,new.template_id,new.recipient_email,new.resolved_subject,new.resolved_html_body,new.resolved_plain_text_body,r.microsoft_email,new.status,new.error_message,r.is_test,coalesce(new.sent_at,now()))
    on conflict(send_run_item_id) do update set status=excluded.status,error_message=excluded.error_message,
      final_html_body=excluded.final_html_body,final_plain_text_body=excluded.final_plain_text_body,
      sender_microsoft_email=excluded.sender_microsoft_email,is_test=excluded.is_test,sent_at=excluded.sent_at;
  return new;
end $$;
revoke all on function public.history_capture_scheduled_result() from public,anon,authenticated;
create trigger history_capture_scheduled_result after update of status on public.send_run_items
  for each row when(new.status in ('sent','failed','skipped','cancelled','simulated')) execute function public.history_capture_scheduled_result();

-- Restore missing final results from older schedules without modifying existing history.
insert into public.email_history(user_id,dataset_id,dataset_row_id,send_run_id,send_run_item_id,template_id,recipient_email,subject,final_html_body,final_plain_text_body,sender_microsoft_email,status,error_message,is_test,sent_at)
  select i.user_id,r.dataset_id,i.dataset_row_id,r.id,i.id,i.template_id,i.recipient_email,i.resolved_subject,i.resolved_html_body,i.resolved_plain_text_body,r.microsoft_email,i.status,i.error_message,r.is_test,coalesce(i.sent_at,r.completed_at,i.created_at)
  from public.send_run_items i join public.send_runs r on r.id=i.send_run_id
  where r.scheduled_batch_id is not null and i.status in ('sent','failed','skipped','cancelled','simulated')
  on conflict(send_run_item_id) do nothing;

alter table public.datasets add column followup_source text check(followup_source is null or followup_source='history');
create table public.email_history_followups (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id,request_key)
);
alter table public.email_history_followups enable row level security;
revoke all on public.email_history_followups from public,anon,authenticated;
grant all on public.email_history_followups to service_role;

create function public.history_create_followup(p_owner uuid,p_ids uuid[],p_name text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result_id uuid; source_id uuid; source_count integer; email_slug text; m record;
  col public.dataset_columns%rowtype; mapping public.dataset_placeholder_mappings%rowtype;
  new_col uuid; cols jsonb:='{}'; seen text[]:='{}'; added integer:=0; omitted integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,19));
  if exists(select 1 from public.admin_account_deletions where user_id=p_owner) then raise exception 'Workspace unavailable.'; end if;
  if p_owner is null or p_key is null or coalesce(array_length(p_ids,1),0) not between 1 and 500 or p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise exception 'Select 1–500 emails and give the spreadsheet a name.';
  end if;
  select dataset_id into result_id from public.email_history_followups where user_id=p_owner and request_key=p_key;
  if found then return jsonb_build_object('id',result_id,'existing',true); end if;
  if pg_database_size(current_database())>=400*1024*1024 then
    raise exception 'Database storage is near the Free-plan safeguard. Ask the administrator to review storage before creating another follow-up.';
  end if;
  if (select count(*) from public.email_history h join public.dataset_rows r on r.id=h.dataset_row_id and r.user_id=p_owner
      where h.user_id=p_owner and h.id=any(p_ids) and not h.is_test and h.dataset_id=r.dataset_id)
      <> (select count(distinct x) from unnest(p_ids) x) or array_position(p_ids,null) is not null then
    raise exception 'Some selected emails are unavailable or are test emails. Refresh your selection.';
  end if;
  select count(distinct dataset_id) into source_count from public.email_history where user_id=p_owner and id=any(p_ids);
  if source_count<>1 then raise exception 'Choose emails from one source spreadsheet so its columns stay consistent.'; end if;
  select dataset_id into source_id from public.email_history where user_id=p_owner and id=any(p_ids) limit 1;
  -- Lock source schema against application-level deletion while copying it.
  perform 1 from public.datasets where id=source_id and user_id=p_owner for share;
  if not found then raise exception 'The source spreadsheet is no longer available.'; end if;
  select placeholder_slug into email_slug from public.dataset_columns where dataset_id=source_id and user_id=p_owner and standard_field='recipient_email';
  if email_slug is null then raise exception 'Choose the source spreadsheet recipient email column before creating a follow-up.'; end if;
  insert into public.datasets(user_id,name,source_file_name,source_sheet_name,subject_strategy,engagement_source_dataset_id,followup_source)
    values(p_owner,trim(p_name),'Email history follow-up','Follow-up','template',source_id,'history') returning id into result_id;
  update public.datasets set engagement_source_campaign_ids=(select array_agg(distinct send_run_id) from public.email_history where user_id=p_owner and id=any(p_ids)) where id=result_id;
  for col in select * from public.dataset_columns where dataset_id=source_id and user_id=p_owner order by display_order loop
    new_col:=gen_random_uuid(); cols:=cols||jsonb_build_object(col.id::text,new_col);
    insert into public.dataset_columns(id,user_id,dataset_id,original_label,placeholder_slug,standard_field,display_order,data_type)
      values(new_col,p_owner,result_id,col.original_label,col.placeholder_slug,col.standard_field,col.display_order,col.data_type);
  end loop;
  for mapping in select * from public.dataset_placeholder_mappings where dataset_id=source_id and user_id=p_owner loop
    insert into public.dataset_placeholder_mappings(user_id,dataset_id,placeholder,column_id)
      values(p_owner,result_id,mapping.placeholder,(cols->>mapping.column_id::text)::uuid);
  end loop;
  for m in select h.recipient_email,coalesce(e.row_data,r.data) row_data,coalesce(e.original_data,r.original_data) original_data
    from public.email_history h join public.dataset_rows r on r.id=h.dataset_row_id and r.user_id=p_owner
    left join public.email_engagement_messages e on e.send_run_item_id=h.send_run_item_id and e.user_id=p_owner
    where h.user_id=p_owner and h.id=any(p_ids) order by h.sent_at desc,h.id loop
    if trim(m.recipient_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or lower(trim(m.recipient_email))=any(seen) or exists(select 1 from public.suppression_list where user_id=p_owner and email_normalized=lower(trim(m.recipient_email))) then
      omitted:=omitted+1; continue;
    end if;
    seen:=array_append(seen,lower(trim(m.recipient_email))); added:=added+1;
    insert into public.dataset_rows(user_id,dataset_id,row_number,data,original_data,recipient_email,email_normalized,email_valid)
      values(p_owner,result_id,added,jsonb_set(m.row_data,array[email_slug],to_jsonb(m.recipient_email),true),m.original_data,m.recipient_email,lower(trim(m.recipient_email)),true);
  end loop;
  if added=0 then raise exception 'No eligible recipients remain after removing blocked and duplicate addresses.'; end if;
  update public.datasets set row_count=added,valid_email_count=added,missing_email_count=0,invalid_email_count=0 where id=result_id and user_id=p_owner;
  insert into public.email_history_followups(user_id,request_key,dataset_id) values(p_owner,p_key,result_id);
  return jsonb_build_object('id',result_id,'added',added,'omitted',omitted);
end $$;
revoke all on function public.history_create_followup(uuid,uuid[],text,uuid) from public,anon,authenticated;
grant execute on function public.history_create_followup(uuid,uuid[],text,uuid) to service_role;

-- Follow-up records also disappear during normal owner-scoped data deletion.
create or replace function public.engagement_clear_preferences() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.email_history_followups where user_id=old.user_id;
  delete from public.email_engagement_settings where user_id=old.user_id;
  delete from public.email_engagement_messages where user_id=old.user_id;
  delete from public.email_engagement_followups where user_id=old.user_id;
  return old;
end $$;
notify pgrst, 'reload schema';
commit;
