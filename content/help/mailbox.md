Read and write individual emails from the Microsoft account already connected to AUTMAIL. This is separate from spreadsheet campaigns: no routing or placeholder mapping is needed.

## Connect and enable mailbox access

1. Open **Settings → Email account** and connect your personal or work Microsoft mailbox using the default or your own configuration.
2. Open **Inbox** in the navigation.
3. If asked, click **Enable mailbox access** and approve Microsoft's delegated `Mail.Read` permission to read your own mailbox. Your organization may require administrator approval even for your own inbox. See [Permissions explained](/help/permissions) for user and administrator steps.

The connected address is shown above your mailbox and in the Compose window. You cannot type a different From address. Access tokens stay in the existing browser Microsoft session; mail content is fetched directly from Microsoft, not copied into the AUTMAIL database.

## Read and find email

Choose **Inbox**, **Sent**, **Drafts**, or **Junk email**. Click a message to see its sender, recipients, subject, date, body, and attachments. On a phone, use **Back to messages** to return to the list.

Search applies to loaded messages; **Unread only** is available in Inbox and Junk email. Use **Load more messages** to include older mail in your search. **Refresh** fetches the latest first page; there is no background real-time synchronization.

**Junk email** shows the connected Microsoft mailbox's Junk folder, separately from Inbox, using the same `Mail.Read` permission. Be careful with unexpected links and attachments; images stay blocked here. To move a message back to Inbox or mark it as not junk, use **Open in Outlook**.

Reading a message does not change its status automatically. Use **Mark read** or **Mark unread** explicitly; these changes ask for the additional `Mail.ReadWrite` permission if it has not been approved. External images and tracking pixels are blocked. Use **Open in Outlook** for the original layout, images, large attachments, or attached Outlook items. Downloads here are limited to 10 MB per file; open only files you trust.

## Write a new email

1. Choose **Compose email** in navigation. This opens a dedicated editor, not the Inbox screen. You only need a connected sender and `Mail.Send`; Inbox access and draft permission are not required. Your connected email is filled in as From automatically.
2. Enter one or more To addresses, separated by commas or semicolons. Cc and Bcc are optional fields shown in this editor. Cc addresses are visible; Bcc addresses are hidden from other recipients. In the smaller Compose window inside Inbox, choose **Add Cc / Bcc** to reveal them.
3. Add your subject and message. Use the formatting controls for links, lists, bold text, and alignment. No template placeholders are substituted here: this is a personal, manually written email.
4. Optionally include your configured signature and attach files. New emails support up to 10 files with a combined size of 2 MB.
5. Choose **Review and send**, check the From address, all recipients including Bcc, message, and attachments, then select **Confirm — send real email**.

Manual emails send real messages even when campaigns are in practice mode. They require separate confirmation and appear in Microsoft **Sent**, not AUTMAIL campaign history. Duplicate addresses within To/Cc/Bcc are blocked. Your suppression list is checked again before sending; if that safety check fails, nothing is sent. Manual replies are not blocked just because you previously contacted the same address in a campaign.

## Save a draft or reply

Use **Save draft** on the Compose page (or **Save draft and close** in the Inbox window) to keep an incomplete email in Microsoft **Drafts** without sending it. This asks for delegated `Mail.ReadWrite` if necessary. It is optional: a new email sends directly without first creating a draft. If draft permission is denied, your editor text stays available and a new email can still be sent with approved `Mail.Send`.

Drafts are not autosaved. Saving a draft is a real mailbox change, including in campaign practice mode. Browser navigation warns about unsaved changes; save before leaving. **Clear email** discards only unsaved editor content, not saved Microsoft drafts.

**Reply**, **Reply all**, and **Forward** create native Microsoft drafts, preserving conversation context, and therefore ask for `Mail.ReadWrite`. No email is sent until you explicitly confirm. Closing these windows keeps their Microsoft draft. Editing a saved draft also needs `Mail.ReadWrite`; sending it additionally needs `Mail.Send`.

Open Drafts and choose **Continue draft**. AUTMAIL-created drafts resume editable composition where Microsoft preserves the composition markers. Other drafts keep their existing content as a protected section below your new text to avoid losing complex formatting. You can remove that original section explicitly. Edit its original text or manage attachments in Outlook. Saved, reply, and forward drafts preserve their existing attachments; adding or removing attachments on these drafts is handled in Outlook.

## If the send result is unknown

Microsoft HTTP 202 means acceptance, not guaranteed delivery. If a network timeout or server error leaves the result unknown, sending again is disabled for that editor. Close it, refresh Sent and Drafts, and check the recipient inbox before creating another email. Never assume an error means the first message was not sent.

## Current scope

This is a focused Microsoft mailbox workspace, not a complete replacement for Outlook or Gmail. Gmail sign-in, folder management, deletion, archive, rules, scheduled sending, large-file uploads, and automatic synchronization are not included. Continue using Outlook for those operations.

## Official references

- [Read Microsoft messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)
- [Create a threaded reply draft](https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0)
- [Send a Microsoft draft](https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0)
- [Send a new email without creating a draft](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
