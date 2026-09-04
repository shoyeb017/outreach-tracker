-- Mail Automation Studio: PostgreSQL schema, ownership, RLS, and browser-safe helpers.
-- Run in a new Supabase project's SQL editor as the project owner.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = timezone('utc', now()); return new; end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  avatar_url text,
  timezone text not null default 'UTC',
  location text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sender_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  sender_name text not null default '',
  designation text,
  organization text,
  company_phone text,
  mobile text,
  sender_email text,
  location text,
  company_address text,
  website text,
  signature_preset text not null default 'professional' check (signature_preset in ('minimal','professional','compact','detailed','custom')),
  signature_settings jsonb not null default '{"boldName":true,"showLabels":true}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.signature_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  value text not null default '',
  field_type text not null default 'text' check (field_type in ('text','email','phone','url','location')),
  display_order integer not null default 0,
  enabled boolean not null default true,
  show_label boolean not null default true,
  clickable boolean not null default false,
  url text,
  style_preference jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.microsoft_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tenant_id text not null,
  client_id text not null,
  expected_email text,
  connected_email text,
  connection_status text not null default 'not_connected' check (connection_status in ('not_connected','connected','permission_required','error')),
  last_connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  seed_key text unique,
  name text not null,
  description text,
  category text,
  subject_template text not null default '',
  html_body text not null default '',
  plain_text_body text,
  signature_behavior text not null default 'token_only' check (signature_behavior in ('append','token_only','none')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint templates_system_owner_check check ((is_system and user_id is null) or (not is_system and user_id is not null))
);

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_file_name text,
  source_sheet_name text,
  row_count integer not null default 0 check (row_count >= 0),
  valid_email_count integer not null default 0 check (valid_email_count >= 0),
  missing_email_count integer not null default 0 check (missing_email_count >= 0),
  invalid_email_count integer not null default 0 check (invalid_email_count >= 0),
  routing_column_id uuid,
  fallback_template_id uuid references public.templates(id) on delete set null,
  subject_strategy text not null default 'spreadsheet_fallback' check (subject_strategy in ('template','spreadsheet','spreadsheet_fallback')),
  original_file_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dataset_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  original_label text not null,
  placeholder_slug text not null,
  standard_field text,
  display_order integer not null default 0,
  data_type text not null default 'text',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (dataset_id, placeholder_slug)
);

do $$ begin
  alter table public.datasets add constraint datasets_routing_column_id_fkey foreign key (routing_column_id) references public.dataset_columns(id) on delete set null;
exception when duplicate_object then null; end $$;

create unique index if not exists dataset_columns_one_standard_concept_idx on public.dataset_columns(dataset_id, standard_field) where standard_field is not null;

create table if not exists public.dataset_placeholder_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  placeholder text not null check (placeholder ~ '^[a-zA-Z0-9_.-]+$'),
  column_id uuid not null references public.dataset_columns(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (dataset_id, placeholder)
);

create index if not exists dataset_placeholder_mappings_dataset_idx on public.dataset_placeholder_mappings(dataset_id);

create table if not exists public.dataset_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  row_number integer not null,
  original_data jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  recipient_email text,
  email_normalized text,
  email_valid boolean not null default false,
  routing_value text,
  subject_value text,
  template_override_id uuid references public.templates(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (dataset_id, row_number)
);

create table if not exists public.column_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_columns jsonb not null default '[]'::jsonb,
  mappings jsonb not null default '{}'::jsonb,
  routing_key_label text,
  routing_rules jsonb not null default '{}'::jsonb,
  subject_strategy text not null default 'spreadsheet_fallback' check (subject_strategy in ('template','spreadsheet','spreadsheet_fallback')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  version_number integer not null,
  name text not null,
  description text,
  category text,
  subject_template text not null,
  html_body text not null,
  plain_text_body text,
  signature_behavior text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (template_id, version_number)
);

create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  routing_value text not null,
  normalized_value text not null,
  template_id uuid references public.templates(id) on delete set null,
  action text not null default 'template' check (action in ('template','fallback','skip')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (dataset_id, normalized_value)
);

create table if not exists public.send_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','paused','completed','cancelled')),
  selected_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  is_test boolean not null default false,
  microsoft_email text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.send_run_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  send_run_id uuid not null references public.send_runs(id) on delete cascade,
  dataset_row_id uuid not null references public.dataset_rows(id) on delete cascade,
  recipient_email text not null,
  template_id uuid references public.templates(id) on delete set null,
  resolved_subject text not null default '',
  resolved_html_body text not null default '',
  resolved_plain_text_body text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped','cancelled','simulated')),
  attempts integer not null default 0,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (send_run_id, dataset_row_id)
);

create table if not exists public.email_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  dataset_row_id uuid not null references public.dataset_rows(id) on delete cascade,
  send_run_id uuid not null references public.send_runs(id) on delete cascade,
  send_run_item_id uuid not null unique references public.send_run_items(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  company_name text,
  subject text not null,
  final_html_body text not null,
  final_plain_text_body text,
  sender_microsoft_email text,
  status text not null check (status in ('sent','failed','skipped','cancelled','simulated')),
  error_message text,
  is_test boolean not null default false,
  sent_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  email_normalized text not null,
  reason text not null default 'Manually suppressed',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, email_normalized)
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  live_sending_enabled boolean not null default false,
  send_concurrency integer not null default 1 check (send_concurrency between 1 and 3),
  delay_between_sends_ms integer not null default 1000 check (delay_between_sends_ms between 0 and 60000),
  duplicate_policy text not null default 'block_template_recipient' check (duplicate_policy in ('warn','block_template_recipient','allow')),
  default_subject_strategy text not null default 'spreadsheet_fallback' check (default_subject_strategy in ('template','spreadsheet','spreadsheet_fallback')),
  default_signature boolean not null default true,
  send_test_recipient text,
  live_send_confirmation boolean not null default true,
  keep_original_file boolean not null default false,
  appearance jsonb not null default '{"theme":"system"}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists signature_fields_user_order_idx on public.signature_fields(user_id, display_order);
create index if not exists datasets_user_created_idx on public.datasets(user_id, created_at desc);
create index if not exists dataset_columns_dataset_order_idx on public.dataset_columns(dataset_id, display_order);
create index if not exists dataset_rows_dataset_row_idx on public.dataset_rows(dataset_id, row_number);
create index if not exists dataset_rows_email_idx on public.dataset_rows(user_id, email_normalized);
create index if not exists dataset_rows_routing_idx on public.dataset_rows(dataset_id, routing_value);
create index if not exists templates_user_status_idx on public.templates(user_id, is_archived, is_active);
create index if not exists templates_category_idx on public.templates(lower(category));
create index if not exists send_runs_user_created_idx on public.send_runs(user_id, created_at desc);
create index if not exists send_run_items_run_status_idx on public.send_run_items(send_run_id, status);
create index if not exists history_user_sent_idx on public.email_history(user_id, sent_at desc);
create index if not exists history_recipient_template_idx on public.email_history(user_id, lower(recipient_email), template_id, status);

do $$ declare t text; begin
  foreach t in array array['profiles','sender_profiles','signature_fields','microsoft_integrations','templates','datasets','dataset_columns','dataset_placeholder_mappings','dataset_rows','column_mapping_profiles','template_versions','routing_rules','send_runs','send_run_items','email_history','suppression_list','user_preferences'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Profiles use their auth user UUID directly.
drop policy if exists profiles_select_own on public.profiles; create policy profiles_select_own on public.profiles for select using (id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles; create policy profiles_insert_own on public.profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles; create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_delete_own on public.profiles; create policy profiles_delete_own on public.profiles for delete using (id = auth.uid());

-- Uniform ownership policies for tables with a required user_id.
do $$ declare t text; begin
  foreach t in array array['sender_profiles','signature_fields','microsoft_integrations','datasets','dataset_columns','dataset_placeholder_mappings','dataset_rows','column_mapping_profiles','template_versions','routing_rules','send_runs','send_run_items','email_history','suppression_list','user_preferences'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', t || '_delete_own', t);
  end loop;
end $$;

drop policy if exists templates_select_visible on public.templates;
create policy templates_select_visible on public.templates for select using (is_system or user_id = auth.uid());
drop policy if exists templates_insert_own on public.templates;
create policy templates_insert_own on public.templates for insert with check (user_id = auth.uid() and not is_system);
drop policy if exists templates_update_own on public.templates;
create policy templates_update_own on public.templates for update using (user_id = auth.uid() and not is_system) with check (user_id = auth.uid() and not is_system);
drop policy if exists templates_delete_own on public.templates;
create policy templates_delete_own on public.templates for delete using (user_id = auth.uid() and not is_system);

-- Prevent a caller from attaching an owned child row to another user's parent row.
-- RLS checks the caller; these triggers additionally enforce relational ownership.
create or replace function public.enforce_same_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent_owner uuid; parent_id uuid;
begin
  parent_id := (to_jsonb(new)->>tg_argv[1])::uuid;
  execute format('select user_id from public.%I where id = $1', tg_argv[0]) into parent_owner using parent_id;
  if parent_owner is null or parent_owner <> new.user_id then raise exception 'Parent record ownership mismatch'; end if;
  return new;
end;
$$;

drop trigger if exists dataset_columns_owner_guard on public.dataset_columns;
create trigger dataset_columns_owner_guard before insert or update on public.dataset_columns for each row execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger if exists dataset_rows_owner_guard on public.dataset_rows;
create trigger dataset_rows_owner_guard before insert or update on public.dataset_rows for each row execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger if exists dataset_placeholder_mappings_owner_guard on public.dataset_placeholder_mappings;
create trigger dataset_placeholder_mappings_owner_guard before insert or update on public.dataset_placeholder_mappings for each row execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger if exists routing_rules_owner_guard on public.routing_rules;
create trigger routing_rules_owner_guard before insert or update on public.routing_rules for each row execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger if exists template_versions_owner_guard on public.template_versions;
create trigger template_versions_owner_guard before insert or update on public.template_versions for each row execute function public.enforce_same_owner('templates','template_id');
drop trigger if exists send_runs_owner_guard on public.send_runs;
create trigger send_runs_owner_guard before insert or update on public.send_runs for each row execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger if exists send_run_items_run_owner_guard on public.send_run_items;
create trigger send_run_items_run_owner_guard before insert or update on public.send_run_items for each row execute function public.enforce_same_owner('send_runs','send_run_id');
drop trigger if exists send_run_items_row_owner_guard on public.send_run_items;
create trigger send_run_items_row_owner_guard before insert or update on public.send_run_items for each row execute function public.enforce_same_owner('dataset_rows','dataset_row_id');
drop trigger if exists email_history_dataset_owner_guard on public.email_history;
create trigger email_history_dataset_owner_guard before insert or update on public.email_history for each row execute function public.enforce_same_owner('datasets','dataset_id');
drop trigger if exists email_history_run_owner_guard on public.email_history;
create trigger email_history_run_owner_guard before insert or update on public.email_history for each row execute function public.enforce_same_owner('send_runs','send_run_id');
drop trigger if exists email_history_row_owner_guard on public.email_history;
create trigger email_history_row_owner_guard before insert or update on public.email_history for each row execute function public.enforce_same_owner('dataset_rows','dataset_row_id');

create or replace function public.validate_dataset_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.routing_column_id is not null and not exists (select 1 from public.dataset_columns c where c.id = new.routing_column_id and c.dataset_id = new.id and c.user_id = new.user_id) then raise exception 'Routing column must belong to this dataset'; end if;
  if new.fallback_template_id is not null and not exists (select 1 from public.templates t where t.id = new.fallback_template_id and (t.is_system or t.user_id = new.user_id)) then raise exception 'Fallback template is not accessible'; end if;
  return new;
end;
$$;
drop trigger if exists datasets_link_guard on public.datasets;
create trigger datasets_link_guard before insert or update on public.datasets for each row execute function public.validate_dataset_links();

create or replace function public.validate_row_template()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.template_override_id is not null and not exists (select 1 from public.templates t where t.id = new.template_override_id and (t.is_system or t.user_id = new.user_id)) then raise exception 'Template override is not accessible'; end if;
  return new;
end;
$$;
drop trigger if exists dataset_rows_template_guard on public.dataset_rows;
create trigger dataset_rows_template_guard before insert or update on public.dataset_rows for each row execute function public.validate_row_template();

create or replace function public.validate_placeholder_mapping_column()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.dataset_columns c where c.id = new.column_id and c.dataset_id = new.dataset_id and c.user_id = new.user_id) then
    raise exception 'Placeholder mapping column must belong to this dataset';
  end if;
  if new.placeholder = 'signature' or new.placeholder like 'profile.%' then
    raise exception 'Sender and signature placeholders cannot be mapped to spreadsheet columns';
  end if;
  return new;
end;
$$;
drop trigger if exists dataset_placeholder_mappings_column_guard on public.dataset_placeholder_mappings;
create trigger dataset_placeholder_mappings_column_guard before insert or update on public.dataset_placeholder_mappings for each row execute function public.validate_placeholder_mapping_column();

create or replace function public.validate_routing_template()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.action = 'template' and new.template_id is null then new.action := 'skip'; end if;
  if new.template_id is not null and not exists (select 1 from public.templates t where t.id = new.template_id and (t.is_system or t.user_id = new.user_id)) then raise exception 'Routing template is not accessible'; end if;
  return new;
end;
$$;
drop trigger if exists routing_rules_template_guard on public.routing_rules;
create trigger routing_rules_template_guard before insert or update on public.routing_rules for each row execute function public.validate_routing_template();

create or replace function public.validate_send_item_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare run_dataset uuid; row_dataset uuid;
begin
  select dataset_id into run_dataset from public.send_runs where id = new.send_run_id and user_id = new.user_id;
  select dataset_id into row_dataset from public.dataset_rows where id = new.dataset_row_id and user_id = new.user_id;
  if run_dataset is null or row_dataset is null or run_dataset <> row_dataset then raise exception 'Send item dataset mismatch'; end if;
  if new.template_id is not null and not exists (select 1 from public.templates t where t.id = new.template_id and (t.is_system or t.user_id = new.user_id)) then raise exception 'Send template is not accessible'; end if;
  return new;
end;
$$;
drop trigger if exists send_run_items_link_guard on public.send_run_items;
create trigger send_run_items_link_guard before insert or update on public.send_run_items for each row execute function public.validate_send_item_links();

create or replace function public.validate_history_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare run_dataset uuid; row_dataset uuid; item_run uuid;
begin
  select dataset_id into run_dataset from public.send_runs where id = new.send_run_id and user_id = new.user_id;
  select dataset_id into row_dataset from public.dataset_rows where id = new.dataset_row_id and user_id = new.user_id;
  select send_run_id into item_run from public.send_run_items where id = new.send_run_item_id and user_id = new.user_id;
  if run_dataset is null or row_dataset is null or run_dataset <> new.dataset_id or row_dataset <> new.dataset_id or item_run <> new.send_run_id then raise exception 'History relationship mismatch'; end if;
  return new;
end;
$$;
drop trigger if exists email_history_link_guard on public.email_history;
create trigger email_history_link_guard before insert or update on public.email_history for each row execute function public.validate_history_links();

-- New accounts receive only safe defaults. The auth trigger never enables live sending.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email, timezone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email, 'UTC') on conflict (id) do nothing;
  insert into public.sender_profiles(user_id, sender_name, sender_email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email) on conflict (user_id) do nothing;
  insert into public.user_preferences(user_id, live_sending_enabled)
  values (new.id, false) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.save_template_version()
returns trigger language plpgsql set search_path = public as $$
declare next_version integer;
begin
  if old.user_id is not null and (old.subject_template is distinct from new.subject_template or old.html_body is distinct from new.html_body or old.plain_text_body is distinct from new.plain_text_body) then
    select coalesce(max(version_number), 0) + 1 into next_version from public.template_versions where template_id = old.id;
    insert into public.template_versions(user_id, template_id, version_number, name, description, category, subject_template, html_body, plain_text_body, signature_behavior)
    values(old.user_id, old.id, next_version, old.name, old.description, old.category, old.subject_template, old.html_body, old.plain_text_body, old.signature_behavior);
  end if;
  return new;
end;
$$;
drop trigger if exists template_version_before_update on public.templates;
create trigger template_version_before_update before update on public.templates for each row execute function public.save_template_version();

do $$ declare t text; begin
  foreach t in array array['profiles','sender_profiles','signature_fields','microsoft_integrations','templates','datasets','dataset_columns','dataset_placeholder_mappings','dataset_rows','column_mapping_profiles','routing_rules','send_runs','send_run_items','suppression_list','user_preferences'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- Security-invoker RPCs use the caller's RLS policies.
create or replace function public.search_dataset_rows(p_dataset_id uuid, p_search text default null, p_email_filter text default 'all', p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, user_id uuid, dataset_id uuid, row_number integer, original_data jsonb, data jsonb, recipient_email text, email_normalized text, email_valid boolean, routing_value text, subject_value text, template_override_id uuid, created_at timestamptz, updated_at timestamptz, total_count bigint)
language sql stable set search_path = public as $$
  select r.id, r.user_id, r.dataset_id, r.row_number, r.original_data, r.data, r.recipient_email, r.email_normalized, r.email_valid, r.routing_value, r.subject_value, r.template_override_id, r.created_at, r.updated_at, count(*) over()
  from public.dataset_rows r
  where r.dataset_id = p_dataset_id
    and (p_search is null or p_search = '' or r.data::text ilike '%' || p_search || '%' or coalesce(r.recipient_email,'') ilike '%' || p_search || '%' or coalesce(r.routing_value,'') ilike '%' || p_search || '%')
    and (p_email_filter = 'all' or (p_email_filter = 'valid' and r.email_valid) or (p_email_filter = 'missing' and coalesce(r.recipient_email,'') = '') or (p_email_filter = 'invalid' and coalesce(r.recipient_email,'') <> '' and not r.email_valid))
  order by r.row_number
  limit least(greatest(p_limit, 1), 10000) offset greatest(p_offset, 0);
$$;

create or replace function public.dataset_routing_values(p_dataset_id uuid)
returns table(routing_value text, row_count bigint) language sql stable set search_path = public as $$
  select r.routing_value, count(*) from public.dataset_rows r where r.dataset_id = p_dataset_id and nullif(trim(r.routing_value),'') is not null group by r.routing_value order by lower(r.routing_value);
$$;

create or replace function public.set_dataset_routing_column(p_dataset_id uuid, p_column_id uuid)
returns void language plpgsql set search_path = public as $$
declare slug text;
begin
  if p_column_id is not null then select placeholder_slug into slug from public.dataset_columns where id = p_column_id and dataset_id = p_dataset_id and user_id = auth.uid(); if slug is null then raise exception 'Routing column not found'; end if; end if;
  update public.datasets set routing_column_id = p_column_id where id = p_dataset_id and user_id = auth.uid();
  if not found then raise exception 'Dataset not found'; end if;
  update public.dataset_rows set routing_value = case when slug is null then null else nullif(trim(data->>slug),'') end where dataset_id = p_dataset_id and user_id = auth.uid();
end;
$$;

create or replace function public.refresh_dataset_counts(p_dataset_id uuid)
returns void language plpgsql set search_path = public as $$
begin
  update public.datasets d set
    row_count = stats.total_count,
    valid_email_count = stats.valid_count,
    missing_email_count = stats.missing_count,
    invalid_email_count = stats.invalid_count
  from (
    select count(*)::integer total_count,
      count(*) filter (where email_valid)::integer valid_count,
      count(*) filter (where coalesce(recipient_email,'') = '')::integer missing_count,
      count(*) filter (where coalesce(recipient_email,'') <> '' and not email_valid)::integer invalid_count
    from public.dataset_rows where dataset_id = p_dataset_id and user_id = auth.uid()
  ) stats
  where d.id = p_dataset_id and d.user_id = auth.uid();
end;
$$;

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
    email_valid = case when email_slug is null then false else lower(trim(data->>email_slug)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' end,
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
    email_valid = case when email_slug is null then false else lower(trim(p_data->>email_slug)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' end,
    subject_value = case when subject_slug is null then null else nullif(trim(p_data->>subject_slug),'') end,
    routing_value = case when routing_slug is null then null else nullif(trim(p_data->>routing_slug),'') end
  where id = p_row_id and user_id = auth.uid();
  perform public.refresh_dataset_counts(row_dataset);
end;
$$;

create or replace function public.delete_my_application_data()
returns void language plpgsql set search_path = public, storage as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  delete from storage.objects where bucket_id = 'imports' and (storage.foldername(name))[1] = me::text;
  delete from public.datasets where user_id = me;
  delete from public.templates where user_id = me;
  delete from public.column_mapping_profiles where user_id = me;
  delete from public.signature_fields where user_id = me;
  delete from public.microsoft_integrations where user_id = me;
  delete from public.suppression_list where user_id = me;
  delete from public.sender_profiles where user_id = me;
  delete from public.user_preferences where user_id = me;
  update public.profiles set full_name = '', avatar_url = null, location = null, onboarding_completed = false where id = me;
  insert into public.sender_profiles(user_id, sender_name) values(me, '') on conflict (user_id) do nothing;
  insert into public.user_preferences(user_id, live_sending_enabled) values(me, false) on conflict (user_id) do nothing;
end;
$$;

revoke execute on function public.search_dataset_rows(uuid,text,text,integer,integer) from public, anon;
revoke execute on function public.dataset_routing_values(uuid) from public, anon;
revoke execute on function public.set_dataset_routing_column(uuid,uuid) from public, anon;
revoke execute on function public.refresh_dataset_counts(uuid) from public, anon;
revoke execute on function public.set_dataset_standard_mapping(uuid,uuid,text) from public, anon;
revoke execute on function public.update_dataset_row_data(uuid,jsonb) from public, anon;
revoke execute on function public.delete_my_application_data() from public, anon;
grant execute on function public.search_dataset_rows(uuid,text,text,integer,integer) to authenticated;
grant execute on function public.dataset_routing_values(uuid) to authenticated;
grant execute on function public.set_dataset_routing_column(uuid,uuid) to authenticated;
grant execute on function public.refresh_dataset_counts(uuid) to authenticated;
grant execute on function public.set_dataset_standard_mapping(uuid,uuid,text) to authenticated;
grant execute on function public.update_dataset_row_data(uuid,jsonb) to authenticated;
grant execute on function public.delete_my_application_data() to authenticated;
