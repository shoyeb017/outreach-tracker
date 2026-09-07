-- Consolidate sender identity into a fully dynamic signature.
-- Run once in Supabase SQL Editor for an existing installation.

begin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email)
  on conflict (id) do nothing;
  insert into public.user_preferences(user_id, live_sending_enabled)
  values (new.id, false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.validate_placeholder_mapping_column()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.dataset_columns c
    where c.id = new.column_id and c.dataset_id = new.dataset_id and c.user_id = new.user_id
  ) then
    raise exception 'Placeholder mapping column must belong to this dataset';
  end if;
  if new.placeholder = 'signature' then
    raise exception 'The signature placeholder cannot be mapped to a spreadsheet column';
  end if;
  return new;
end;
$$;

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
  delete from public.suppression_list where user_id = me;
  delete from public.user_preferences where user_id = me;
  update public.profiles set full_name = '', avatar_url = null, onboarding_completed = false where id = me;
  insert into public.user_preferences(user_id, live_sending_enabled) values(me, false) on conflict (user_id) do nothing;
end;
$$;

-- Preserve existing sender-profile content as ordinary, reorderable signature lines.
do $$
declare sender record;
begin
  if to_regclass('public.sender_profiles') is not null then
    for sender in execute 'select * from public.sender_profiles' loop
      if nullif(trim(sender.sender_name), '') is not null
        or nullif(trim(sender.designation), '') is not null
        or nullif(trim(sender.organization), '') is not null
        or nullif(trim(sender.sender_email), '') is not null
        or nullif(trim(sender.company_phone), '') is not null
        or nullif(trim(sender.mobile), '') is not null
        or nullif(trim(sender.website), '') is not null
        or nullif(trim(sender.company_address), '') is not null
        or nullif(trim(sender.location), '') is not null then
        update public.signature_fields set display_order = display_order + 10 where user_id = sender.user_id;
        insert into public.signature_fields(user_id, label, value, field_type, display_order, enabled, show_label, clickable, style_preference)
        values (sender.user_id, '', 'Best regards,', 'text', 0, true, false, false, '{}');
      end if;
      if nullif(trim(sender.sender_name), '') is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable,style_preference) values(sender.user_id,'',sender.sender_name,'text',1,true,false,false,'{"bold":true}'); end if;
      if nullif(trim(sender.designation), '') is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable) values(sender.user_id,'',sender.designation,'text',2,true,false,false); end if;
      if nullif(trim(sender.organization), '') is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable) values(sender.user_id,'',sender.organization,'text',3,true,false,false); end if;
      if nullif(trim(sender.sender_email), '') is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable) values(sender.user_id,'Email',sender.sender_email,'email',4,true,true,true); end if;
      if coalesce(nullif(trim(sender.company_phone), ''), nullif(trim(sender.mobile), '')) is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable) values(sender.user_id,'Phone',coalesce(nullif(trim(sender.company_phone), ''), nullif(trim(sender.mobile), '')),'phone',5,true,true,true); end if;
      if nullif(trim(sender.website), '') is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable) values(sender.user_id,'Website',sender.website,'url',6,true,true,true); end if;
      if nullif(trim(sender.company_address), '') is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable) values(sender.user_id,'',sender.company_address,'text',7,true,false,false); end if;
      if nullif(trim(sender.location), '') is not null then insert into public.signature_fields(user_id,label,value,field_type,display_order,enabled,show_label,clickable) values(sender.user_id,'',sender.location,'text',8,true,false,false); end if;
    end loop;
  end if;
end;
$$;

alter table public.signature_fields drop constraint if exists signature_fields_field_type_check;
update public.signature_fields set field_type = 'text' where field_type = 'location';
alter table public.signature_fields add constraint signature_fields_field_type_check check (field_type in ('text','email','phone','url','image'));

alter table public.profiles drop column if exists timezone;
alter table public.profiles drop column if exists location;
drop table if exists public.sender_profiles;

commit;
