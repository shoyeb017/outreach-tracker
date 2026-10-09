# Supabase setup and RLS verification

## Exact SQL execution order

1. Create a new Supabase project.
2. In SQL Editor, run `schema.sql` in full.
3. Run `storage.sql` to enable original spreadsheet retention and signature-logo uploads.
4. Run `seed_templates.sql`.
5. Run `migrations/20261008_guided_workflow.sql`, then `migrations/20261008_admin_microsoft.sql` for administrator settings, Microsoft configurations, persistent security limits, and audit records.

For a database created before the dynamic-signature redesign, run `migrations/20260907_dynamic_signature.sql` once before deploying the matching application code. It converts existing sender details into reorderable signature lines, removes the old sender-profile table, and removes profile timezone/location columns. Then run `migrations/20260907_signature_logo.sql` to allow image lines and create the public, image-only `signature-assets` bucket.

The baseline schema uses `if not exists`, replaces functions, and recreates policies/triggers by name. The seed uses stable `seed_key` values and updates managed system templates without overwriting personal templates. Apply upgrade migrations only when missing; the administrator migration creates named policies and must not be blindly rerun on an upgraded database.

For the guided-workflow upgrade, back up your database and run `migrations/20261008_guided_workflow.sql` before deploying the application. It adds frozen send mode and security-invoker RPCs for atomic email choices, personalization, global recipient review, and fresh send protections. Existing rows and history are retained. Existing send runs without a saved mode are not resumed automatically. Do not rerun the template seed solely for this upgrade: it manages system template wording.

For administrator/Microsoft configuration support, then apply the missing `migrations/20261008_admin_microsoft.sql`. Its security-limit and audit tables are required even when the administrator signs in using environment credentials rather than a Supabase Auth account. See [administrator setup](../docs/admin-microsoft-setup.md).

## Auth configuration

Enable Email/Password. For production, keep email confirmation enabled. Set:

- Local Site URL: `http://localhost:3000`
- Local redirect: `http://localhost:3000/auth/callback`
- Production Site URL: your final Vercel origin
- Production redirect: `https://YOUR_APP.vercel.app/auth/callback`

The auth trigger creates an account profile and safe user preferences. It never creates Microsoft credentials or a separate sender identity, and it never enables live sending.

## Storage

The `imports` bucket is private. Policies permit a signed-in user to access only objects whose first path segment equals their auth user ID:

```text
{user_id}/{dataset_id}/sanitized-filename.xlsx
```

Do not create a public bucket or public URL for business spreadsheets.

## Tables

- `profiles`
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
- `application_administrators`
- `microsoft_default_configuration`
- `microsoft_user_configurations`
- `admin_audit_log`
- `security_rate_limits`

Core user-owned workspace tables have select, insert, update, and delete policies based on `auth.uid()`. System templates permit read-only access to ordinary users. Security-definer owner guards prevent cross-owner parent/child references while browser-callable helper functions remain security invoker and therefore subject to RLS.

Users can read only their own Microsoft configurations and administrator-role record. Configuration writes use protected server endpoints with explicit owner filters. Platform defaults, audit logs, and security-limit records are not accessible from the browser. Administrator RPCs are service-role-only; never grant them to `authenticated` or `anon`.

## Two-user RLS test

Use two separate browser profiles, create account A and account B, and obtain one dataset ID from each. Verify:

1. Account A sees only A's datasets, rows, mappings, signature lines, Microsoft identifiers, runs, history, preferences, and suppression records.
2. Account A can read system templates but cannot update or delete them.
3. Account A cannot select account B's dataset by a known UUID.
4. Account A cannot insert a `dataset_rows` or `dataset_columns` record linked to B's dataset; the owner guard must reject it.
5. Account A cannot upload or read `imports/{B_USER_ID}/…`.
6. Account B receives the same isolation in reverse.
7. Deleting a dataset cascades through its columns, rows, routing rules, runs, run items, and history.

8. Account A cannot use `save_spreadsheet_setup`, `save_email_choices`, `save_personalization`, or `review_spreadsheet_rows` on B's spreadsheet. An invalid/cross-owner reference must roll back the entire save.
9. `send_recipient_protection` includes only A's history, suppression and uncertain items, even when B has used the same address.

Do not test RLS from SQL Editor while using the project-owner role: that role bypasses RLS. Test through the browser anon client or an authenticated JWT.

## Seed template status

`seed_templates.sql` creates a blank system template plus one active system template for each of the 23 approved industry taxonomy buckets. Category values match the routing labels exactly. Stable `seed_key` values make the seed rerunnable; rerunning it updates the managed industry copy without creating duplicate templates.

Every industry template includes both HTML and plain-text content, greets `{{company_name}}`, and renders the optional dynamic signature through `{{signature}}`.

## Vercel variables

Use the values in [`.env.example`](../.env.example). Only the first three are public; the remaining values must stay on the server:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=https://YOUR_APP.vercel.app
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_LOGIN_EMAIL=
ADMIN_LOGIN_PASSWORD=
```

The protected server endpoints require the service-role key for security limits, administrator settings, and audit records. Never prefix it with `NEXT_PUBLIC_`, expose it in client code, or commit actual credentials. The public key must be an anon/publishable key, not a secret/service-role key. Product branding is built into AUTMAIL; `NEXT_PUBLIC_PRODUCT_NAME` is no longer used.

Set the admin email/password to sign in through the shared `/login` page. No hash script or separate admin signup is required. Keep normal-user email confirmation enabled. Restart locally or redeploy after changing environment settings.
