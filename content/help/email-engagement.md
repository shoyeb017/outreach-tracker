Email engagement measures activity on a website button in your campaign emails. It does not prove an email was read or identify who clicked.

## Configure once

Open **Settings → Email engagement**. Turn on the button, enter a public HTTPS website, write optional introductory text, and choose the label, colors, size, alignment and position before or after your signature. Save your settings. Templates do not need a new placeholder.

The button is added to spreadsheet campaigns and scheduled campaigns, not manual Compose, replies or forwards. Each real outgoing message gets a different private link. The record is pending until Microsoft acceptance is saved. Failed, practice and test sends do not become accepted engagement records.

## Preview and test without affecting activity

Previews never follow recipient tracking links. **Send test email** sends one real email after confirmation, but its button goes directly to your website without tracking. Practice sends create no tokens.

Your signed-in sender visits are ignored when identifiable. Opening the actual sent link while signed out can still create activity. Forwarded emails and security scanners can trigger links too. No “Seen” or “Unread” claim is made.

## Review before sending

In a spreadsheet's **Review and send**, choose whether to **Include the engagement button in this send**. Preview the email, then confirm sending or scheduling separately. A saved schedule retains the reviewed button and destination even if Settings later changes.

## Understand the activity list

Open **Email engagement** in the navigation and click **Refresh** when needed. Filter by spreadsheet, original campaign, recipient email or activity:

- **Link activity recorded:** a visit was recorded, not proof of a human read.
- **No activity recorded:** no ordinary or suspected visit has been recorded; this is not the same as unread.
- **Suspected automated activity:** known scanner/missing User-Agent or very early requests were observed. This is a heuristic, not perfect bot detection.
- **Send outcome needs attention:** acceptance was not confirmed. Check Send history and Microsoft Sent Items before retrying.

Details show first/last activity times and counts. Repeated requests within a minute are coalesced and counters are capped. HEAD and prefetch requests do not count. Times use your viewing device's local timezone.

## Create a follow-up

1. Choose one **Source spreadsheet** so its columns and mappings remain consistent.
2. Filter messages, then select individual accepted messages or **Select matching (up to 500)**. You can select across pages; changing filters clears selection.
3. Click **Create follow-up spreadsheet**, name it, and confirm creation only.
4. Open the new spreadsheet, choose your follow-up template, check personalization and select recipients.
5. Preview and separately confirm **Send** or **Schedule**.

Duplicate addresses and addresses on your current do-not-email list are removed. For repeated addresses the most recent selected snapshot is used. Values captured when preparing the original send and the current source columns/mappings are copied; the sent-to email is preserved. No original campaign history or template choices are copied. New template fields may need connections. Normal duplicate checks still apply when sending.

The follow-up detail page keeps a link to its source spreadsheet and the original campaign IDs, so you can trace where its recipients came from.

Creating a spreadsheet does not send mail. If all selected recipients are blocked or duplicate, an empty spreadsheet is not created.

## Pause, expiry and deletion

Settings has two independent controls. Disabling **Add the engagement button** changes future reviews. Disabling **Record activity from existing email links**, then saving, pauses collection while unexpired redirects continue working.

Links and records expire after **90 days**. Expired history is removed in hourly cleanup batches. Limits are **2,000 tracked messages per workspace**, **10,000 per project**, **16 KB per captured source row**, and **500 selected messages per follow-up**. A preparation error stops the email before a Microsoft send attempt. Do not repeatedly retry without addressing its cause.

A conservative **400 MB database-size safeguard** also stops new tracking preparation. Ask the administrator to review usage or start a new reviewed send without the button. Existing application data and concurrent writes still require monitoring; these safeguards do not guarantee the whole project fits a Free plan.

Deleting engagement history, its source spreadsheet/row, original send run/item, or account disables the affected links. Already-created follow-up copies and ordinary send history are separate. Deletion is permanent; pause recording if you only want to stop collecting activity.

Administrators must apply **20261019_email_engagement.sql**, run **supabase/engagement-maintenance.sql**, deploy the website and redeploy the existing scheduler worker. No new Microsoft permission is needed for link tracking. The full setup guide is **docs/email-engagement-setup.md** in the repository.

Use appropriate contact permissions and a privacy notice. No visitor IP or raw User-Agent is stored by this feature, but hosting request logs may contain tracking URLs. For a real tracking check, use one controlled real campaign; the ordinary test button intentionally does not create statistics.

## Follow up with or without a click

You can select a Microsoft-accepted message in Email engagement as soon as it is listed. No link visit is required. Select its checkbox to choose the source spreadsheet automatically, or choose a spreadsheet first and select matching recipients. The “No recorded link visits” filter includes messages with suspected-only activity; “No activity of any kind” excludes those too.

For older emails that had no engagement button, open **Email history** instead. Filter send-now or scheduled results, choose recipients from one spreadsheet and select **Create follow-up spreadsheet**. Tests are excluded. This copies data only: choose a template and review before a separate Send or Schedule confirmation. Duplicate, invalid and do-not-email addresses are excluded. Current spreadsheet data is used unless a send-time engagement snapshot is available.

Scheduled email results appear in Email history after processing, including failed, skipped and cancelled results. Future/pending schedules and unconfirmed outcomes are managed in **Scheduled mail**, not treated as successfully sent. Manual Compose messages are in your mailbox’s Sent folder.

