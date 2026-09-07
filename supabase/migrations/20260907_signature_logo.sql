-- Add reorderable, dynamically sized signature logos to an existing installation.
-- Safe to run after 20260907_dynamic_signature.sql.

begin;

alter table public.signature_fields drop constraint if exists signature_fields_field_type_check;
alter table public.signature_fields add constraint signature_fields_field_type_check
  check (field_type in ('text','email','phone','url','image'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signature-assets', 'signature-assets', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists signature_assets_insert_own on storage.objects;
create policy signature_assets_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists signature_assets_update_own on storage.objects;
create policy signature_assets_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists signature_assets_delete_own on storage.objects;
create policy signature_assets_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'signature-assets' and (storage.foldername(name))[1] = auth.uid()::text);

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

commit;
