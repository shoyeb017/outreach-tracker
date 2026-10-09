"use client";

import { acquireGraphToken } from "./msal";
import { draftPayload, attachmentPayload, validateComposition } from "@/lib/mail/compose";
import type { MailAttachment, MailComposition, MailFolder, MailMessage } from "@/lib/mail/types";
import type { MicrosoftIntegration } from "@/types";
import { UncertainSendError } from "@/lib/sending/errors";

const root = "https://graph.microsoft.com/v1.0";
const readScopes = ["User.Read", "Mail.Read"];
const writeScopes = ["User.Read", "Mail.ReadWrite"];
const sendScopes = ["User.Read", "Mail.Send"];
const summaryFields = "id,subject,bodyPreview,from,toRecipients,ccRecipients,isRead,isDraft,hasAttachments,receivedDateTime,sentDateTime,lastModifiedDateTime,webLink";
export function safeMailboxUrl(path: string) {
  const url = new URL(path, `${root}/`);
  if (url.origin !== "https://graph.microsoft.com" || !(url.pathname === "/v1.0/me" || url.pathname.startsWith("/v1.0/me/")) || url.username || url.password || url.hash) throw new Error("An unsafe mailbox URL was rejected.");
  return url.href;
}
export function createMailboxClient(integration: MicrosoftIntegration, fetcher: typeof fetch = fetch) {
  async function token(scopes = readScopes, interactive = false) {
    const session = await acquireGraphToken(integration.tenant_id, integration.client_id, false, { scopes, interactive });
    if (!integration.home_account_id || session.account.homeAccountId !== integration.home_account_id) throw new Error("Your connected mailbox changed. Reload this page and reconnect in Settings.");
    return session.token;
  }
  async function request(path: string, init: RequestInit = {}, sending = false, scopes = readScopes, interactive = false) {
    const url = safeMailboxUrl(path);
    const accessToken = await token(scopes, interactive);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try { response = await fetcher(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers } }); }
    catch { if (sending) throw new UncertainSendError(); throw new Error("Could not reach Microsoft. Your changes may not have been saved. Refresh before retrying."); }
    finally { clearTimeout(timeout); }
    if (sending && (response.status >= 500 || response.status === 408 || (response.ok && response.status !== 202))) throw new UncertainSendError();
    if (!response.ok) {
      if (response.status === 401) throw new Error("Your Microsoft session expired. Reconnect in Settings.");
      if (response.status === 403) throw new Error(`Microsoft blocked this action. It needs delegated ${scopes.filter((scope) => scope !== "User.Read").join(" and ")}. Your organization may require a Microsoft administrator to approve it. See Help → Microsoft permissions.`);
      if (response.status === 404) throw new Error("This message no longer exists in this folder. Refresh your mail.");
      if (response.status === 429) throw new Error("Microsoft is limiting requests. Wait a moment before trying again.");
      throw new Error(`Microsoft could not complete this mailbox action (${response.status}). Refresh before retrying.`);
    }
    return response;
  }
  const messagePath = (id: string) => `${root}/me/messages/${encodeURIComponent(id)}`;
  async function verifySender() {
    // Bind the shown From address to the actual delegated mailbox, not another cached account.
    const profile = await (await request(`${root}/me?$select=mail,userPrincipalName`, {}, false, sendScopes, true)).json();
    if (![profile.mail, profile.userPrincipalName].some((address) => typeof address === "string" && address.toLowerCase() === integration.connected_email?.toLowerCase())) throw new Error("The active mailbox differs from the From address. Reconnect in Settings.");
  }
  return {
    enable: () => token(readScopes, true),
    async list(folder: MailFolder, next?: string): Promise<{ messages: MailMessage[]; next?: string }> {
      const sort = folder === "drafts" ? "lastModifiedDateTime" : folder === "sentitems" ? "sentDateTime" : "receivedDateTime";
      const query = new URLSearchParams({ "$top": "25", "$select": summaryFields, "$orderby": `${sort} desc` });
      const response = await request(next ?? `${root}/me/mailFolders/${folder}/messages?${query}`);
      const data = await response.json();
      return { messages: data.value ?? [], next: data["@odata.nextLink"] ? safeMailboxUrl(data["@odata.nextLink"]) : undefined };
    },
    async get(id: string): Promise<MailMessage> { return (await request(`${messagePath(id)}?${new URLSearchParams({ "$select": `${summaryFields},body,bccRecipients,replyTo` })}`)).json(); },
    async markRead(id: string, isRead: boolean) { await request(messagePath(id), { method: "PATCH", body: JSON.stringify({ isRead }) }, false, writeScopes, true); },
    async attachments(id: string): Promise<MailAttachment[]> {
      const items: MailAttachment[] = []; let next: string | undefined = `${messagePath(id)}/attachments?$select=id,name,size,contentType,isInline`;
      while (next) { const data = await (await request(next)).json(); items.push(...(data.value ?? [])); next = data["@odata.nextLink"] ? safeMailboxUrl(data["@odata.nextLink"]) : undefined; }
      return items;
    },
    async download(id: string, attachment: MailAttachment): Promise<Blob> {
      if (attachment.size > 10 * 1024 * 1024) throw new Error("Open this attachment in Outlook; downloads here are limited to 10 MB.");
      if (attachment["@odata.type"] && attachment["@odata.type"] !== "#microsoft.graph.fileAttachment") throw new Error("Open this attached item or cloud link in Outlook.");
      return (await request(`${messagePath(id)}/attachments/${encodeURIComponent(attachment.id)}/$value`)).blob();
    },
    async save(mail: MailComposition, id?: string): Promise<MailMessage> {
      const payload = draftPayload(mail);
      if (!id) return (await request(`${root}/me/messages`, { method: "POST", body: JSON.stringify({ ...payload, attachments: mail.attachments.map(attachmentPayload) }) }, false, writeScopes, true)).json();
      // Only unsaved new attachments are supplied by the editor; existing attachments stay on the draft.
      for (const attachment of mail.attachments) await request(`${messagePath(id)}/attachments`, { method: "POST", body: JSON.stringify(attachmentPayload(attachment)) }, false, writeScopes, true);
      return (await request(messagePath(id), { method: "PATCH", body: JSON.stringify(payload) }, false, writeScopes, true)).json();
    },
    async startReply(id: string, all = false): Promise<MailMessage> { return (await request(`${messagePath(id)}/${all ? "createReplyAll" : "createReply"}`, { method: "POST" }, false, writeScopes, true)).json(); },
    async startForward(id: string): Promise<MailMessage> { return (await request(`${messagePath(id)}/createForward`, { method: "POST" }, false, writeScopes, true)).json(); },
    async sendNew(mail: MailComposition) {
      validateComposition(mail);
      const message = { ...draftPayload(mail), attachments: mail.attachments.map(attachmentPayload) };
      await verifySender();
      await request(`${root}/me/sendMail`, { method: "POST", body: JSON.stringify({ message, saveToSentItems: true }) }, true, sendScopes, true);
    },
    async send(id: string, mail: MailComposition) {
      validateComposition(mail);
      await verifySender();
      await request(`${messagePath(id)}/send`, { method: "POST" }, true, sendScopes, true);
    },
  };
}
export type MailboxClient = ReturnType<typeof createMailboxClient>;
