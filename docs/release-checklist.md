# Production release checklist

## Repository and build

Run these checks sequentially:

```powershell
npm.cmd ci
npm.cmd run check:repo
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd audit --omit=dev
```

The normal production build requires valid application/Supabase settings. It rejects missing settings, Vercel loopback URLs, secret keys in the public-key variable, and internal UI-test mode on Vercel. No demo workspace is automatically enabled.

Only `.env.example` belongs in Git. Keep actual environment files, service-role keys, tokens, private keys, build output, test reports, and machine-specific settings out of commits. The repository check is a basic credential/artifact check, not a substitute for reviewing the complete staged diff.

Developer UI tests use `npm run build:test-ui`. They are explicitly isolated from real service credentials and are not deployment builds. Always finish with the normal production build.

## Hosting configuration

- Set the six deployment entries from `.env.example` in the hosting provider. Use the actual HTTPS website origin for `NEXT_PUBLIC_APP_URL`.
- Use only the public anon/publishable Supabase key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Set `ADMIN_LOGIN_EMAIL` and a strong, unique `ADMIN_LOGIN_PASSWORD` server-side. Verify the shared sign-in, expiration, logout, and password rotation. No hash script or separate Supabase admin signup is required. If intentionally retaining provider mode with the environment password unset, verify the Supabase account and enabled `application_administrators` role instead. Remove both admin values to disable access entirely.
- Configure Supabase Site URL and the deployed `/auth/callback` redirect. Configure each approved preview/custom domain deliberately.
- Add the exact deployed `/settings` SPA redirect to the selected Entra registration.
- Verify delegated `User.Read`/`Mail.Send`; add `Mail.Read` for mailbox reading and `Mail.ReadWrite` for draft/read-status changes. Follow company consent policy. See the in-app permission guide.
- Optional backend registration metadata detection is documented separately in `admin-microsoft-setup.md`; it is not required for ordinary Microsoft sign-in or sending.

## Supabase upgrades and authorization

- Back up existing data. Apply any missing prior signature migrations, then `20261008_guided_workflow.sql` and `20261008_admin_microsoft.sql` in order. Do not rerun template seeds just to deploy UI changes.
- Verify security-limit and recipient-protection RPCs are installed with their intended grants. Service-role-only administrator RPCs must not be exposed to ordinary users.
- Run the two-user RLS checks in `supabase/README.md`: neither user may read or change the other's spreadsheets, templates, signatures, history, or Microsoft configurations.
- Check environment-session tampering and password rotation (or role removal in provider mode), wrong-account access, CSRF rejection, login throttling, audit failure, and default-configuration ownership.
- Confirm the signature-assets storage bucket policies and public asset exposure are intentional.
- Apply `20261009_admin_controls.sql` after the existing admin migration and Storage policies. Test account search, protected-admin rejection, sender disconnection, and deletion on disposable staging accounts only. Verify Storage removal, cascading data deletion, old-JWT denial, and retry after an interrupted cleanup. See `admin-account-management.md`.

## Staging acceptance before rollout

- Register, confirm email, sign in/out, reset/change password, and verify safe callback destinations.
- Import CSV and multi-sheet Excel, select emails/templates, map custom placeholders, review missing fields, and confirm transaction failures do not partially save setup.
- Verify template creation/edit/archive, signature ordering/logo sizing, dataset selection, and history previews.
- Run a practice campaign and confirm it issues no Graph send request. Changing Settings must not turn a resumed practice into a real send.
- Verify suppression, duplicate protection, selected sender binding, expired session recovery, and admin consent.
- Open Inbox/Sent/Drafts, verify reading-only consent, then compose a new email without Inbox access. Check To/Cc/Bcc, attachments, drafts, and native replies.
- Any real test email needs explicit approval and a controlled recipient. Check Sent Items and the recipient inbox; Graph acceptance is not proof of delivery.
- Force an uncertain send response. The application must pause or lock retries until the operator checks the actual mailbox.
- Check light/dark themes, phone/tablet/desktop layouts, keyboard navigation, dialog focus, reduced motion, and long text.
- Review all dependency advisories, including developer tooling. Do not apply breaking forced upgrades just to hide an audit report.

## Known operational limits

Sending campaigns run in the browser, not a background worker. Keep the tab open; navigation pauses queued work, and in-flight outcomes may be uncertain. Search in Mail applies to loaded messages. History views show the latest 1,000 records; duplicate protection checks complete successful history independently. Signature assets are public and retained for snapshot integrity.

Automated tests and builds do not verify deployed RLS, migrations, Microsoft policy, or actual delivery. Complete the staging checks before approving a production rollout. Deployment and migrations are manual; neither is performed by a GitHub push alone.
