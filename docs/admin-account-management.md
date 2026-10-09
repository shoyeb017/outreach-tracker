# Administrator account management

## Install before deploying

Back up the database. Apply `supabase/migrations/20261009_admin_controls.sql` after the existing admin migration and Storage policies. The migration creates controls; it does not delete any accounts. No new environment variables are required. Existing administrator credentials use the shared sign-in page.

## Workflow

1. Open **Administration → Users**. Search the user's name or account email, or filter by saved sender / pending cleanup. Accounts without a profile are included.
2. Choose **Manage account**. Review identity, last sign-in, sender metadata, and workspace usage. This page does not expose mailbox contents, passwords, or tokens.
3. **Disconnect sender** clears the saved AUTMAIL connection with an audit event. The user must reconnect in Settings. Microsoft consent and browser-held Microsoft tokens are not revoked.
4. **Delete account** requires the exact account email and an irreversible-deletion acknowledgement. Stop active campaigns first. Administrator accounts, the configured administrator email, and the current administrator are protected on the server.

## What deletion does

The server records an audited deletion checkpoint and freezes the target workspace before removing anything. It disables Auth sign-in, removes files beneath the user's UUID folder in `imports` and `signature-assets` through the Storage API, then hard-deletes the Supabase Auth user. Existing `ON DELETE CASCADE` relationships remove profiles, personal templates and versions, spreadsheets, recipients, mappings, campaigns and items, history, signature blocks, suppression entries, preferences, and personal Microsoft configurations.

Shared system templates and application-default Microsoft configuration are preserved. Admin audit events and a minimal deletion checkpoint (user UUID, status, update time) remain. The temporary confirmation email is cleared after completion. Public signature links in previously sent emails will stop working once their images are deleted.

The Microsoft account, actual mailbox, and messages already sent are not deleted. No in-flight Microsoft request can be recalled. The app cannot revoke Microsoft tokens independently held by a browser.

## Interrupted cleanup

Partial cleanup cannot be rolled back. The account remains locked. Open **Users → Cleanup needs attention**, choose the account, and retry cleanup. A two-minute lease prevents overlapping deletion requests. Timeouts may require waiting for that lease to expire. Retries remove remaining files and finish the Auth/audit checkpoint, even if Auth deletion already succeeded.

Do not delete Storage metadata using SQL: use the Storage API so underlying files are removed. Unexpected files in other buckets or outside the AUTMAIL UUID prefix require manual support; the app does not broaden its deletion scope to remove them. Very large workspaces may need multiple cleanup passes. A checkpoint should not be manually removed while an old session could still be active.

## Staging verification

Use disposable users in a separate staging project, never real customer accounts:

- Create two users with imports, signature assets, templates, recipients, and campaign history. Search for an Auth account whose profile is missing.
- Confirm non-admin and cross-origin requests cannot execute account controls. Confirm administrator and current-account deletion/disconnection are rejected by the service-only RPCs.
- Disconnect one sender; verify the other user and application defaults remain unchanged.
- Delete one disposable user and verify both Storage buckets and all owned database rows are removed; shared templates, defaults, the second user's data, and audit events remain.
- Retain an old JWT and verify the deleted/locked user cannot read/write workspace tables or upload files, or call the Microsoft configuration endpoint.
- Force Storage failure and audit failure. Verify the account stays locked and cleanup is visible and resumable, including failure after Auth deletion.
- Verify default Microsoft settings can still be saved while another account awaits cleanup.

Unit/browser tests do not prove deployed grants, RLS, cascade behavior, or Storage operations. Complete these checks before enabling destructive account controls in production.
