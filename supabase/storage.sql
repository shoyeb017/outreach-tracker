-- Private original import storage. Run after schema.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imports', 'imports', false, 15728640, array['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists imports_select_own on storage.objects;
create policy imports_select_own on storage.objects for select to authenticated using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists imports_insert_own on storage.objects;
create policy imports_insert_own on storage.objects for insert to authenticated with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists imports_update_own on storage.objects;
create policy imports_update_own on storage.objects for update to authenticated using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists imports_delete_own on storage.objects;
create policy imports_delete_own on storage.objects for delete to authenticated using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
