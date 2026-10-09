Use this optional path only when you own or are authorized to use an Entra app registration. Most users should use the [default connection](/help/default-connection).

## Prepare the registration

Follow [Microsoft Entra setup](/help/microsoft-setup). Configure the exact website Settings URL as a **Single-page application** redirect and add delegated `User.Read` and `Mail.Send` permissions.

Those permissions are enough for campaigns and new Compose emails. Add delegated `Mail.Read` to read your own Inbox, Sent, Drafts, and Junk email. Add `Mail.ReadWrite` only for draft changes, reply/forward drafts, or marking mail read/unread. Organization consent policy applies to custom registrations too; owning the IDs does not bypass administrator approval. See [Permissions explained](/help/permissions).

Copy the **Application (client) ID** and **Directory (tenant) ID** from that same registration’s Overview. Do not use its Object ID, a guessed tenant, or a client secret.

## Save your configuration

1. Open **Settings → Email account → My own app registration**.
2. Give the configuration a recognizable name.
3. Paste the Client ID and Tenant ID and save.
4. Keep normal automatic sign-in. Optional advanced account-type overrides are for known registration requirements, not a mandatory setup step.

Saving a changed configuration disconnects the previous sender. Optional metadata validation can help with account types, but is not required just to attempt sign-in. Microsoft still enforces eligibility, redirects, and consent.

## Connect and check the sender

Select your saved registration and click **Connect account**. Sign in to the mailbox that should send, approve permissions, and verify the connected address.

You can save several configurations, but only one sender is active per workspace. Choosing an application configuration is not the same as choosing a mailbox.

## Test and review

**Test connection** checks access without sending mail. Use the separately confirmed **Send real test email** only with a controlled recipient when you want an actual message sent.

Reopen campaign review after changing senders. Confirm the address and sending mode before sending a real batch. See [Sending safety](/help/safety).
