-- Apply AFTER 20261019_history_followups.sql. Sends no emails.
-- History/schedule removal preserves send records and duplicate protections.
begin;
alter table public.email_history add column deleted_at timestamptz;
alter table public.scheduled_mail_batches add column deleted_at timestamptz;
create index history_visible_recent on public.email_history(user_id,sent_at desc,id) where deleted_at is null;
create index scheduled_visible_recent on public.scheduled_mail_batches(user_id,created_at desc) where deleted_at is null;

create function public.records_delete_selection(p_owner uuid,p_kind text,p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare expected integer; owned integer; removed integer;
begin
  if p_owner is null or p_kind is null or p_kind not in ('engagement','history','schedule') or coalesce(array_length(p_ids,1),0) not between 1 and 500 or array_position(p_ids,null) is not null then
    raise exception 'Choose 1–500 records to remove.';
  end if;
  -- Match scheduler and follow-up lock order; no check/delete race with a confirmation.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,15));
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,19));
  if exists(select 1 from public.admin_account_deletions where user_id=p_owner) then raise exception 'Workspace unavailable.'; end if;
  select count(distinct x) into expected from unnest(p_ids) x;
  if p_kind='engagement' then
    perform 1 from public.email_engagement_messages where user_id=p_owner and id=any(p_ids) order by id for update;
    select count(*) into owned from public.email_engagement_messages where user_id=p_owner and id=any(p_ids);
    if owned<>expected then raise exception 'Some selected records are unavailable. Refresh your selection.'; end if;
    if exists(select 1 from public.email_engagement_messages m join public.send_run_items i on i.id=m.send_run_item_id where m.user_id=p_owner and m.id=any(p_ids) and (m.status in ('pending','uncertain') or i.status in ('queued','sending'))) then
      raise exception 'Pending or unknown-outcome emails cannot be deleted. Cancel or resolve them first.';
    end if;
    delete from public.email_engagement_messages where user_id=p_owner and id=any(p_ids);
  elsif p_kind='history' then
    perform 1 from public.email_history where user_id=p_owner and id=any(p_ids) order by id for update;
    select count(*) into owned from public.email_history where user_id=p_owner and id=any(p_ids);
    if owned<>expected then raise exception 'Some selected records are unavailable. Refresh your selection.'; end if;
    if exists(select 1 from public.email_history h join public.send_run_items i on i.id=h.send_run_item_id where h.user_id=p_owner and h.id=any(p_ids) and i.status in ('queued','sending')) then
      raise exception 'A selected send is still pending or has an unknown outcome. Resolve it before removing its history.';
    end if;
    update public.email_history set deleted_at=now() where user_id=p_owner and id=any(p_ids) and deleted_at is null;
  else
    -- Worker functions lock items before their batch. Preserve that order.
    perform 1 from public.scheduled_mail_items where user_id=p_owner and batch_id=any(p_ids) order by id for update;
    perform 1 from public.scheduled_mail_batches where user_id=p_owner and id=any(p_ids) order by id for update;
    select count(*) into owned from public.scheduled_mail_batches where user_id=p_owner and id=any(p_ids);
    if owned<>expected then raise exception 'Some selected schedules are unavailable. Refresh your selection.'; end if;
    if exists(select 1 from public.scheduled_mail_batches where user_id=p_owner and id=any(p_ids) and status not in ('completed','completed_with_errors','cancelled'))
      or exists(select 1 from public.scheduled_mail_items where user_id=p_owner and batch_id=any(p_ids) and status in ('pending','sending','uncertain')) then
      raise exception 'Only finished schedules with no pending or unknown emails can be removed. Cancel or resolve them first.';
    end if;
    update public.scheduled_mail_batches set deleted_at=now() where user_id=p_owner and id=any(p_ids) and deleted_at is null;
  end if;
  get diagnostics removed=row_count;
  return jsonb_build_object('removed',removed,'retainedSafetyLogs',p_kind<>'engagement');
end $$;
revoke all on function public.records_delete_selection(uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.records_delete_selection(uuid,text,uuid[]) to service_role;

-- A deleted history entry cannot be reused through a stale follow-up selection.
alter function public.history_create_followup(uuid,uuid[],text,uuid) rename to history_create_followup_before_deletion;
revoke all on function public.history_create_followup_before_deletion(uuid,uuid[],text,uuid) from public,anon,authenticated,service_role;
create function public.history_create_followup(p_owner uuid,p_ids uuid[],p_name text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,19));
  if not exists(select 1 from public.email_history_followups where user_id=p_owner and request_key=p_key)
    and exists(select 1 from public.email_history where user_id=p_owner and id=any(p_ids) and deleted_at is not null) then
    raise exception 'Some selected history entries were removed. Refresh your selection.';
  end if;
  return public.history_create_followup_before_deletion(p_owner,p_ids,p_name,p_key);
end $$;
revoke all on function public.history_create_followup(uuid,uuid[],text,uuid) from public,anon,authenticated;
grant execute on function public.history_create_followup(uuid,uuid[],text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
