Find your exact Microsoft error before changing settings. Organization administrators may need to help; do not bypass their account or consent rules.

## Check these first

1. Confirm the selected app configuration and intended sender.
2. Confirm the registration supports the account type you are using.
3. Verify the exact website `/settings` URL is registered as a Single-page application redirect.
4. Check delegated permissions and organization consent.

If a send outcome is uncertain, pause and check Microsoft Sent Items before retrying. A successful sign-in alone does not verify the app registration’s account-type metadata or prove delivery.

## Useful references

If Inbox asks for admin approval, AUTMAIL requests delegated `Mail.Read` for your own connected mailbox, not application-wide access. Company policy can still require approval. A new Compose email needs only `User.Read` and `Mail.Send`; reading is optional. Saving drafts, reply/forward drafts, and read-status changes ask separately for `Mail.ReadWrite`. See [Permissions explained](/help/permissions) for the exact approval steps.

- [Default connection steps](/help/default-connection)
- [Your own app registration](/help/custom-connection)
- [Microsoft Entra setup](/help/microsoft-setup)
- [Microsoft AADSTS50020 guidance](https://learn.microsoft.com/troubleshoot/azure/active-directory/error-code-aadsts50020-user-account-identity-provider-does-not-exist)

## Common connection errors

Expand an error below for what happened, its likely cause, a fix, and a verification step. The exact redirect copy control appears after the errors.

<!-- interactive-errors -->

### AADSTS50020 / wrong tenant

**What happened:** Microsoft rejected this account for the chosen tenant/app.

**Why it happened:** Authority, audience, directory membership, or guest invitation may not match.

**How to fix it:** Check the selected account and registration's Supported account types. For single tenant, use a permitted member/guest or ask its owner about invitations. Personal accounts require a genuinely supported audience; changing a URL does not change the registration.

**How to verify the fix:** Refresh configuration, reconnect, and check the saved sender. Run Test connection.

### Single-tenant, multitenant, or personal-account mismatch

**What happened:** An account outside the configured audience cannot sign in.

**Why it happened:** The registration and login authority may support different account types.

**How to fix it:** Check Entra. Refresh verified metadata or correct the clearly labeled manual fallback. Single tenant uses its tenant ID; multiple organizations uses organizations; both account types uses common; personal-only uses consumers.

**How to verify the fix:** Confirm audience and authority, then reconnect the intended sender.

### Redirect URI mismatch / AADSTS50011

**What happened:** Microsoft rejected the return address.

**Why it happened:** The exact Settings URL is not registered as a Single-page application redirect.

**How to fix it:** Copy the URL below into Authentication → Single-page application. Match HTTPS, domain, localhost port, and /settings exactly. /auth/callback belongs to Supabase, not this Microsoft popup.

**How to verify the fix:** Save in Entra and reconnect. Do not add unused callback URLs.

### Invalid Client ID, Tenant ID, or application not found

**What happened:** The requested registration/directory cannot be located.

**Why it happened:** A typo, Object ID mistaken for Client ID, or wrong owning directory may be involved.

**How to fix it:** Copy Application (client) ID and Directory (tenant) ID from the same registration Overview. Use UUID values. The optional reader inspects only explicitly allowlisted apps in its own directory.

**How to verify the fix:** Save and validate the corrected IDs.

### Missing Mail.Send permission

**What happened:** Email sending cannot be authorized.

**Why it happened:** Delegated Mail.Send may not be configured, consented, or allowed by policy.

**How to fix it:** The registration owner adds Graph delegated Mail.Send. Reconnect to request consent; your organization may require administrator approval. IDs alone grant no permission.

**How to verify the fix:** Reconnect, then use a separately confirmed test email if actual sending acceptance needs testing.

### Administrator approval required / consent denied

**What happened:** Microsoft stopped permission approval.

**Why it happened:** The user declined, or organizational policy prevents user approval.

**How to fix it:** Ask the Microsoft organization administrator to review the selected Client ID and required delegated permission: `Mail.Read` for reading, `Mail.ReadWrite` for draft/read-status changes, or `Mail.Send` for sending. Use the [user and administrator steps](/help/permissions). Saving IDs as an AUTMAIL administrator does not grant Microsoft consent. Do not request Application mailbox or directory-wide reading permission as a workaround.

**How to verify the fix:** After approval, reconnect and Test connection.

### Unsupported account type

**What happened:** The selected Microsoft account is not admitted.

**Why it happened:** The app may be organizational-only or personal-only, or your fallback may be incorrect.

**How to fix it:** Use a supported account or ask the app owner to change its supported audience. If metadata cannot be read, update the manual fallback only after checking Entra.

**How to verify the fix:** Refresh and reconnect. Check the verification label; successful login is not proof of signInAudience detection.

### Popup blocked

**What happened:** The Microsoft window did not open.

**Why it happened:** Browser popup rules or another pending interaction may block it.

**How to fix it:** Allow popups for this website, close other sign-in windows, then click Connect again.

**How to verify the fix:** The popup completes and the saved sender is the intended account.

### Expired token / Graph 401

**What happened:** Microsoft rejected authentication.

**Why it happened:** The token may be expired, invalid, or revoked.

**How to fix it:** Reconnect in Settings. Silent renewal is attempted first; interactive renewal occurs only when MSAL reports interaction is required.

**How to verify the fix:** Test connection succeeds for the selected sender; do not retry uncertain emails blindly.

### Graph 403

**What happened:** Microsoft denied this operation.

**Why it happened:** Consent, mailbox rights, license restrictions, or tenant policy may apply.

**How to fix it:** Ask the administrator to check delegated permissions and mailbox provisioning. Not every 403 has the same cause; do not bypass organizational controls.

**How to verify the fix:** Verify /me access, then a separately confirmed test email if sending must be tested.

### Graph 429 / rate limits

**What happened:** Microsoft asked the app to slow down.

**Why it happened:** The workload was throttled.

**How to fix it:** Pause the batch, honor Retry-After, and reduce sending speed. Only explicit throttling responses are retried; uncertain POSTs are not blindly repeated.

**How to verify the fix:** Resume after throttling clears and verify the review still shows the intended sender.

### Mailbox unavailable / sending restrictions

**What happened:** Sign-in may work while sending fails.

**Why it happened:** The account may lack a provisioned Exchange/Outlook mailbox, licensing, or permitted sending access.

**How to fix it:** Ask the mailbox administrator to verify provisioning, licensing, and sending policies. Sign-in does not create a mailbox. Arbitrary From addresses and Exchange delegation are not configured by this tracker.

**How to verify the fix:** Check the mailbox and a separately confirmed test email; acceptance still does not prove delivery.

### requestedAccessTokenVersion errors

**What happened:** Entra rejected token configuration.

**Why it happened:** The manifest version may be incompatible with the audience.

**How to fix it:** Ask the registration owner to check api.requestedAccessTokenVersion and Supported account types. Personal-account audiences require version 2. Do not change unrelated manifest settings blindly.

**How to verify the fix:** Save compatible Entra settings, refresh configuration, and reconnect.

### Entra changed but tracker uses old configuration

**What happened:** Displayed audience/authority is out of date.

**Why it happened:** Verified metadata has a short cache; manual fallbacks cannot remotely monitor Entra.

**How to fix it:** Click Refresh configuration. Reconnect after authority changes. If reading is unavailable, inspect Entra and save the correct manual fallback yourself.

**How to verify the fix:** Check fresh validation time and verification label. Verified metadata is cached for at most five minutes.

### Missing backend permission to read signInAudience

**What happened:** Automatic audience detection is unavailable or denied. You may see “Account-type metadata is unavailable.” This notice alone does not block mailbox sign-in.

**Why it happened:** No reader, missing Application.Read.All approval, or unrelated/non-allowlisted tenant/app.

**How to fix it:** Normally leave Automatic sign-in selected and connect; metadata reading is optional. Administrators who need verified detection for controlled registrations can follow the [Application.Read.All setup guide](/help/permissions#optional-administrator-metadata-reader): use a separate backend reader, Microsoft Graph Application permissions, administrator consent, server-only reader settings, and an explicit app allowlist. For third-party registrations use automatic sign-in; an explicit account-type override is optional. Never share client secrets or request broad directory permission from ordinary users.

**How to verify the fix:** If a reader was configured, Refresh configuration should show a fresh Verified label and verification time. If you intentionally leave the optional reader disabled, the notice can remain; connect and test the mailbox separately. Mailbox login alone does not verify registration metadata.

### Network loss / uncertain send outcome

**What happened:** The browser cannot tell whether Microsoft accepted the request.

**Why it happened:** The connection failed after POST or a server response was ambiguous.

**How to fix it:** Keep the item paused. Check Sent Items before deciding whether to retry. Reconnecting does not prove the previous message was not sent.

**How to verify the fix:** Resolve the uncertain outcome deliberately; never resend merely because an error appeared.
