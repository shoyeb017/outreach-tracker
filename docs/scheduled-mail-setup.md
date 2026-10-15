# Scheduled emails: easy setup for your existing project

You do **not** need another Supabase project or another hosting service. Keep your current Vercel website and your current Supabase Free project.

This guide is filled in for your installation. If someone uses another project or website, they must replace the project reference and website addresses below.

| What | Your value |
| --- | --- |
| Website | `https://autmail.vercel.app` |
| Existing Supabase URL | `https://rconmqterfwuzgdgsolj.supabase.co` |
| Supabase project reference (the short project ID) | `rconmqterfwuzgdgsolj` |
| Supabase dashboard | [Open your existing project](https://supabase.com/dashboard/project/rconmqterfwuzgdgsolj) |

The `supabase.co` address is your app's database/API address. **To change settings, use the dashboard link above**, not the API address.

## Before you start

- Keep scheduled sending **paused** in AUTMAIL Admin while setting this up.
- Use the Microsoft app registration already selected as the **Default configuration** in AUTMAIL Admin. Do not create a different registration by accident.
- Have access to that Entra registration, your Supabase dashboard, your Vercel project, and this project's code on your computer.
- Back up/export your database before applying SQL changes. Your earlier migrations, including `20261009_admin_controls.sql`, must already be applied.
- Make sure the new scheduling code is deployed to Vercel before the final test. A GitHub push alone does not deploy the Supabase function or set up its timer.

You will do eight steps. Each step says **where to go**, **what to do**, and **what to check**. Nothing below sends an email unless you later confirm a real schedule.

## Step 1 — Supabase: add the scheduling tables

**Where:** [Your Supabase dashboard](https://supabase.com/dashboard/project/rconmqterfwuzgdgsolj) → **SQL Editor**.

1. Open `supabase/migrations/20261015_scheduled_mail.sql` in VS Code.
2. Copy the **whole file**.
3. In Supabase SQL Editor, create a new query, paste the file, and click **Run**.
4. Wait for it to finish without an error.

**Check:** In **Table Editor**, the `public` schema should now include `scheduled_mail_batches`, `scheduled_mail_items`, and `scheduled_mail_control`. The scheduler starts disabled. You do not need to add rows manually.

If you already successfully applied this exact migration, skip this step. Do not run `schema.sql` again, delete tables, or re-run older migrations. If SQL reports an error, stop and check it before continuing; do not remove parts of the migration to force it through.

Next, run the whole **supabase/migrations/20261016_scheduled_test_mail.sql** file in a new SQL Editor query. This adds the manual-recipient scheduled test feature. If the first scheduling migration was already applied, apply **only this new follow-up file**. Skip either file only if that exact file was already successfully applied. Neither migration sends an email.

## Step 2 — Microsoft Entra: allow background sending

**Where:** [Microsoft Entra admin center](https://entra.microsoft.com) → **App registrations** → the app used by AUTMAIL's Default configuration.

### A. Add one more redirect address

Open **Authentication → Add a platform → Web**. Add this exact address and save:

```text
https://autmail.vercel.app/api/microsoft/background/callback
```

If a Web platform already exists, add the address there. **Do not replace** your existing Single-page application address:

```text
https://autmail.vercel.app/settings
```

These have different jobs: `/settings` connects the browser mailbox; the new `/api/microsoft/background/callback` allows scheduled sending while the browser is closed. Your existing Supabase sign-in `/auth/callback` is unchanged.

### B. Check permissions

Under **API permissions**, keep Microsoft Graph **Delegated** permissions `User.Read` and `Mail.Send`. AUTMAIL also asks for `offline_access` when the user enables background access; this lets it renew access later. Keep any permissions your existing Inbox feature already needs.

Do not add **Application** `Mail.Send` or enable password-grant/public-client access for this feature. Your organization's rules may still require admin consent. Keep supported account types compatible with your intended work/personal Microsoft accounts. A Microsoft identity with a Gmail address is not itself a Gmail mailbox.

### C. Copy two values for the next step

1. Under **Overview**, copy **Application (client) ID**. It must match the default Client ID saved in AUTMAIL Admin.
2. Under **Certificates & secrets → Client secrets → New client secret**, create a secret.
3. Copy its **Value** immediately. **Value is not Secret ID.** Keep it in a private password manager, and note the expiry date.

**Check:** You now have the correct Client ID and client-secret Value, and the new callback is saved under **Web**, not SPA.

## Step 3 — Your computer: generate two private keys

**Where:** VS Code → **Terminal → New Terminal**, opened in this project folder.

Run:

```powershell
node scripts/generate-scheduler-secrets.mjs
```

The script prints two lines named:

```text
SCHEDULE_ENCRYPTION_KEY=...
SCHEDULE_WORKER_SECRET=...
```

Keep the real values privately. When a dashboard asks for a **Value**, paste only the part after `=`. The `...` above is not a real key.

- **Encryption key:** protects saved Microsoft credentials. The same value goes into Vercel and Supabase Function Secrets.
- **Worker secret:** protects calls to the background sender. The same value goes into Supabase Function Secrets and Supabase Vault.

**Check:** You have saved both values. Generate them once for this setup; do not generate a different encryption key for each dashboard or each deployment. Never commit them or paste them into chat/screenshots.

## Step 4 — Vercel: save three environment variables

**Where:** Vercel → your AUTMAIL project → **Settings → Environment Variables**.

Add these variables for **Production**:

| Name | What to paste as its Value |
| --- | --- |
| `SCHEDULE_ENCRYPTION_KEY` | The encryption key from Step 3 |
| `MICROSOFT_SCHEDULER_CLIENT_ID` | The Application (client) ID from Step 2 |
| `MICROSOFT_SCHEDULER_CLIENT_SECRET` | The client-secret **Value** from Step 2 |

Also check these existing values; do not delete your other settings:

```text
NEXT_PUBLIC_APP_URL=https://autmail.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://rconmqterfwuzgdgsolj.supabase.co
```

Keep the existing Supabase keys and admin settings unchanged. Do not add `NEXT_PUBLIC_` to any new scheduler secret.

Saving values in your local `.env.local` **does not update Vercel or Supabase**. For the live website, save them in the dashboards. Local scheduler testing would also need the three Vercel variables in `.env.local`, but that is not required for this production setup.

**Check:** All three new variables are saved for Production. Redeploy Vercel after these changes and the scheduling code are ready.

## Step 5 — Supabase: save the function's two secrets

**Where:** Your existing Supabase dashboard → **Edge Functions → Secrets**.

Add and save:

| Secret name | What to paste as its Value |
| --- | --- |
| `SCHEDULE_ENCRYPTION_KEY` | Exactly the same encryption key you saved in Vercel |
| `SCHEDULE_WORKER_SECRET` | The worker secret from Step 3 |

These belong in **Function Secrets**, not in a spreadsheet, a browser setting, or the Supabase API-key fields. Supabase provides the hosted function's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically; do not replace them.

The Microsoft client secret does not need a separate entry here. AUTMAIL saves it encrypted when the user authorizes background access.

**Check:** Both secret names are listed in Function Secrets. A hidden value is normal.

## Step 6 — Your computer: upload the background sender to Supabase

The **worker** is just the small background program that sends due emails. Supabase hosts it for you.

**Where:** The VS Code terminal in this project's root folder, the folder containing `package.json`, `src`, and `supabase`.

Run this first:

```powershell
npx.cmd supabase login
```

If prompted to install the Supabase CLI, approve it. Follow the sign-in instructions using the Supabase account that owns your existing project. This is your **Supabase login**, not your AUTMAIL admin or Microsoft login. Keep any login token private.

After login succeeds, run this **as one command**:

```powershell
npx.cmd supabase functions deploy scheduled-mail-worker --project-ref rconmqterfwuzgdgsolj --use-api --no-verify-jwt
```

These are Windows PowerShell commands. On macOS/Linux use `npx` instead of `npx.cmd`.

- The project reference already points to **your existing project**. No new project or database is created.
- `--use-api` deploys without needing Docker. You do not need `supabase start`, `supabase init`, `db reset`, or a local database for this setup.
- `--no-verify-jwt` is intentional **only for this worker**: the worker checks its own private worker secret on every request. Do not remove that check from its code or disable authentication on other functions.
- Deploy from the whole repository. Do not paste just `index.ts` into a blank dashboard function: it imports shared files from `src/lib/scheduling`.

**Check:** Under Supabase **Edge Functions**, a function named `scheduled-mail-worker` should appear. Its URL is:

```text
https://rconmqterfwuzgdgsolj.supabase.co/functions/v1/scheduled-mail-worker
```

This is not a page to open in your browser. A normal browser visit is not a valid test; the function expects an authenticated POST from the timer.

## Step 7 — Supabase: set up the once-a-minute timer

The **timer** is called **Cron**. It wakes up the worker every minute. The worker only sends emails that users have explicitly scheduled and that pass safety checks.

### A. Save two entries in Vault

**Where:** Your existing Supabase dashboard → **Integrations → Vault**. Open/enable Vault if the dashboard asks, then find its Secrets screen. Menu labels may vary slightly.

Create these two entries using **Add secret** / **Create secret**:

| Name | Value |
| --- | --- |
| `autmail_scheduler_url` | `https://rconmqterfwuzgdgsolj.supabase.co/functions/v1/scheduled-mail-worker` |
| `autmail_scheduler_worker_secret` | Exactly the same `SCHEDULE_WORKER_SECRET` from Step 5 |

If the name already exists, update that entry rather than creating another one. Do not paste the encryption key into the worker-secret entry.

**Function Secrets and Vault are separate places.** The worker reads Function Secrets; the database timer reads Vault. That is why the worker secret is saved in both places. Do not make Vault or its decrypted views public.

### B. Create the timer

1. Open `supabase/schedule-worker-cron.sql` in VS Code.
2. Copy the whole file.
3. Go to Supabase **SQL Editor → New query**, paste it, and click **Run**.
4. Open **Integrations → Cron** to see the jobs.

You do not need to edit that SQL file: it reads your URL and secret from Vault. It creates:

- `autmail-scheduled-mail`: checks schedules every minute.
- `autmail-scheduler-log-cleanup`: cleans up this timer's old logs daily; it does not delete email history.

**Check:** Both named jobs exist and are active. Wait a few minutes. Do not manually create a second timer for the same worker. Running the Cron setup file again updates its named jobs rather than adding new copies.

## Step 8 — AUTMAIL: turn it on and test

### A. Enable the service as admin

1. Make sure the new scheduling code and Production variables have been deployed to Vercel.
2. Sign in to AUTMAIL as admin.
3. Open **Scheduled sending**.
4. Click **Refresh health**. Wait a few minutes and refresh again if necessary.
5. When it says **Worker checking in**, choose **Enable scheduled sending**.

**Check:** The admin screen says **Enabled** and shows a recent worker check. If it is offline, use the troubleshooting table below; do not bypass the safety check.

### B. Try practice first — no email is sent

1. Sign in to a normal user workspace and leave **Settings → Sending → Real sending** off.
2. Use a spreadsheet with one test recipient and finish its template/personalization setup.
3. Under **Review & send**, select the row and choose **Schedule for later**.
4. Choose a time about **10 minutes ahead**, check the displayed timezone, review, and confirm.
5. You can close the browser. After the time passes, open **Scheduled emails → History** and refresh.

**Check:** It shows **Practice completed**. No real email should appear in Microsoft Sent Items.

### C. Try one real dummy email to yourself — no spreadsheet needed

1. Connect the intended Microsoft sender under **Settings → Email account**.
2. Open **Scheduled emails → Enable background access**. Approve Microsoft access using that **same sending mailbox**. This extra approval allows the server to work while your browser is closed.
3. Turn **Real sending** on in Settings. A scheduled test is a real email, not a practice simulation.
4. In **Scheduled emails**, find **Test scheduled sending** and click **Schedule a test email**.
5. Enter one inbox you control and choose a time about 10 minutes ahead. Check the displayed sender, timezone and fixed dummy-message preview.
6. Check the real-email confirmation box and click **Confirm scheduled test email**.
7. The test appears in Upcoming as **Scheduled test email**. Open View details, then Refresh results after the time passes. You can pause/cancel the pending test or choose a new time, just like other schedules.
8. Check the sender's Microsoft Sent Items, the recipient inbox/Junk, and AUTMAIL Send history for the final result. Tests are marked as tests and do not count as campaign duplicate history.

**Check:** **Accepted by Microsoft** means Microsoft accepted the request, not guaranteed delivery. If you see **Outcome unknown**, check Sent Items; do not blindly schedule the same email again.

Before using client recipients, also test pause/cancel, adding a do-not-email address after scheduling, turning real sending off, and reconnecting with dedicated test accounts. Turning off real sending or disconnecting background access pauses pending real schedules. Cancellation cannot recall a request already handed to Microsoft.

**Already finished scheduler setup?** Apply only the missing `20261016_scheduled_test_mail.sql` migration and deploy the updated website (or restart local development). The existing worker processes the new test snapshots; no second worker, new Microsoft permission, new secret, or extra Cron job is needed. A missing worker/404 error must still be fixed first: the test uses the actual background sender and cannot bypass it.

**Test limits:** one recipient per test; at most five new tests per user per UTC day, including cancelled tests. Tests also share the normal active-schedule and real-attempt limits. Do-not-email addresses and pending/unknown tests to the same recipient are blocked. A failed test is not automatically retried; an unknown outcome needs a Sent Items check. Rescheduling changes only pending work.

## Quick reference — where does each value go?

| Value you saved | Vercel environment variables | Supabase Function Secrets | Supabase Vault |
| --- | --- | --- | --- |
| Encryption key | `SCHEDULE_ENCRYPTION_KEY` | `SCHEDULE_ENCRYPTION_KEY` | Not needed |
| Worker secret | Not needed | `SCHEDULE_WORKER_SECRET` | `autmail_scheduler_worker_secret` |
| Default Microsoft Client ID | `MICROSOFT_SCHEDULER_CLIENT_ID` | Not needed | Not needed |
| Microsoft client-secret Value | `MICROSOFT_SCHEDULER_CLIENT_SECRET` | Not needed | Not needed |
| Worker URL from Step 6 | Not needed | Not needed | `autmail_scheduler_url` |

## If something does not work

| What you see | What to check first |
| --- | --- |
| SQL says a table/function already exists | Check whether Step 1 was already successfully applied. Do not delete existing tables or continue past an unexplained migration error. |
| Missing table/function in the website | Step 1 must be applied to `rconmqterfwuzgdgsolj`, and Vercel must use this same project's URL and keys. |
| CLI cannot deploy / project access denied | Sign in to the Supabase account with access to this project. Run from the project root. If `npx.cmd` is unavailable, check your Node.js/npm installation. |
| Admin says worker offline | Check Steps 5–7: function deployed, both function secrets saved, both Vault entries saved, Cron job active, project not paused. |
| Function logs show 401 Unauthorized | The worker secret in Function Secrets and Vault must be exactly the same. An unauthenticated dashboard test is expected to fail. |
| Cron job says succeeded, but worker is offline | Cron success can mean only that it queued the HTTP call. Check the Edge Function invocation/logs too. |
| Microsoft says redirect URI invalid | The exact `/api/microsoft/background/callback` address must be under **Web** on the same registration whose Client ID AUTMAIL uses. |
| Background access cannot be enabled | Check the Client ID matches AUTMAIL Default configuration, the client secret is its **Value** and has not expired, and Vercel was redeployed after saving variables. |
| Reconnect required | Microsoft access or the client secret may have expired/revoked. Repair it, enable background access again, then explicitly choose a new time for pending emails. |
| Needs attention after a long delay | Fix the worker/project issue, then review and choose a new time. Overdue emails do not silently catch up. |
| Outcome unknown | Check the original sender's Sent Items. Record what you verified in Schedule details. Do not automatically retry it. |

Do not share tokens, secrets, private messages, or unredacted screenshots when asking for help. An error message with private values removed is enough.

## Users who choose their own Microsoft configuration

The steps above cover the administrator's **Default configuration**, which is simplest for normal users. They do not need to enter an app secret themselves.

A user choosing **their own app registration** must add the same Web callback and delegated permissions to their registration, create their own client-secret Value, and enter it under **Scheduled emails → Background access → Your own app registration**. Do not replace the default Vercel credential with a user's credential. The rest of the Supabase setup is shared and does not need to be repeated per user.

## Capacity and Free-plan concerns

- The once-a-minute timer calls the worker even when there are no emails due: about 43,200 calls in a 30-day month. This uses the same project's function allowance as your other functions. Check Supabase Usage rather than assuming that an empty queue uses no quota.
- Up to 100 recipients / 1 MB snapshot per batch, 10 unfinished schedules per user, and 30 days ahead. The server recomputes the preview and rejects changed review hashes. Duplicate confirmation requests use an idempotency key.
- At most five sequential attempts per tick across the app, with time bounds below Supabase Free's 150-second worker duration. A full batch takes multiple ticks; it competes fairly with other due batches. These are conservative app caps, not a provider quota or exact-time guarantee.
- At most 100 real scheduled attempts per user per UTC day. This includes explicitly throttled attempts. Microsoft anti-abuse, licensing and mailbox limits may be stricter.
- A global lease prevents overlapping worker ticks. Each attempt is atomically claimed. Suppression, duplicate/unknown-send protection, original sender/configuration, account-deletion freeze and the real-sending switch are checked before the send.
- Free projects can pause for inactivity; restore them in Supabase. Cron activity is not a promise against pausing. Quota exhaustion, outages, Microsoft throttling and network delays can stop work. Overdue/no-progress schedules beyond 15 minutes require explicit review and a new time, rather than automatically catching up.
- Each saved message exists in the schedule, queue snapshot, and final history. Monitor database size and function invocations; larger/multi-user workloads can outgrow Free. Maintain independent backups/exports. Do not rely on this for critical delivery deadlines.
- Do not run a browser queue alongside an upcoming scheduled batch for the same recipient/template. Reservations protect against this even when a user permits duplicates within an intentionally reviewed batch.

## Incident and credential recovery

**Global stop:** Admin → Scheduled sending → Pause, or set `scheduled_mail_control.enabled=false` as the project owner. Already in-flight Graph calls may finish. Disabling Cron also stops future checks, but leaves the UI showing a stale heartbeat.

**Worker unavailable:** inspect Cron execution and worker logs, verify the worker secret matches Vault, check project availability/quota, and restore service. Do not reset unknown items to pending. After a long outage, users must choose a new time.

**Reconnect required:** repair Entra consent/client-secret expiry if necessary, then enable background access again. Default-secret changes in Vercel require redeployment; users must reauthorize so the worker receives the new encrypted credential. Old pending schedules stay stopped until reviewed and rescheduled. Server tokens are not recovered from SPA sessionStorage.

**Lost encryption key:** pause first. Restore the exact backed-up key in both environments, or require fresh authorization for every background connection. A random replacement cannot decrypt old records. Do not attempt to send with unreadable or stale credentials.

**Unknown outcome:** the item remains protected as unknown/`sending` in the normal queue. Only the owner can record a deliberate Sent Items check. Marking it accepted records history without sending; marking it not sent records failure without retry. A failed result requires a new deliberately reviewed attempt if wanted.

**Cancellation/account deletion:** pending work is stopped; deletion cascades through the user's schedules and private connection records. Existing Microsoft messages cannot be recalled. Retaining unknown outcomes is intentional protection, not a stuck queue to clear blindly.

## Developer verification

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run check:repo`. Scheduling worker tests mock Microsoft; they never send mail. `tests/scheduling-database.test.ts` executes the schema and migration in disposable in-memory PostgreSQL (PGlite), not your live Supabase database.

`npm run test:browser:scheduling` runs the real scheduling components and theme CSS in a lightweight isolated component preview, with fake API responses, on phone/tablet/desktop in light and dark modes. It does not validate Next.js deployment, real authentication, provider consent, or delivery. The normal Next.js browser suite remains available through `npm run test:browser`. Perform the controlled practice/single-recipient live acceptance procedure above after deployment.

References: [Supabase function deployment flags, including Docker-free deployment](https://supabase.com/docs/reference/cli/supabase-functions-deploy), [Function Secrets](https://supabase.com/docs/guides/functions/secrets), [Vault](https://supabase.com/docs/guides/database/vault), [scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [function limits](https://supabase.com/docs/guides/functions/limits), [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Microsoft authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
