This is the simplest connection path. The administrator supplies the Microsoft application setup; you choose the mailbox that will send your emails.

## Before you connect

You need a supported Microsoft mailbox: a personal Outlook.com account (including Hotmail, Live, or MSN), or a Microsoft 365 work or school mailbox. Your connection registration must allow your account type, and any organization policies must permit sending.

Your recipients can use any email provider. A Gmail address as a recipient is fine; connecting a Gmail-only mailbox as the Microsoft sender is not supported by this integration.

## Connect your own mailbox

1. Open **Settings → Email account**.
2. Keep **Administrator setup** selected. If unavailable, ask the application administrator to enable it.
3. Click **Connect account**. Allow the sign-in popup and choose the intended sending account.
4. Approve the requested basic profile and sending permissions. Organization policy may require administrator approval.
5. Check the connected sender address. This should be your intended mailbox, not merely the administrator’s address.

No client secret, manual authentication mode, or metadata reader is needed for this normal flow.

## Compose or read mail

To write an individual email, open **Compose email**. Your connected address is filled in as the sender; enter To, optional Cc/Bcc, subject, and message, then review and confirm sending. You do not need to enable Inbox first.

To read Inbox, Sent, Drafts, or Junk email, open **Inbox → Enable mailbox access** and approve delegated `Mail.Read`. Saving/editing drafts, reply/forward drafts, and read-status changes ask separately for `Mail.ReadWrite`. If Microsoft asks for administrator approval, your organization's consent policy may require it even for your own mailbox. See [Permissions explained](/help/permissions) for the exact steps.

## Test without sending

Click **Test connection**. It checks basic Microsoft Graph access without sending email. A successful connection check does not prove that mail sending or delivery will succeed.

## Send a real test only when intended

Enter an address you control and explicitly confirm **Send real test email**. This sends a real dummy message, even if campaigns are in practice mode. Check that mailbox and Microsoft Sent Items.

This separate settings test is not a campaign and is not recorded as campaign history. Microsoft acceptance is not proof of inbox delivery.

## Switch the sender deliberately

Use reconnect or switch account and choose the new mailbox. Check its address again before reviewing a campaign. AUTMAIL has one active sender per workspace and does not silently choose the first cached Microsoft account.

If sign-in fails, use [Troubleshooting](/help/troubleshooting). If you manage a different registration, follow [My own app registration](/help/custom-connection).
