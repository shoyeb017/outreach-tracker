# Supabase setup and RLS verification

## Exact SQL execution order

1. Create a new Supabase project.
2. In SQL Editor, run `schema.sql` in full.
3. Run `storage.sql` if original spreadsheet retention will be available.
4. Run `seed_templates.sql`.

All files are designed to be rerunnable. The schema uses `if not exists`, replaces functions, and recreates policies/triggers by name. The seed uses a stable `seed_key` and never overwrites an existing template.

## Auth configuration

Enable Email/Password. For production, keep email confirmation enabled. Set:

- Local Site URL: `http://localhost:3000`
- Local redirect: `http://localhost:3000/auth/callback`
- Production Site URL: your final Vercel origin
- Production redirect: `https://YOUR_APP.vercel.app/auth/callback`

The auth trigger creates a profile, sender profile, and safe user preferences for each new account. It never creates Microsoft credentials and never enables live sending.

## Storage

The `imports` bucket is private. Policies permit a signed-in user to access only objects whose first path segment equals their auth user ID:

```text
{user_id}/{dataset_id}/sanitized-filename.xlsx
```

Do not create a public bucket or public URL for business spreadsheets.

## Tables

- `profiles`
- `sender_profiles`
- `signature_fields`
- `microsoft_integrations`
- `datasets`
- `dataset_columns`
- `dataset_placeholder_mappings`
- `dataset_rows`
- `column_mapping_profiles`
- `templates`
- `template_versions`
- `routing_rules`
- `send_runs`
- `send_run_items`
- `email_history`
- `suppression_list`
- `user_preferences`

Every user-owned table has select, insert, update, and delete policies based on `auth.uid()`. System templates are the only rows with a nullable owner; their RLS permits read-only access. Security-definer owner guards prevent cross-owner parent/child references while browser-callable helper functions remain security invoker and therefore subject to RLS.

## Two-user RLS test

Use two separate browser profiles, create account A and account B, and obtain one dataset ID from each. Verify:

1. Account A sees only A's datasets, rows, mappings, sender data, Microsoft identifiers, runs, history, preferences, and suppression records.
2. Account A can read system templates but cannot update or delete them.
3. Account A cannot select account B's dataset by a known UUID.
4. Account A cannot insert a `dataset_rows` or `dataset_columns` record linked to B's dataset; the owner guard must reject it.
5. Account A cannot upload or read `imports/{B_USER_ID}/…`.
6. Account B receives the same isolation in reverse.
7. Deleting a dataset cascades through its columns, rows, routing rules, runs, run items, and history.

Do not test RLS from SQL Editor while using the project-owner role: that role bypasses RLS. Test through the browser anon client or an authenticated JWT.

## Seed template status

`seed_templates.sql` creates a blank system template plus one active system template for each of the 23 approved industry taxonomy buckets. Category values match the routing labels exactly. Stable `seed_key` values make the seed rerunnable; rerunning it updates the managed industry copy without creating duplicate templates.

Every industry template includes both HTML and plain-text content, greets `{{company_name}}`, and renders the current sender configuration through `{{signature}}`.

## Vercel variables

Set only the public values used by the browser:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=https://YOUR_APP.vercel.app
NEXT_PUBLIC_PRODUCT_NAME=Mail Automation Studio
```

Never add a service-role key to this application.
