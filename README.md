# Mail Automation Studio

Mail Automation Studio is a general-purpose, spreadsheet-driven email automation workspace. It imports Excel or CSV data, maps arbitrary headers, routes each row to the right rich-text template, resolves recipient and sender placeholders, and sends through the signed-in user's Microsoft 365 mailbox.

Live sending is **off by default**. In test mode the complete import, routing, rendering, queue, progress, and history flow runs without calling Microsoft Graph `sendMail`.

## Product overview

The everyday path is intentionally short:

`DATA → TEMPLATE → SELECT → SEND`

- Import `.xlsx`, `.xls`, or `.csv` without uploading before preview.
- Select a worksheet and inspect the first 30 rows.
- Map any source header to standard concepts. Only recipient email is generally required.
- Retain every custom column and expose it as a safe `{{placeholder_slug}}`.
- Choose any column as a generic routing key.
- Map mixed routing values to different templates and send them in one selection.
- Preview any generated email, but do not require per-recipient approval.
- Persist resolved subject/body snapshots before a send starts.
- Pause and resume a browser-based queue without resending completed items.
- Audit sent, simulated, failed, skipped, and suppressed records.

## Architecture

There is no separately deployed backend service.

```text
Next.js App Router on Vercel
  ├─ Supabase Auth (application identity)
  ├─ Supabase PostgreSQL + RLS (all product data)
  ├─ optional private Supabase Storage (original imports)
  └─ MSAL Browser → Microsoft Graph /me/sendMail (delegated sending)
```

The browser uses the Supabase anon/publishable key. RLS enforces ownership, and relational owner guards prevent an owned child record from being attached to another user's parent record. No service-role key, Microsoft password, client secret, Graph access token, or refresh token belongs in the database or browser source.

Because delegated sending runs in the browser, the tab must remain open. Progress is saved after every item, and unfinished runs can be resumed later.

## Technology stack

- Next.js 16 App Router, React 19, and TypeScript
- Tailwind CSS 4 and shadcn-compatible local UI primitives
- Supabase Auth, PostgreSQL, RLS, and optional private Storage
- Microsoft Entra ID, MSAL Browser, and delegated Microsoft Graph
- SheetJS/xlsx, TanStack Table, TipTap, DOMPurify, React Hook Form/Zod-ready form architecture
- Vitest and Testing Library

## Project structure

```text
src/
  app/
    (auth)/                 login, registration, reset flows
    (app)/                  protected product routes
      dashboard/
      datasets/             list, guide, import, workspace
      templates/            library, editor, versions
      history/
      settings/
      onboarding/
    auth/callback/
  components/
    auth/ data-table/ dashboard/ datasets/ editor/ history/
    layout/ microsoft/ onboarding/ sending/ settings/ signature/
    spreadsheet/ templates/ ui/
  lib/
    email/ microsoft/ sending/ spreadsheet/ supabase/ templates/ validation/
  types/
supabase/
  schema.sql
  storage.sql
  seed_templates.sql
  README.md
tests/
proxy.ts
```

## Local setup

Requirements: a current Node.js LTS or later and npm.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Use these verification commands before deployment:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Environment variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PRODUCT_NAME=Mail Automation Studio
```

The product name is configurable. Do not add `SUPABASE_SERVICE_ROLE_KEY`, a Microsoft client secret, or a user's Microsoft Client ID globally. Each user stores their public Tenant ID and Client ID in their own RLS-protected integration row.

## Supabase project setup

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run `supabase/schema.sql`.
4. Run `supabase/storage.sql` to enable original-file retention and signature-logo uploads.
5. Run `supabase/seed_templates.sql`.
6. For an existing installation that still has a sender profile, run `supabase/migrations/20260907_dynamic_signature.sql` once, then run `supabase/migrations/20260907_signature_logo.sql`.
7. In **Authentication → URL Configuration**, set the Site URL to the local or production app URL.
8. Add `http://localhost:3000/auth/callback` and `https://YOUR_APP.vercel.app/auth/callback` to Redirect URLs.
9. Copy the Project URL and publishable/anon key into `.env.local` and Vercel.
10. Keep email confirmation enabled for production.
11. Follow [supabase/README.md](supabase/README.md) to run the two-user RLS test.

The exact SQL order is: **schema → storage → seed templates**. Storage is optional, but run it before enabling “Keep original imported file.”

## Authentication and registration

Registration calls Supabase Auth with email/password and a PKCE-compatible verification callback. The `on_auth_user_created` database trigger creates:

- the `profiles` row;
- `user_preferences` with live sending explicitly off.

After verification, the callback exchanges the code for a Supabase session and opens onboarding. `proxy.ts` refreshes session cookies and redirects protected routes when no user is present. Forgot-password links return through the same callback and open the update-password form.

## Dynamic signature builder

The connected Microsoft 365 mailbox is always the actual From identity. There is no separate sender profile. The optional signature consists only of user-created lines; every line can be reordered, hidden, or deleted. Text lines can be bolded and labeled, links can be clickable, and logo lines can use an uploaded image or HTTPS URL with a dynamic 24–600 px width and optional click-through link.

Uploaded signature logos are stored in the public `signature-assets` bucket because recipient email clients need unauthenticated access to display them. Uploads are limited to PNG, JPG, WebP, and GIF files of 2 MB or less; write and delete access remains restricted to the owning user folder.

Nothing is hard-coded—not even “Best regards,”. An empty signature is valid, and `{{signature}}` resolves at render time to the exact currently enabled lines.

## Spreadsheet format and column mapping

The parser runs in the browser and applies a 15 MB / 10,000-row-per-worksheet limit. A multi-sheet workbook shows a worksheet selector. The preview reports email-like values, empty cells, invalid email-like values, and duplicate rows.

Column mapping never requires exact headers. A column such as `Public Email` can map to Recipient Email, while an unmapped `Annual Revenue` column is retained as `{{annual_revenue}}`. Duplicate normalized slugs receive stable suffixes such as `_2`.

The Spreadsheet Guide screen generates safe example XLSX and CSV files using only `example.com` recipients.

## Subject strategy

Each dataset chooses one strategy:

- **Template subject** — always render the template subject.
- **Spreadsheet subject** — use only the mapped row value.
- **Spreadsheet subject with template fallback** — use the row value when non-empty; otherwise render the template subject. This is the default.

## Templates and placeholders

TipTap supports bold, italic, underline, strikethrough, lists, headings, blockquotes, links, alignment, undo/redo, and clear formatting. HTML is sanitized before persistence/rendering. Placeholders are resolved by a strict token parser; no `eval` or executable expressions are used.

Suggested spreadsheet placeholders and all imported custom fields are available alongside the special `{{signature}}` token. Every placeholder other than `{{signature}}` must map to a spreadsheet column. Unresolved placeholders block the affected row before queue creation.

System templates are readable and duplicable but not editable by regular users. Personal templates can be edited, archived, restored, and routed. Meaningful subject/body changes save the previous current content to `template_versions`; restoring a version preserves the displaced version as history.

### Supplied template seed status

The request referenced 23 existing approved industry templates, but no template labels or copy were present in the supplied workspace or attachment. The project deliberately does not invent marketing copy or pretend it is approved. `seed_templates.sql` therefore seeds exactly one safe system record:

1. Blank Template

The same file contains an idempotent `seed_key` import contract. When the 23 originals are supplied, add each exact name, category, subject, HTML body, and plain-text body using stable keys and `ON CONFLICT DO NOTHING`. Until then, there is no honest exact list of those 23 records.

## Template routing

Routing is not tied to industry. Any imported column can be the key (for example Customer Type, Event, Region, or Status). Values are normalized with Unicode normalization, trimming, whitespace collapse, and case folding. Auto-match uses only exact normalized category/name equality; it does not make risky semantic guesses.

Each unique value can use a chosen template, the dataset fallback, or Skip. The fallback defaults to none. Template overrides on individual rows take precedence.

## Selection, preview, and sending

The recipient table uses database-backed search and pagination, TanStack sorting/visibility, sticky headers, email-state filters, visible selection, select-all-filtered, inversion, and row actions. Imported rows can be corrected; derived recipient email, subject, and routing indexes refresh through RLS-protected SQL functions.

Email preview renders from the same function used by queue preparation and shows From, To, Subject, body, template, route source, signature, and unresolved fields.

`Send selected` validates in this order:

1. recipient exists and has a valid normalized format;
2. address is not suppressed;
3. duplicate policy allows the send;
4. routing resolves a template or deliberate fallback;
5. subject and body placeholders fully resolve;
6. signature and sanitized HTML are finalized.

The final confirmation summarizes selected, ready, invalid/missing, and blocked rows. In live mode it also requires a connected Microsoft account.

## Browser queue and resume behavior

Before network sending, the app creates a `send_runs` row and a `send_run_items` row for every selected recipient. Each item stores its resolved template, subject, final HTML, and plain text. Template edits made after that point cannot change the approved pending content.

The controlled queue persists attempts and final state after every item. Microsoft 429 and transient 5xx/network responses use limited exponential backoff and respect `Retry-After`. Permanent authorization errors stop retrying. Pause, resume, and stop state are written to Supabase. Completed items are filtered out when resuming.

Test sends use one representative row, replace the recipient with the explicit test address, prefix `[TEST]`, and mark history as a test. They never mark the source recipient as contacted.

## Test mode and live sending

Test mode is the default and Graph `sendMail` is not called. Simulated outcomes are clearly labeled in history. Enabling live sending requires a separate confirmation in Settings. A real send still presents one final batch confirmation.

Automated tests mock or bypass Graph. They never send real email.

## Duplicate protection and suppression

The queue always blocks duplicates inside one run. The default policy also blocks the same template/recipient pair when successful history exists. Settings can change this to warn or allow a deliberate resend.

Suppression rows use normalized email uniqueness per user. A suppressed address is blocked before `send_run_items` enter the queue. Users can add suppression from a row and manage their own list under Settings; RLS prevents access to another user's list.

## History and export

History stores the user, dataset, source row, send run/item, recipient, template, subject, final HTML/plain text, sender Microsoft email, timestamp, status, test flag, and error. The History screen can filter and open the exact stored message. Dataset export produces XLSX with original/current row fields plus sending status, last-sent, template, and error details.

## Microsoft Entra setup

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Go to **Identity → Applications → App registrations**.
3. Choose **New registration** and enter an application name.
4. Choose the supported account type appropriate to your organization.
5. Under **Authentication**, add a **Single-page application (SPA)** platform.
6. Add `http://localhost:3000/settings` for local development.
7. Add `https://YOUR_APP.vercel.app/settings` for production.
8. Under **API permissions**, add Microsoft Graph **Delegated permissions**: `User.Read` and `Mail.Send`. MSAL also requests `openid`, `profile`, `email`, and `offline_access` protocol scopes.
9. Do not add Application `Mail.Send`. Do not create or paste a client secret.
10. Tenant policy may require an administrator to grant consent.
11. Copy the **Directory (tenant) ID** and **Application (client) ID**.
12. In the app, open **Settings → Microsoft 365**, enter both IDs and the expected Microsoft email, and save.
13. Choose **Connect account**, complete Microsoft login, and then **Test connection**. The test calls `/me`; it does not send email.

The app uses Authorization Code Flow with PKCE as an SPA/public client. Tokens remain in MSAL session storage and are never written to Supabase.

## Vercel deployment

1. Create and configure Supabase, including the SQL files above.
2. Import this repository into Vercel as a Next.js project.
3. Add all variables from `.env.example` for Production and Preview; set `NEXT_PUBLIC_APP_URL` to the production URL.
4. Deploy and copy the final `https://…vercel.app` URL.
5. Add that URL as the Supabase Site URL and add `/auth/callback` to Supabase Redirect URLs.
6. Add the production `/settings` URL as an SPA redirect URI in every user's Entra registration.
7. Redeploy after environment changes.
8. Register and verify a dedicated test account.
9. Connect a test Microsoft mailbox and run **Test connection**.
10. Keep live sending off; run imports, previews, and a simulated batch.
11. Only then enable live sending and send a single test message to a controlled mailbox.

## Security notes

- RLS is enabled on every application table.
- Policies use `auth.uid()`; relational owner triggers guard parent-child links.
- Original files are private and scoped under `{user_id}/{dataset_id}/filename`.
- The browser never receives a service-role key or Microsoft client secret.
- Microsoft credentials are handled by MSAL; passwords and tokens are never stored in Supabase.
- Template HTML is sanitized and placeholders never execute code.
- Imported file type, size, row count, names, and recipient addresses are validated.
- Test data and generated samples use fictional companies and `example.com` only.

## Troubleshooting

- **Preview mode banner**: add valid Supabase variables to `.env.local` and restart Next.js.
- **Auth callback error**: confirm the exact callback URL is allowed in Supabase Auth settings.
- **Microsoft popup redirect mismatch**: the current `/settings` URL must exactly match an Entra SPA redirect URI.
- **Permission required / 403**: confirm Delegated `Mail.Send` and tenant consent policy.
- **401 during send**: reconnect Microsoft, then resume the saved send run.
- **429 throttling**: leave the tab open; the queue honors `Retry-After` and retries a limited number of times.
- **Rows blocked**: open the review details for invalid email, suppression, duplicate, unmapped route, missing template, or unresolved placeholder.
- **Original upload fails**: run `storage.sql`, confirm the bucket is private, and check the file is under 15 MB.

## No-backend limitations

- The sending tab must remain open; there is no durable background worker.
- Scheduled or unattended sends are intentionally not implemented.
- Queue throughput is conservative and subject to Graph throttling and tenant policies.
- Each user configures one Entra public-client application and one active Microsoft account in the current version.
- Account-wide deletion from Supabase Auth itself requires project-owner/admin coordination; owned application rows cascade when the auth user is deleted.
- Real Graph sending cannot be verified without user-provided Entra configuration and a consented test mailbox.
