# Inbox and Compose

Authenticated routes: `/inbox` uses `MailWorkspace`; `/compose` uses a dedicated `ComposeWorkspace`. Compose renders the editor directly for the saved connected sender without listing mail, requesting inbox consent, or requiring mailbox reading. Ordinary mailbox views are not seeded with fake messages. No new SQL migration is needed.

Only the explicit internal `npm run build:test-ui` command, with service credentials removed, allows `?preview=1` to enable a clearly labelled fictional design preview for browser tests. Both server and client require the internal UI-test flag and reject previews when public Supabase configuration is present. Production builds do not expose this mode, and Vercel rejects test builds. The fixture does not contact Microsoft or send real mail; its draft changes are temporary.

## Connection and permissions

The existing selected configuration and saved `home_account_id` select the Microsoft account; no first-cached-account fallback is allowed. Existing campaign scopes remain unchanged. Reading uses delegated `User.Read` and `Mail.Read`; automatic loading is silent-only and interactive reading consent requires **Enable mailbox access**. Explicit draft changes, native reply/forward drafts, and read-status changes request `User.Read` and `Mail.ReadWrite`. Direct new-email sending requests only `User.Read` and `Mail.Send`, calls `/me/sendMail` with To/Cc/Bcc/HTML/attachments and `saveToSentItems: true`, and does not create a draft first. Existing draft sends save edits with write permission and send with send permission.

Configure these as Graph **Delegated** permissions on the selected registration. A Microsoft tenant's user-consent or assignment policy may require admin approval even for the signed-in user's own mailbox. Saving IDs inside AUTMAIL is not Microsoft consent. See `/help/permissions` for the approval procedure; never bypass tenant policy or substitute Application mail permissions.

Requests use Graph v1.0 `/me` endpoints. Microsoft pagination URLs are validated against the exact Graph origin and `/v1.0/me` path before attaching tokens. GET responses are not cached. Tokens and mailbox content are not saved in Supabase. Saved drafts and manual messages reside in Microsoft.

## Safety and limitations

- Untrusted message HTML uses DOMPurify, a sandboxed iframe without scripts or same-origin privileges, and a CSP that denies network/image loads. Outlook links use a strict host allowlist. Remote CSS URLs are removed from forwarded content.
- Manual sending requires review and explicit confirmation. It does not enable campaign live sending. All To/Cc/Bcc recipients are validated and checked against the suppression RPC before sending. Recipient-protection errors fail closed. Sending a new email must not call draft-save or mail-reading endpoints.
- Native reply/reply-all/forward endpoints create drafts on an explicit action. The From mailbox is verified against Graph immediately before sending. Send failures with uncertain outcomes never automatically retry.
- Attachments on new emails have a 2 MB total cap and ten-file limit, below simple JSON payload limits. Existing draft attachments are preserved and managed through Outlook; uploads are disabled on those drafts. Downloads are explicit, capped at 10 MB, and use object URLs revoked after download.
- New drafts wrap editor, signature, and quote in independent markers. If Microsoft removes the markers or the draft originated externally, preserve its original body as a protected section rather than round-tripping rich Outlook content through a simpler editor.
- Drafts save explicitly, not automatically. Search applies only to loaded messages. No delete/archive, bulk actions, inbox notification subscriptions, Gmail provider, or scheduled send implementation.

## Verification

Unit tests cover account binding, consent behavior, Graph URL safety, pagination, validation, native reply, drafts, blocked recipients, HTML isolation, and uncertain sends. Browser tests cover real editor controls and responsive layouts using a mocked mailbox. Tests must never send real email or alter a real mailbox. Verify live consent and delivery with a dedicated test account after deployment.

See `/help/mailbox` for the end-user guide.
