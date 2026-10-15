Schedule reviewed spreadsheet emails to send while your browser is closed. **This feature requires the administrator’s one-time setup below.** No separate VPS is needed: the website stays on Vercel and the background worker runs on Supabase.

## For users: schedule an email batch

1. Open **Scheduled emails** in navigation. Check that the background worker is available.
2. For real emails, connect your sender in **Settings → Email account**, then choose **Enable background access** in Scheduled emails. Approve access using the same Microsoft mailbox. This is separate from your browser-only mailbox session. Practice schedules do not need a Microsoft connection.
3. Open a spreadsheet, finish its template and personalization setup, and select up to **100 recipients**.
4. Under **Review & send**, choose **Schedule for later**. Check every ready email using Preview. Blocked rows are shown with a reason and are left out.
5. Choose a start time. The timezone is displayed explicitly and comes from your device. Choose at least 5 minutes and at most 30 days ahead.
6. Check the confirmation box and confirm. You will open Scheduled emails. You may close the browser afterward.

The mode comes from your Sending settings: **Real emails** sends real mail; **Practice** only records a simulation. It is saved with the schedule and never silently changes from practice to real. Turning real sending off pauses pending real schedules.

## Send a scheduled test email — no spreadsheet needed

To check the complete background-sending flow, open **Scheduled emails → Test scheduled sending → Schedule a test email**. Enter one recipient address you control and a send time. Check the displayed sender, timezone and fixed dummy-message preview, then check the confirmation box and confirm. This sends **one real email**, not a simulation. It requires Real sending on, background access, and a healthy enabled worker; it cannot bypass missing worker setup.

The test is listed as **Scheduled test email** in Upcoming and later History or Needs attention. Open View details to refresh results, preview, pause, cancel, or change the pending send time. Check Microsoft Sent Items and the recipient inbox/Junk too. Successful/failed results also appear in Send history marked as tests, with no fake spreadsheet or campaign duplicate record.

You can create up to five tests per UTC day, including cancelled tests. The normal schedule/attempt limits and do-not-email checks still apply. Another pending or unknown test to the same address must be dealt with first. Unknown outcomes are never automatically retried.

Deleting application data also removes these standalone tests and their message history. It cannot recall an in-flight email. Minimal daily usage counters remain until the worker's automatic cleanup so deleting history does not reset safety limits.

Administrators must apply **supabase/migrations/20261016_scheduled_test_mail.sql** after the first scheduling migration, then deploy the website update. No additional Cron job, worker, Microsoft permission or secret is needed if the scheduler is already working.

## See upcoming sends and results

**Upcoming** shows pending or paused schedules. **Needs attention** shows problems and completed batches with issues. **History** shows finished or cancelled schedules. Results update when you choose **Refresh**. Each schedule opens its recipients, exact saved messages, attempt counts, status, and reason.

- **Scheduled / Pending:** waiting for the chosen time or a safe retry after Microsoft explicitly throttled the request.
- **Sending:** an attempt is in progress. Do not retry it elsewhere.
- **Accepted by Microsoft:** Microsoft accepted the email for sending. This does not prove delivery or that it avoided Junk. Check Sent Items and recipient delivery if necessary.
- **Practice completed:** no real email was sent.
- **Skipped:** a safety check blocked the row; the reason explains why.
- **Failed:** Microsoft rejected the email, or the bounded throttling retries were exhausted. It will not be automatically resent.
- **Outcome unknown:** a connection/worker interruption or ambiguous Microsoft response occurred after the send began. It will never be automatically retried.
- **Paused / Reconnect required / Needs attention:** pending emails are stopped until you take the stated action.
- **Cancelled:** remaining pending emails were cancelled. This cannot recall mail already handed to Microsoft.

Successful/failed outcomes also appear in **Send history**. Scheduler-owned runs cannot be resumed through the browser queue.

## Pause, cancel, or choose a new time

Open **View details**. Pause stops new attempts; Cancel stops the remaining pending emails. A request already handed to Microsoft may still complete.

**Choose a new time** only schedules pending recipients again. It does not retry failed, accepted, practiced, skipped, cancelled, or unknown emails. The saved email snapshot stays the same. To change the recipient or message, cancel the remaining batch and create a new reviewed schedule.

For an unknown outcome, first check the **original sender’s Microsoft Sent Items** and, where needed, the recipient. Record **I found it in Sent Items** or **I checked: it was not sent** only when sure. Neither action sends anything. Leave it unknown if uncertain. After resolving unknown outcomes, you can choose a new time for the still-pending recipients. Deliberately create a new reviewed schedule if a confirmed-unsent failed row needs another attempt.

## Background access and reconnecting

Access is renewed on the server when Microsoft permits it. Signing out of AUTMAIL or closing the browser does not disconnect confirmed schedules. Microsoft may revoke access, require consent/sign-in, or reject an expired application credential. AUTMAIL then stops the affected schedules and explains what to do.

Disconnecting your Microsoft sender, changing its app configuration, or disconnecting background access stops pending real schedules. Enabling background access again does **not** release old schedules automatically: review and choose a new time. Rescheduling requires the original sending mailbox.

People using the administrator’s **Default configuration** do not enter application secrets. People using **their own registration** must add the Web redirect URI and supply that registration’s client-secret **Value** when enabling background access. It is encrypted server-side; it is never returned to the browser. This does not request your Microsoft account password.

## Supabase Free limits and safeguards

This is suitable for modest, non-critical outreach—not guaranteed exact-time delivery.

- Supabase may pause inactive Free projects. While paused, Cron, the database and worker cannot process your schedules. Restore the project in Supabase. The app blocks new schedules if no worker heartbeat was seen in five minutes.
- Each tick attempts at most **5 emails sequentially across the app**. A 100-recipient batch normally needs at least 20 worker ticks; other batches and throttling can make it take longer. Times mean **start around this time**, not instant completion.
- A schedule that has not started or made progress for over **15 minutes** stops for review after the worker returns. It does not silently send a burst of old emails after downtime. Choose a new time explicitly.
- App limits: 100 recipients per schedule, 10 active schedules per user, 30 days ahead, a 1 MB reviewed snapshot, and 100 real scheduled attempts per user per UTC day. Microsoft can enforce lower sending limits. This is not a bulk-mail allowance.
- The worker stops taking new work before its Free-plan execution window ends. A killed worker leaves unknown attempts protected from automatic retry. Explicit HTTP 429 throttling gets at most three attempts; ambiguous timeouts/server responses do not.
- Stored snapshots and Send history consume database space. Monitor Supabase database/function usage. Free has no paid uptime guarantee and does not include downloadable managed database backups; maintain independent exports/backups. Do not use this for urgent, legal, medical, payment, or other critical deadlines.

## Administrator: one-time setup

Use your **existing** Supabase project. You do not need to create another project or buy separate backend hosting. These are administrator tasks performed once, not steps that every user must repeat.

Open **docs/scheduled-mail-setup.md** in the repository for the full beginner checklist. It contains your existing project's dashboard link, copy-ready deployment command, and a check after every step. Keep scheduled sending paused until setup is complete.

1. **Supabase → SQL Editor:** paste and run the whole **supabase/migrations/20261015_scheduled_mail.sql** file after your previous migrations. If already successfully applied, do not run it again. Do not re-run the initial schema.
2. **Microsoft Entra → your default app registration:** add **Web** redirect `https://autmail.vercel.app/api/microsoft/background/callback`. Keep the existing **SPA** redirect `https://autmail.vercel.app/settings`. Keep delegated **User.Read** and **Mail.Send**; AUTMAIL requests **offline_access** when enabling background access. Organization consent rules still apply.
3. **Microsoft Entra → Certificates & secrets:** create a client secret. Save its **Value**, not Secret ID, and copy the app's **Application (client) ID** from Overview.
4. **Your computer → project terminal:** run `node scripts/generate-scheduler-secrets.mjs`. Save the two printed values privately. Do not regenerate a separate encryption key for each dashboard.
5. **Vercel → Environment Variables:** save the encryption key, default Microsoft Client ID, and client-secret Value using the names in the table below. Local `.env.local` changes do not update the live website.
6. **Supabase → Edge Functions → Secrets:** save the encryption key and worker secret. Then upload **scheduled-mail-worker** using the command in the repository guide. It already points to your project and does not require Docker.
7. **Supabase → Integrations → Vault:** save the worker URL and the same worker secret. Then paste and run **supabase/schedule-worker-cron.sql** in SQL Editor. **Cron** means the timer that checks once a minute. Do not create a second timer manually.
8. **Vercel / AUTMAIL:** deploy the new website code and variables. In **Admin → Scheduled sending**, click **Refresh health**. Once it says **Worker checking in**, enable scheduled sending. Test one **practice** schedule first, then authorize background access and test one real email to yourself.

| Value | Where to save it |
| --- | --- |
| Encryption key | Vercel and Supabase Function Secrets: **SCHEDULE_ENCRYPTION_KEY** |
| Worker secret | Supabase Function Secrets: **SCHEDULE_WORKER_SECRET**; Vault: **autmail_scheduler_worker_secret** |
| Default Microsoft Client ID | Vercel: **MICROSOFT_SCHEDULER_CLIENT_ID** |
| Microsoft client-secret Value | Vercel: **MICROSOFT_SCHEDULER_CLIENT_SECRET** |
| Worker URL | Supabase Vault: **autmail_scheduler_url** |

**Function Secrets and Vault are different screens.** The worker reads Function Secrets; the timer reads Vault. That is why the worker secret must be saved in both places with exactly the same value.

Entra setup, environment variables, SQL migration, function deployment, and Cron activation are required. A GitHub push alone does not activate this feature.

## Security and recovery

Refresh tokens and client credentials are authenticated-encrypted with a server-only key in service-role-only tables. Browser APIs return connection status, not credentials. Signed-in users can only read/manage their own schedules. Worker calls need the private worker secret. Authorization uses PKCE and one-use, expiring state bound to the logged-in user and a secure cookie.

Rotate expired Microsoft credentials deliberately: pause schedules, update the credential, reconnect background access, then review pending recipients and choose a new time. Do not rotate the encryption key without a migration/reconnection plan; losing it makes saved credentials unreadable. Never put any secret in a `NEXT_PUBLIC_` variable or commit `.env.local`.

The global **Admin → Scheduled sending → Pause** switch stops new attempts for everyone. It cannot undo in-flight requests. Missing/invalid credentials, access revocation, unavailable safety checks, or a database write failure must never cause blind retries.

## Official references

- [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase production availability checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Microsoft authorization-code flow and offline access](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft sendMail acceptance semantics](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
