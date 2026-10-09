# Administrator and Microsoft upgrade

This upgrade stays on Next.js 16, Supabase, MSAL Browser 4.30, and delegated Graph sending. No new framework or package is required. It adds `/admin/login`, `/admin`, `/admin/microsoft-settings`, `/admin/users`, `/admin/security`, and the public `/help` center. Users can save multiple registrations, but the existing tracker intentionally retains one active sender per workspace.

## 1. Database setup — manual, back up first

Apply the existing guided-workflow migration if not already installed, then apply `supabase/migrations/20261008_admin_microsoft.sql` in a staging Supabase project. The new migration is additive: it does not delete contacts, templates, spreadsheets, history, or old connection metadata. Valid legacy IDs are copied to private configuration records. Legacy senders must explicitly reconnect because no selected MSAL account identity was previously saved.

New tables: `application_administrators`, `microsoft_default_configuration`, `microsoft_user_configurations`, `admin_audit_log`, `security_rate_limits`. New Microsoft integration fields associate the active registration, home-account identity, display name, authority, and account type. No tokens are stored.

For the enriched dashboard and account-management tools, also apply `supabase/migrations/20261009_admin_controls.sql` after Storage policies are installed. Follow the [account-management guide](admin-account-management.md) for deletion safeguards, cleanup retries, and required staging verification.

RLS permits users to read only their own custom configurations and their own administrator-role record. Configuration writes use authenticated server endpoints with explicit owner filters. Default settings, rate limits, and audit records have no browser access. The two service-role-only RPCs provide atomic rate limiting and a transactional default-settings save/audit/sender invalidation. Never grant those RPCs to `authenticated` or `anon`.

Private owner-only deletion remains available for the existing privacy reset. Microsoft connection insert/update metadata is guarded on the database as well as the server. A version check and row locking reject stale connection writes after configuration edits or selection changes. Privacy reset also deletes the new personal configurations; it does not delete platform defaults or administrator audit history.

## 2. Production administrator

1. Set `ADMIN_LOGIN_EMAIL` and `ADMIN_LOGIN_PASSWORD` in your uncommitted `.env.local` for development, or in the hosting provider's environment settings for deployment. Use a long, unique password. There is no additional app-level eight-character minimum, but short passwords are not recommended for production. No hash script or separate administrator signup is needed.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Existing public Supabase URL/key remain unchanged. The admin migration above is still required for rate limiting, auditing, and Microsoft settings; it is not an administrator signup.
3. Set `NEXT_PUBLIC_APP_URL=https://autmail.vercel.app` in Vercel for production (origin only, no path or trailing slash). State-changing endpoints reject mismatched/missing Origin headers. Restart locally or redeploy after changing environment values. For local development, keep the actual local origin instead.
4. Open `/login`, the shared sign-in for users and administrators. Use the configured email and password to enter `/admin`; normal users continue to use Supabase sign-in for their workspace. `/admin/login` redirects to the shared form.

The environment administrator works in both development and production, not just on localhost. Its signed session lasts eight hours and uses an HTTP-only, Secure (production), SameSite=Strict cookie. The existing server-only service key supplies signing entropy; the password is never placed in a cookie or browser bundle. Changing the admin password/email, application origin, or service key invalidates existing environment sessions. Every admin page/API validates the session. Environment audit events identify the configured email, with no Supabase user UUID. Signing in as a normal user or signing out clears the administrator cookie.

Admin login is persistently limited to eight attempts per fifteen-minute window, with a shared global cap. Login results and default configuration saves are audited without passwords or tokens. Security infrastructure failures fail closed. Never commit real passwords in `.env.example`, and never use a `NEXT_PUBLIC_` prefix for admin credentials. In `.env.local`, escape any literal `$` in the password as `\$`, because Next.js expands environment references. Environment login does not provide MFA; protect hosting/environment access and use a strong unique password.

For compatibility with existing deployments only, leaving `ADMIN_LOGIN_PASSWORD` unset retains Supabase administrator authentication: the configured email must belong to a confirmed Supabase account with an enabled `application_administrators` role. Role removal takes effect on the next request in that mode. When an environment password is set, it is authoritative—Supabase credentials cannot bypass it. Removing only the password switches back to provider mode; remove both admin environment values to disable administrator access entirely. No obsolete local-login flags are used.

## 3. Administrator default registration

Follow `/help/microsoft-setup` in the app. Register the actual origin's `/settings` URL under **Single-page application**. Add Microsoft Graph **delegated** `User.Read` and `Mail.Send`. Do not create a secret merely for delegated sending. `/auth/callback` is Supabase authentication, not the Microsoft popup callback.

For production, the SPA redirect is `https://autmail.vercel.app/settings`. Configure `https://autmail.vercel.app` as the Supabase Site URL and `https://autmail.vercel.app/auth/callback` in Supabase's Redirect URLs, not on the Microsoft sending registration. Follow the [production domain setup manual](deployment.md) for the separate provider steps and confirmation/reset URLs.

In `/admin/microsoft-settings`, save the Client ID, owning Tenant ID, friendly name, enable-default flag, and allow-personal-configurations flag. Existing default senders disconnect when settings change. Refresh validation separately. Destructive replacement asks for confirmation; changes and audit insertion are transactional.

Email account settings now follow three steps: connection setup → Microsoft sending account → testing. New users start with the administrator setup selected, and Connect account persists that choice before opening Microsoft sign-in. Existing explicitly saved personal setups are retained. Browsing another setup does not silently change the connected sender; connecting or selecting a different saved registration asks for confirmation when replacing one.

The no-email connection check verifies the saved account through Graph. The real test email separately confirms sending and can target a Gmail inbox. Both act on the displayed sender, and controls are disabled during a real test send. Changing accounts/configurations clears previous connection-check results. Configuration diagnostics are kept in an expandable section; there is no additional expected-sender field to configure. Gmail sending itself is not implemented; a Gmail identifier for a Microsoft account does not grant access to Google's mailbox.

## 4. Optional verified automatic audience detection

Client ID and Tenant ID cannot reveal `signInAudience` anonymously. For registrations you administratively control, create a separate backend reader identity in the owning tenant, grant **Application.Read.All application permission** with administrator consent, and configure:

- `MICROSOFT_READER_TENANT_ID`
- `MICROSOFT_READER_CLIENT_ID`
- `MICROSOFT_READER_CLIENT_SECRET` (backend reader credential only; not the sending app's browser secret)
- `MICROSOFT_READABLE_APP_IDS` (explicit comma-separated allowlist of registration Client IDs)

The backend obtains a Graph token and reads only `signInAudience` through `/applications(appId='…')`. Requests use fixed Microsoft hosts, validated IDs, timeouts, and no-store caching. The reader is never used to inspect arbitrary unrelated tenants. Reader secrets/access tokens are never returned to browsers or saved in the app database. A certificate/federated reader deployment can replace the credential provider in a separate approved hardening task; delegated sending itself needs none of these reader credentials.

Verified and failed metadata checks cache for at most five minutes. Neither a metadata-reader failure nor an absent reader prevents ordinary sign-in. Refresh and connection force revalidation. Configuration edits clear verification. CAS protects against delayed validation overwriting newer settings. Changed authority invalidates sender use until explicit reconnect. MSAL instances are keyed by registration/client/authority, initialization is deduplicated, and token acquisition uses the saved home-account ID—not the first cached account. Interactive renewal occurs only for MSAL interaction-required errors. Local disconnect clears the selected app/account cache and saved sender; it does not sign the user out of every Microsoft service.

Third-party registrations usually cannot be inspected by this reader. Missing metadata no longer blocks connecting: save the IDs and leave **Automatic sign-in** selected. The app starts at `/common` and retries the exact saved Tenant ID once only when Microsoft returns AADSTS50194 (single-tenant/common endpoint mismatch). It stores that endpoint with the owner's selected connection; this does not claim the registration's audience was verified. Known metadata and explicit overrides take precedence. No directory-reading permission or client secret is requested from ordinary users. If the app owner changes account types without an authorized reader, re-save the configuration to clear a learned endpoint or choose the matching optional advanced override.

If a personal-only registration does not provide an owning directory ID, users may leave Tenant ID blank only with the explicitly selected Personal Microsoft accounts only fallback. The stored identifier then uses Microsoft's shared personal-account tenant, not a fabricated company directory; its login authority remains `/consumers`. This does not grant the reader permission to inspect that registration.

Workspace logout clears cached tokens for initialized and user-owned/current registration Client IDs before ending the workspace and local admin sessions. It uses MSAL cache APIs, not indiscriminate browser storage deletion, and does not claim to log out every Microsoft service. Other browsers are not cleared remotely.

## 5. Sending and diagnostics

The account picker selects the sender explicitly. The backend verifies its basic mailbox profile through `/me` before saving metadata. Account type is sign-in-reported metadata, not an authorization role. Token responses must include delegated Mail.Send before sending. Connection tests do not send email or prove Exchange policy/delivery. Real test messages retain separate recipient entry and confirmation, mailbox checks, and uncertain-outcome retry protection.

No manually entered expected sending address is needed. The connected Microsoft account determines the sender. The removed legacy `expected_email` restriction is cleared when selecting, connecting, verifying, or disconnecting a sender, including on databases with the original guard trigger still installed. No additional migration is needed for this removal. Saved MSAL account identity, Graph profile matching, and the From-account checks during actual sending remain enforced.

Email requests use the selected account's Graph token with `/me/sendMail`. HTTP 202 preserves the existing `sent` database status for compatibility, meaning **Microsoft accepted**—not delivered. Unknown successful status codes, network failures, and ambiguous server outcomes are not blindly retried. No arbitrary From address or Graph endpoint is accepted.

MSAL 4.30 supports the existing `/settings` popup redirect and does not export the MSAL 5 redirect bridge. No dependency upgrade or unused callback was introduced.

## 6. Required staging acceptance

- Apply migrations against a backup; verify SQL execution, constraints, and rollback behavior.
- Test administrator login, disabled role, missing environment, normal-user denial, Origin rejection, persistent rate limits, and audit insertion failure. Confirm that obsolete local-test flags cannot bypass provider authentication.
- Use two real Supabase users: verify neither can read/update the other's configurations, nor access default/audit/rate tables or service-only RPCs. Test API foreign IDs as well as direct RLS queries.
- Test all four supported audiences with authorized registrations and personal/work accounts. Verify reader allowlist, tenant restriction, fresh detection, missing consent, cache expiry, and remote audience changes followed by reconnect.
- Test popup and redirect matching on localhost and deployed domains. Test multiple cached accounts: the saved sender must remain explicit. Switch app/account, sign out/in as another workspace user, and confirm no cached account is silently reused.
- Confirm campaigns and new Compose emails use User.Read/Mail.Send without Mail.Read or Mail.ReadWrite. For optional Inbox/Sent/Drafts/Junk email reading, configure delegated Mail.Read and verify the separate Enable mailbox access consent action. Verify draft changes, native reply/forward drafts, and read-status changes request Mail.ReadWrite only on an explicit action. Check organization approval policy even for own-mailbox access. Test IDs-only connection without a backend reader, including the explicit single-tenant retry and optional override.
- Use existing import, template mapping, preview, duplicate protection, practice runs, pause/resume, and history checks. Confirm practice sends no Graph POST.
- A live controlled test email requires separate approval. Check Sent Items and a controlled inbox; Graph acceptance alone is insufficient. Do not retry uncertain campaign outcomes.

No live migration, credential change, deployment, GitHub push, or real email is authorized merely by implementing this code. Unit mocks and browser previews do not prove live Entra consent, RLS execution, or mailbox delivery.

Official references: [application metadata and permissions](https://learn.microsoft.com/en-us/graph/api/application-get?view=graph-rest-1.0), [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [MSAL 4.30 initialization](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/msal-browser-v4.30.0/lib/msal-browser/docs/initialization.md).
