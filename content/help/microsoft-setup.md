This is an administrator reference. Ordinary users can usually skip app registration and use the [default connection](/help/default-connection).

## Know the three pieces

- **App registration:** Microsoft’s record of the website asking for sign-in and email permissions. It does not grant mailbox access by itself.
- **Client ID and Tenant ID:** public identifiers copied from the registration Overview. They are not passwords and do not identify the sending mailbox.
- **Connected account:** the person who signs in and consents. Delegated sending uses this person’s mailbox.

Microsoft Entra controls account eligibility and organization policy. Microsoft Graph is the API used to identify the signed-in account and request email sending.

## Create the application

1. Open [Microsoft Entra](https://entra.microsoft.com) with an account authorized to manage app registrations.
2. Choose **App registrations → New registration** and enter a recognizable name.
3. Choose Supported account types based on who will **sign in**, not who receives your emails.
4. Register and copy Application (client) ID and Directory (tenant) ID from Overview.

Personal Microsoft accounts do not automatically have a conventional company tenant or permission to manage registrations. Ask the registration owner or administrator when needed.

## Choose supported account types

- **One organization / AzureADMyOrg:** permitted members and guests of one directory; its tenant-specific authority is used.
- **Multiple organizations / AzureADMultipleOrgs:** work or school accounts across organizations; `/organizations` authority.
- **Organizations and personal / AzureADandPersonalMicrosoftAccount:** work/school plus supported personal Microsoft accounts; `/common` authority.
- **Personal only / PersonalMicrosoftAccount:** supported personal Microsoft accounts; `/consumers` authority.

Personal-account audiences require a compatible `api.requestedAccessTokenVersion` of 2. Consult Microsoft’s documentation before changing the manifest.

## Register the exact redirect

Open **Authentication → Add a platform → Single-page application**. Register this website’s exact origin plus `/settings`. The copy button below supplies the configured website address.

Match protocol, domain, port, and path. Register your deployed custom domain separately from localhost. Do not use the Web platform, `/auth/callback`, or a client secret for this delegated popup flow.

For local development, use the actual browser origin and port plus `/settings`. The application’s configured public URL must match the website you use.

Installed MSAL Browser 4.x uses popup sign-in and preserves `/settings`. A future MSAL upgrade requires its own reviewed callback setup; do not add a newer redirect bridge blindly.

## Add delegated permissions

Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions**. Add `User.Read` and `Mail.Send`. Adding a permission is different from granting consent; your organization may require administrator approval.

For optional **Inbox, Sent, and Drafts reading**, add delegated `Mail.Read`. Users request it separately by clicking **Enable mailbox access** in Inbox. For saving/editing drafts, creating reply/forward drafts, and changing read status, add delegated `Mail.ReadWrite`; it is requested when users choose those actions. A new Compose email and spreadsheet campaigns need only `User.Read` and `Mail.Send`.

Organization policy can require administrator approval even for a user's own mailbox. See [Permissions explained](/help/permissions) for exact user and administrator steps. Do not add Application mailbox permissions or directory-wide reading as a workaround.

## Save in AUTMAIL and connect

For the shared setup, the application administrator saves the IDs in the administrator Microsoft settings. For a personal configuration, save them in **Settings → Email account → My own app registration**.

Saving IDs is enough to attempt sign-in. Metadata detection is optional; without authorized metadata access, successful mailbox sign-in is not verified detection of the registration’s account types.

Administrators who want automatic account-type detection can follow the [optional Application.Read.All reader setup](/help/permissions#optional-administrator-metadata-reader). Use a separate backend registration and Microsoft administrator consent; do not add this broad directory permission to the ordinary user's connection flow.

Connect the intended mailbox and check the sender address. Run **Test connection**, then a separately confirmed real test only if you need to test actual sending.

## Official references

- [Register an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Supported account types](https://learn.microsoft.com/en-us/entra/identity-platform/v2-supported-account-types)
- [Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)
