-- Guided spreadsheet setup and recipient review. Run in Supabase SQL Editor.
begin;

-- Freeze sending mode for each run. Existing unknown modes stay NULL and cannot be resumed automatically.
alter table public.send_runs add column if not exists live_enabled boolean;

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
  update public.datasets set fallback_template_id = p_template, subject_strategy = case when p_subject_column is null then 'template' else 'spreadsheet_fallback' end where id = p_dataset_id and user_id = auth.uid();
  if old_column is distinct from p_routing_column or p_routing_column is null then
    delete from public.routing_rules where dataset_id = p_dataset_id and user_id = auth.uid();
  end if;
  if p_subject_column is null then update public.dataset_rows set subject_value = null where dataset_id = p_dataset_id and user_id = auth.uid(); end if;
end;
$$;
revoke execute on function public.save_spreadsheet_setup(uuid,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.save_spreadsheet_setup(uuid,uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.review_spreadsheet_rows(
  p_dataset_id uuid, p_search text default '', p_email_filter text default 'all',
  p_status text default 'all', p_group text default '', p_sort text default 'row_number',
  p_desc boolean default false, p_limit integer default 100, p_offset integer default 0
) returns setof jsonb language sql stable set search_path = public as $$
  with enriched as (
    select r.*, h.status as outreach_status, h.sent_at as last_sent_at, h.error_message as last_error,
      exists(select 1 from public.suppression_list s where s.user_id = auth.uid() and s.email_normalized = r.email_normalized) as suppressed,
      t.id as chosen_template_id, t.name as chosen_template_name
    from public.dataset_rows r
    join public.datasets d on d.id = r.dataset_id
    left join lateral (select eh.status, eh.sent_at, eh.error_message from public.email_history eh
      where eh.dataset_row_id = r.id and not eh.is_test and eh.status in ('sent','failed','simulated')
      order by eh.sent_at desc limit 1) h on true
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
        or (p_status = 'suppressed' and r.suppressed) or (p_status = 'missing_template' and r.chosen_template_id is null))
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
revoke execute on function public.review_spreadsheet_rows(uuid,text,text,text,text,text,boolean,integer,integer) from public, anon;
grant execute on function public.review_spreadsheet_rows(uuid,text,text,text,text,text,boolean,integer,integer) to authenticated;


-- Save dependent choices together, so a failed request cannot leave a half-saved setup.
create or replace function public.save_email_choices(p_dataset_id uuid, p_default uuid, p_rules jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.datasets where id = p_dataset_id and user_id = auth.uid()) then raise exception 'Spreadsheet not found'; end if;
  update public.datasets set fallback_template_id = p_default where id = p_dataset_id and user_id = auth.uid();
  delete from public.routing_rules where dataset_id = p_dataset_id and user_id = auth.uid();
  insert into public.routing_rules(user_id,dataset_id,routing_value,normalized_value,action,template_id)
  select auth.uid(), p_dataset_id, value->>'routing_value', value->>'normalized_value',
    value->>'action', nullif(value->>'template_id','')::uuid from jsonb_array_elements(p_rules);
end;
$$;
revoke execute on function public.save_email_choices(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_email_choices(uuid,uuid,jsonb) to authenticated;

create or replace function public.save_personalization(p_dataset_id uuid, p_mappings jsonb)
returns void language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.datasets where id = p_dataset_id and user_id = auth.uid()) then raise exception 'Spreadsheet not found'; end if;
  delete from public.dataset_placeholder_mappings where dataset_id = p_dataset_id and user_id = auth.uid();
  insert into public.dataset_placeholder_mappings(user_id,dataset_id,placeholder,column_id)
  select auth.uid(), p_dataset_id, value->>'placeholder', (value->>'column_id')::uuid from jsonb_array_elements(p_mappings);
  update public.datasets set updated_at = now() where id = p_dataset_id and user_id = auth.uid();
end;
$$;
revoke execute on function public.save_personalization(uuid,jsonb) from public, anon;
grant execute on function public.save_personalization(uuid,jsonb) to authenticated;


-- Read current protections in one request, without truncating large history or address lists.
create or replace function public.send_recipient_protection(p_emails text[])
returns jsonb language sql stable set search_path = public as $$
select jsonb_build_object(
  'history', coalesce((select jsonb_agg(x) from (
    select distinct lower(trim(recipient_email)) as recipient_email, template_id, status
    from public.email_history where user_id = auth.uid() and status = 'sent' and not is_test
      and lower(trim(recipient_email)) = any(p_emails)
  ) x), '[]'::jsonb),
  'suppressed', coalesce((select jsonb_agg(email_normalized) from public.suppression_list
    where user_id = auth.uid() and email_normalized = any(p_emails)), '[]'::jsonb),
  'uncertain', coalesce((select jsonb_agg(x) from (
    select distinct lower(trim(recipient_email)) as recipient_email, template_id
    from public.send_run_items where user_id = auth.uid() and status = 'sending'
      and lower(trim(recipient_email)) = any(p_emails)
  ) x), '[]'::jsonb)
);
$$;
revoke execute on function public.send_recipient_protection(text[]) from public, anon;
grant execute on function public.send_recipient_protection(text[]) to authenticated;


-- Compare-and-set prevents two browser tabs from sending the same saved item.
create or replace function public.claim_send_run_item(p_item_id uuid, p_expected_attempts integer)
returns boolean language plpgsql set search_path = public as $$
begin
  update public.send_run_items set status = 'sending', attempts = attempts + 1, error_message = null, sent_at = null
    where id = p_item_id and user_id = auth.uid()
      and status in ('queued','failed') and attempts = p_expected_attempts;
  return found;
end;
$$;
revoke execute on function public.claim_send_run_item(uuid,integer) from public, anon;
grant execute on function public.claim_send_run_item(uuid,integer) to authenticated;

create or replace function public.set_dataset_standard_mapping(p_dataset_id uuid, p_column_id uuid, p_standard_field text)
returns void language plpgsql set search_path = public as $$
declare email_slug text; subject_slug text;
begin
  if p_standard_field is not null then update public.dataset_columns set standard_field = null where dataset_id = p_dataset_id and standard_field = p_standard_field and id <> p_column_id and user_id = auth.uid(); end if;
  update public.dataset_columns set standard_field = p_standard_field where id = p_column_id and dataset_id = p_dataset_id and user_id = auth.uid();
  if not found then raise exception 'Column not found'; end if;
  select placeholder_slug into email_slug from public.dataset_columns where dataset_id = p_dataset_id and standard_field = 'recipient_email';
  select placeholder_slug into subject_slug from public.dataset_columns where dataset_id = p_dataset_id and standard_field = 'subject';
  update public.dataset_rows set
    recipient_email = case when email_slug is null then null else nullif(lower(trim(data->>email_slug)),'') end,
    email_normalized = case when email_slug is null then null else nullif(lower(trim(data->>email_slug)),'') end,
    email_valid = case when email_slug is null then false else length(coalesce(trim(data->>email_slug),'')) <= 254 and coalesce(lower(trim(data->>email_slug)),'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' end,
    subject_value = case when subject_slug is null then null else nullif(trim(data->>subject_slug),'') end
  where dataset_id = p_dataset_id and user_id = auth.uid();
  perform public.refresh_dataset_counts(p_dataset_id);
end;
$$;

create or replace function public.update_dataset_row_data(p_row_id uuid, p_data jsonb)
returns void language plpgsql set search_path = public as $$
declare row_dataset uuid; email_slug text; subject_slug text; routing_slug text;
begin
  select dataset_id into row_dataset from public.dataset_rows where id = p_row_id and user_id = auth.uid(); if row_dataset is null then raise exception 'Row not found'; end if;
  select placeholder_slug into email_slug from public.dataset_columns where dataset_id = row_dataset and standard_field = 'recipient_email';
  select placeholder_slug into subject_slug from public.dataset_columns where dataset_id = row_dataset and standard_field = 'subject';
  select c.placeholder_slug into routing_slug from public.datasets d join public.dataset_columns c on c.id = d.routing_column_id where d.id = row_dataset;
  update public.dataset_rows set data = p_data,
    recipient_email = case when email_slug is null then null else nullif(lower(trim(p_data->>email_slug)),'') end,
    email_normalized = case when email_slug is null then null else nullif(lower(trim(p_data->>email_slug)),'') end,
    email_valid = case when email_slug is null then false else length(coalesce(trim(p_data->>email_slug),'')) <= 254 and coalesce(lower(trim(p_data->>email_slug)),'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' end,
    subject_value = case when subject_slug is null then null else nullif(trim(p_data->>subject_slug),'') end,
    routing_value = case when routing_slug is null then null else nullif(trim(p_data->>routing_slug),'') end
  where id = p_row_id and user_id = auth.uid();
  perform public.refresh_dataset_counts(row_dataset);
end;
$$;


commit;
