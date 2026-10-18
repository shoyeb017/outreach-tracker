# Email engagement: easy setup

This adds a customizable website button to spreadsheet campaigns and scheduled campaigns. It measures **link activity, not guaranteed email reads**. It does not add a pixel, request mailbox-wide read access, or change manual Compose/replies/forwards.

## 1. Update Supabase

Open your [Supabase project's SQL Editor](https://supabase.com/dashboard/project/rconmqterfwuzgdgsolj/sql/new).

1. Back up important data. Confirm the existing admin-controls, scheduled-mail and scheduled-test-mail migrations have already been applied.
2. In VS Code, open **supabase/migrations/20261019_email_engagement.sql**. Copy the **whole file**.
3. Paste it into a new SQL query and click **Run**. Apply this migration once; do not rerun old migrations or template seeds.
4. Run **supabase/migrations/20261019_history_followups.sql** in a new SQL query after the engagement migration. This adds follow-up spreadsheet creation from Email history. If the engagement migration was already applied, do not rerun it—run only this new migration.
5. Open **supabase/engagement-maintenance.sql**, copy the whole file, and run it in a second query. It creates an hourly cleanup job named `autmail-engagement-cleanup`. If `cron` is missing, enable **pg_cron** in Database → Extensions first. Your existing scheduled-mail setup may already have enabled it.
6. Confirm the last query shows `active = true`. This cleanup job sends no emails and uses no worker secret. Check its run history in Supabase's Cron interface.

The schema migration creates server-only settings, token hashes, bounded activity counters, send-time recipient snapshots, and atomic follow-up creation. Existing template content and saved send choices are not changed. Failed migrations roll back as one transaction; investigate the first error before retrying.

## 2. Deploy the website and updated worker

1. In Vercel, confirm **NEXT_PUBLIC_APP_URL=https://autmail.vercel.app**. Use the origin only, not `/settings` or another path. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
2. Deploy the updated application. No new environment secret, Microsoft permission, or reconnect is required for link tracking itself.
3. If using scheduled campaigns, redeploy the existing **scheduled-mail-worker** Edge Function from this repository too. Its shared implementation changed. Use the deployment method in [scheduled-mail setup](scheduled-mail-setup.md); an old deployed worker cannot prepare engagement links. Keep its existing authorization and secrets.
   The migration blocks an old worker from sending engagement-enabled items and pauses that batch with an update-required explanation. After redeploying, review it and choose a new send time. Older untracked schedules can still use their original messages.
4. Keep the existing scheduler Cron job and global pause controls. The new cleanup job is separate and does not enable scheduled sending.

Vercel hosts the public recipient redirect; Supabase stores the private message/activity data. No additional always-running backend host is required. A localhost URL can be used for local development, but recipients outside your computer need a publicly reachable deployed URL. Previously sent links retain their original host; keep that domain reachable if changing domains.

## 3. Configure the button

In AUTMAIL open **Settings → Email engagement**:

1. Turn on **Add the engagement button to new campaign reviews**.
2. Enter a public HTTPS destination, such as `https://inuberry.com`.
3. Write optional introductory text and a clear button label, such as **Visit our services**.
4. Choose button/text colors, alignment, size, and placement before or after your signature. Use readable color contrast. If a template omits its signature, the section goes at the end. Existing plain closing paragraphs such as “Best regards” stay with the signature; preview custom/in-line closing layouts carefully.
5. Review the preview and click **Save engagement settings**. You do not need to edit every template or add a tag.

The separate **Record activity from existing email links** control pauses recording after you save. Turning off button insertion alone only affects future campaign reviews. Existing scheduled snapshots keep their reviewed button, destination and appearance; the collection pause still applies to all links.

## 4. Test safely

- **Preview:** all AUTMAIL preview links are neutralized, including links in Send history, scheduled previews and mailbox views. No real token is created by opening a preview.
- **Send test email:** enter your own controlled address, then explicitly confirm. This is a real Microsoft email, but its button opens the destination directly. It creates no engagement statistics. The test uses your current customization, even before saving. A connected Microsoft sender and successful recipient protection check are required.
- **Practice campaign:** creates no tracking tokens and sends no real email.
- **Real tracking verification:** send a one-recipient real campaign to an address you control, with the button included and final confirmation. Check Microsoft acceptance, wait at least 15 seconds, then open the actual received button in a separate browser/private session. This deliberately creates a real engagement record. The signed-in owner is excluded where identifiable, so clicking while signed in to AUTMAIL may intentionally not count. Visits during the first 10 seconds are flagged as suspected automated activity. Never use uncontrolled recipients for a test.

Microsoft acceptance is not delivery confirmation. If an outcome is uncertain, check Sent Items and use existing recovery controls; do not blindly resend. If test sending itself has an uncertain outcome, its test button is locked until you review and reopen the page.

## 5. Send and review activity

In a spreadsheet's **Review and send**, check **Include the engagement button in this send** and preview the final message. You may turn it off for just that campaign. Scheduled review has the same control. Newly saved schedules freeze the reviewed appearance, destination, origin and message content.

The application reserves a random opaque token **after the send item is claimed, before the Microsoft request**. That URL must already be in the outgoing body. The pending message becomes reportable activity only when the accepted outcome is persisted. No token is an email address or sequential recipient ID. A retry reuses its message token rather than generating duplicates.

Open **Email engagement** from the navigation. It shows the source spreadsheet, original campaign, recipient, template, send outcome, first/last activity and bounded counts. Filter by spreadsheet, campaign, recipient address, link activity, no activity, suspected automation, or send outcomes needing attention. Click **Refresh** to reload current activity; this is not a live WebSocket feed.

“No activity recorded” does not mean unread. Suspected-only activity is kept separate, not silently labelled a human click. Lists use 50-message pages; selections remain across pages and reset when filters change. Campaign/source dropdowns list up to 1,000 recent groups.

## 6. Create a follow-up spreadsheet

1. Choose **one source spreadsheet** to keep its column definitions consistent.
2. Filter the recipients you want. Select messages individually or choose **Select matching (up to 500)**. Only accepted messages are eligible.
3. Click **Create follow-up spreadsheet**, give it a name, and confirm **create only**.
4. AUTMAIL removes duplicate email addresses and current do-not-email/suppressed addresses. The most recent selected snapshot wins for a repeated address. If nothing eligible remains, no empty spreadsheet is created.
5. Open the resulting spreadsheet. Choose the follow-up template, check personalization, select recipients and separately confirm Send or Schedule.

Recipient values are captured when the tracked send is prepared. Column definitions and mappings are copied from the current source spreadsheet with new column IDs. The actual sent-to email is retained even if the source email column changed. New fields in a different template still need connecting. The new spreadsheet links back to its source and retains the selected original campaign IDs, visible in Spreadsheet details. It does not inherit send history, old template choices or recipient overrides. Existing duplicate protections still apply; using a different template is the normal follow-up approach.

Retries of the same follow-up confirmation return the already-created spreadsheet instead of duplicating it. Mixed-source selections are rejected; create one follow-up per source and import/merge deliberately if needed.

## Limits, privacy and Free-plan controls

- Links/activity snapshots expire **90 days after reservation**. After expiry the link is unavailable; history is deleted by the next successful cleanup batches, up to 1,000 expired records per hour. Monitor the cleanup job. Do not promise permanent links.
- At most **2,000 tracked messages per workspace**, **10,000 per project**, and **16 KB of combined source row JSON per message**. Preparation stops before contacting Microsoft when these limits are exceeded. Disable the button for a new send or deliberately clear history; do not repeatedly resume without resolving the limit.
- A conservative **400 MB database-size safeguard** also stops new engagement preparation before contacting Microsoft. This is a best-effort guard for the Free database quota, not a guarantee: unrelated writes and concurrent application data still consume capacity. Expired engagement rows are pruned in bounded batches during preparation as well as by the hourly cleanup job.
- First/last times and capped counters are stored, not an unlimited event/IP log. At most one event per minute per token/kind is counted, capped at 10,000 per kind. Rapid repeat visits are intentionally coalesced. Database timestamps are UTC; the UI displays the viewing device's local timezone.
- No visitor IP address or raw User-Agent is stored by this feature. Hosting infrastructure may keep its normal request logs, including token paths: restrict log access/retention and do not copy tracking URLs into public reports. No raw tracking token or recipient metadata is returned by the public redirect endpoint.
- Settings changes affect new reviews, not previously sent destinations. Pausing collection keeps unexpired redirects working. **Delete engagement history** permanently removes private snapshots/counters and disables those links; previously created follow-up spreadsheets and send history remain.
- Deleting a source spreadsheet, source row, send item/run, or account cascades its engagement data and disables its links. Existing delete-all-data also clears engagement settings. Plan deletion carefully and keep any follow-up data only as long as appropriate.
- Scanners, proxies, forwards and the sender opening the actual link outside an identifiable login may trigger activity. Known scanner/missing User-Agent and very early visits are separated heuristically; not all bots can be detected. HEAD/prefetch do not count. No status proves the named recipient read the email.
- Use an appropriate privacy notice and permission to contact recipients; suppression is enforced when copying and again by the normal sending workflow. This feature is not a subscription/consent-management or automatic-unsubscribe service.

Caps reduce growth but do not guarantee the entire application fits Supabase Free. Existing email snapshots, other users, request volume, bandwidth and Vercel limits also count. Monitor Supabase **Usage / Database size**, retention job failures, and public-route traffic; configure hosting abuse controls if needed. The [Supabase database-size guide](https://supabase.com/docs/guides/platform/database-size) explains the Free database quota and read-only protection. [Supabase Cron](https://supabase.com/docs/guides/cron) explains job monitoring. [Mailchimp's bot guidance](https://mailchimp.com/help/about-bot-activity/) explains why clicks cannot prove reading.

## Quick troubleshooting

- **Engagement unavailable / migration required:** apply the new migration in the correct project and verify the server service-role configuration. Do not grant the browser access to the new private tables/RPCs.
- **Button missing:** save Settings, enable the per-send control, and start a new review. Old sends/schedules are not retroactively tracked.
- **No activity after a click:** check collection is on, the send was accepted, the link has not expired, and the request was not owner/HEAD/prefetch/suspected-only activity. Check the actual link's domain is deployed and reachable.
- **Preview/test clicks do nothing:** expected. Use the controlled real-campaign verification above only when you want to test tracking.
- **Scheduled link cannot be prepared:** redeploy the worker, check the public origin, migration, source availability and quotas. No send is attempted on a link-preparation error.
- **All follow-up recipients excluded:** check current suppression and duplicates. No email or empty spreadsheet is created.

The automated suite uses fake Graph calls and an isolated SQL database. Deployment, real Microsoft delivery and production hosting controls must be verified separately with your controlled account.

## Email history and follow-up spreadsheets

- **Email history** includes results from both **Send now** and **Scheduled mail**, including accepted, failed, skipped, cancelled and practice results. Use **Sending method** to choose either. Future/pending schedules and unconfirmed outcomes remain in **Scheduled mail** until a final result is saved. The history migration also restores missing final scheduled results from saved run items; it does not send or retry anything.
- This is spreadsheet campaign history (including its practice/test results), not a copy of every message in your Microsoft mailbox. Manual Compose messages remain in the mailbox’s Sent folder.
- Select a row directly or filter by spreadsheet, result, template, date or sending method, then choose **Select matching (up to 500)**. A selection uses one source spreadsheet so column mappings stay consistent. Tests cannot be copied.
- Click **Create follow-up spreadsheet**, name it and confirm **Create only**. The next screen lets you choose a template, review recipients and separately Send or Schedule. No email is sent by creating a spreadsheet.
- History follow-ups do not require engagement to be enabled or a link visit. They use a saved engagement recipient snapshot when available; otherwise they use the current source row. The actual sent-to email is always retained in the mapped recipient column. Recent selected records take precedence when deduplicating addresses; invalid and suppressed addresses are excluded.
- **Email engagement** also supports selecting accepted messages with zero clicks. Clicking a row checkbox chooses its source spreadsheet automatically. **No recorded link visits** includes suspected-only activity; **No activity of any kind** excludes suspected activity too. These filters cannot prove an email was unread.
- History loads only list details first, then fetches one saved body when you open its preview. If loading fails, use **Retry email history**. An unavailable optional template/scheduling label does not hide the email results.
- If follow-up creation says a database update is needed, apply **20261019_history_followups.sql** once, after the engagement migration, and redeploy the website. No worker redeploy or Microsoft permission change is required for this follow-up update.
- Follow-up creation checks the conservative 400 MB database-size safeguard before copying data. This is not a quota guarantee: copied spreadsheets and other application data still use storage. Review Supabase usage and retain only the data you need.

