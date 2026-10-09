Review protects against preventable mistakes. It cannot guarantee delivery or replace your organization’s permission and outreach policies.

Keep the browser tab open while a batch runs. This is not a background or scheduled sending service; leaving the page pauses processing after in-flight work.

## Start with practice mode

Use a small list of addresses you control. Practice campaigns send no email. Review recipient selection, routing, personal values, and signature before enabling real sending.

> **Send real test email** in Settings is different: after your explicit confirmation it sends a real message, even while campaigns use practice mode.

**Compose email** is also separate from campaigns. After **Review and send → Confirm — send real email**, it sends a real personal email, even in campaign practice mode. Inbox replies use the same confirmation. These messages appear in Microsoft Sent, not campaign history. See [Inbox & Compose](/help/mailbox).

## Check the sender and destinations

Before confirming a batch, check the connected Microsoft mailbox and the spreadsheet column supplying recipient addresses. The administrator’s app setup does not automatically make the administrator the sender.

Click recipient rows to inspect the actual email preview. Confirm the subject, chosen template, company/name values, signature, and recipient address. A correct total count does not prove the rows are correct.

## Understand duplicate protection

Duplicate checks normalize email addresses by trimming spaces and ignoring case. The blocking policy checks the **same template and recipient address**, including successfully sent history and duplicates in the current reviewed batch.

This is not a universal block on every repeated email address. Two company rows with the same address but different templates can still produce two messages. Review shared inboxes deliberately and select only the intended rows.

Check your configured duplicate policy in **Settings → Sending**. A warning policy warns rather than blocks; allowing duplicates removes that protection. Practice results are not successful real sends in sent-history checks.

## Fix blocked rows instead of guessing

Rows can be blocked by missing or invalid email addresses, missing templates, skipped routing, unmapped personal fields, empty required values, blocked-address rules, duplicate policy, or an uncertain previous send.

Repair the relevant setup or exclude the row deliberately. Reopen review after changing templates, mappings, selection, or sender. Respect blocked/suppressed addresses and requests not to be contacted.

## Treat acceptance and uncertainty differently

Microsoft HTTP 202 means the request was accepted, not confirmed delivery to an inbox. Check the actual mailbox or delivery reports when needed.

If the network fails after a send request, Microsoft might already have accepted it. Keep the affected item paused and check **Microsoft Sent Items** before deciding whether to retry. Reconnecting does not prove it was not sent.

Do not repeatedly click send or automatically resend an uncertain message. Explicit throttling responses can be retried according to the app’s retry policy; an ambiguous send is different.

## Keep account information private

Never share Microsoft access tokens, passwords, application database credentials, or client secrets in spreadsheets, templates, screenshots, or support messages. A Client ID and Tenant ID identify an application; they are not a reason to share its secrets.

Only import information needed for your outreach and follow your organization’s retention and contact policies. Use the application’s Privacy settings when you need to manage stored data.

## Administrator safety: Application.Read.All

**Optional administrator feature, not a requirement for sending email.** `Application.Read.All` is used by a separate backend reader to check which Microsoft account types an app registration supports. It is not an Inbox permission and does not let AUTMAIL send email on its own.

This permission grants broad access to application and service-principal metadata across the Microsoft organization, so an authorized Microsoft administrator must review and approve it. AUTMAIL's configured app allowlist limits its own queries, not the underlying Microsoft permission. Never ask ordinary users to grant it as a workaround for a connection, consent, or sending error. See [Microsoft's permission definition](https://learn.microsoft.com/en-us/graph/permissions-reference#applicationreadall).

The notice **“Account-type metadata is unavailable”** means the optional check is unavailable; it does not, by itself, block mailbox sign-in. You can leave **Automatic sign-in** selected. If an administrator needs verified detection, follow the [Application.Read.All setup and safety steps](/help/permissions#optional-administrator-metadata-reader). Keep reader secrets server-only and separate from the sending registration's delegated mail permissions.

## Recover in a controlled order

1. Stop or pause the affected batch.
2. Record the exact error and intended sender without exposing credentials.
3. Inspect the affected recipient and Microsoft Sent Items if the outcome is uncertain.
4. Fix the connection or row data using [Troubleshooting](/help/troubleshooting).
5. Review again before any deliberate retry.
