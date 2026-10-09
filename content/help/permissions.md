AUTMAIL accesses the Microsoft mailbox you connect, using **delegated permissions** and `/me` endpoints. You do not need application-wide mailbox access. Application IDs alone grant no access.

## Which permission do I need?

- **`User.Read` — identify the sender.** Requested when you connect. Verifies the signed-in account.
- **`Mail.Send` — send email.** Requested when you connect; renewed if required before sending. Used for campaigns and new manually written emails.
- **`Mail.Read` — read your mailbox.** Requested through **Enable mailbox access** in Inbox. Reads Inbox, Sent, Drafts, Junk email, bodies, and attachments.
- **`Mail.ReadWrite` — change your mailbox.** Requested when you explicitly save/edit drafts, create reply/forward drafts, or mark messages read/unread.

**Compose does not require Inbox access.** You can write and send a new email with `User.Read` and `Mail.Send`, even if you have not enabled reading. `Mail.Send` also lets Microsoft save a copy in Sent Items without giving AUTMAIL permission to read that folder. Saving a draft is optional; it needs `Mail.ReadWrite`. Sending edits to an existing draft also needs that writing permission.

`Mail.ReadWrite` includes reading, but does not include sending. `Mail.ReadBasic` does not allow reading the full message body. AUTMAIL uses `Mail.Read` for that reason. Existing campaign permissions remain unchanged.

MSAL may also add the OAuth `offline_access` scope for session renewal. This is not permission to read or send mail. Access and refresh tokens are not saved in the AUTMAIL database. Never share tokens, passwords, or client secrets.

## Why does my own inbox ask for administrator approval?

Your organization controls whether employees may approve apps that access company data. These delegated mail permissions are not inherently admin-only, but your Microsoft organization may restrict user consent, require approved publishers, require assignment, or require an administrator to approve an application.

**“Need admin approval” does not mean AUTMAIL is asking to read everyone's inbox.** It can appear for access to your own mailbox. AUTMAIL cannot bypass your company's security policy. Approval of the delegated permission lets the signed-in user perform the allowed actions; it does not turn this flow into unattended access to every mailbox.

The administrator who saves IDs inside AUTMAIL may not be the Microsoft organization administrator. Saving IDs or switching from default to custom configuration does not itself grant consent.

## What an ordinary user should do

1. In **Settings → Email account**, choose **Administrator setup** or your authorized custom configuration and connect your intended Microsoft account.
2. Check the connected email address. This is the sender and mailbox AUTMAIL will use.
3. To send only, open **Compose email**. You do not need to enable Inbox.
4. To read mail, open **Inbox → Enable mailbox access** and approve `Mail.Read` if Microsoft allows it.
5. If Microsoft shows **Need admin approval**, use its approval-request option if available, or ask your organization's Microsoft administrator to approve the selected application. Send the app name and Client ID, not a token or password.
6. After approval, reconnect in Settings if the session expired, then return to Inbox and choose **Enable mailbox access** again.

A personal Outlook/Hotmail account may approve access itself when the registration supports personal accounts. Connecting a personal account accesses that personal mailbox, not your company's mailbox. Gmail addresses can be recipients but cannot be the connected sender in this Microsoft integration.

## What the Microsoft administrator should do

1. Identify the registration actually selected in AUTMAIL. Check its **Application (client) ID**; default and custom configurations can use different applications.
2. For an owned registration, open **Microsoft Entra → App registrations → that application → API permissions → Add a permission → Microsoft Graph → Delegated permissions**.
3. Add `User.Read` and `Mail.Send` for sending. Add `Mail.Read` if reading is needed. Add `Mail.ReadWrite` only if draft changes, reply/forward drafts, or read-status changes are needed. Choose **Delegated**, not **Application**.
4. Where organization policy requires approval, an appropriately authorized Microsoft administrator should review **all** requested permissions before choosing **Grant admin consent** under **App registrations → the application → API permissions**. This approves permissions for the organization, not just the person currently testing; follow your organization's approval process and avoid unnecessary permissions. For a registration owned by another organization, use **Enterprise apps → the application → Security → Permissions → Grant admin consent** in the user's tenant, where the app is already provisioned, or the organization's admin-consent request workflow.
5. Check any required user assignment under the enterprise application's settings, and allow the intended user according to organization policy.
6. Ask the user to retry connecting or enabling mailbox reading. Confirm the displayed account is the expected mailbox.

Do not disable organization-wide consent protections as a workaround. Consent does not bypass mailbox provisioning, licensing, Exchange restrictions, or sending limits.

## What a successful test proves

**Test connection** verifies basic Graph access and sends no email. `/me` success does not prove that reading, sending, or delivery is allowed.

A separately confirmed real test sends an actual email. HTTP 202 means Microsoft accepted the request, not guaranteed delivery. Check the recipient mailbox and Microsoft Sent Items when needed. Do not blindly resend an uncertain result.

## Optional administrator metadata reader

**Administrator only · optional.** `Application.Read.All` lets AUTMAIL's backend check a registration's **Supported account types**: work/school accounts, personal accounts, or both. AUTMAIL reads `signInAudience`; this does not test mailbox access or email delivery.

If you see **“Account-type metadata is unavailable”**, this automatic check is not configured or cannot inspect the selected registration. It is not, by itself, a mailbox connection failure. For normal use, leave **Automatic sign-in** selected and connect your Microsoft account. You do not need to enable the reader just to remove this notice.

### Set up automatic detection only if needed

1. Have your Microsoft organization administrator create a separate backend reader app registration in the directory that owns the registrations you want to inspect. Being an AUTMAIL administrator does not automatically give Microsoft administrator rights.
2. On that **reader registration**, open **Microsoft Entra → App registrations → API permissions → Add a permission → Microsoft Graph → Application permissions**. Add **`Application.Read.All`**. This backend reader uses **Application**, not Delegated, permissions; ordinary mailbox permissions remain delegated on the sending registration.
3. An appropriately authorized Microsoft administrator must review the requested permissions and **Grant admin consent** for the organization. Adding the permission alone does not grant access.
4. Configure these optional server-only settings in your hosting environment:

   - `MICROSOFT_READER_TENANT_ID`: the reader's Directory (tenant) ID; it must match the directory owning the selected sending registration.
   - `MICROSOFT_READER_CLIENT_ID`: the backend reader's Application (client) ID, not the sending app's ID.
   - `MICROSOFT_READER_CLIENT_SECRET`: the backend reader's secret value. Never put it in browser settings, screenshots, Git, or a `NEXT_PUBLIC_` variable.
   - `MICROSOFT_READABLE_APP_IDS`: a comma-separated allowlist of the sending registrations' Application (client) IDs that AUTMAIL may inspect.

5. Restart the server or redeploy after configuring these values. In **Administration → Microsoft setup → Configuration diagnostics**, click **Refresh configuration**. Successful detection shows **Verified** and a successful verification time. Ordinary users do not need these server settings.

### Security boundary

`Application.Read.All` permits reading applications and service principals across the organization without a signed-in user. It does **not** grant mailbox reading or sending. AUTMAIL's allowlist limits its metadata queries; it does not narrow Microsoft's underlying permission grant. Review this broad permission under your organization's security policy and keep the reader separate from browser sign-in. See [Microsoft's permission definition](https://learn.microsoft.com/en-us/graph/permissions-reference#applicationreadall).

Keep reader credentials private and rotate expiring secrets. Do not add `Application.ReadWrite.All`, `Directory.Read.All`, or application-wide mailbox permissions merely to resolve this notice. The reader cannot inspect unrelated tenants or registrations outside its allowlist. If your organization does not approve metadata reading, leave it disabled and use automatic sign-in; Microsoft still enforces the sending registration's actual supported accounts.

## Official references

- [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Organization user-consent policies](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
- [Microsoft administrator consent steps](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent)
- [Send mail and acceptance](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- [Authorized application metadata lookup](https://learn.microsoft.com/en-us/graph/api/application-get?view=graph-rest-1.0)
