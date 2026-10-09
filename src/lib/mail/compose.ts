import type { MailAddress, MailComposition } from "./types";
import { MAX_ATTACHMENT_BYTES } from "./types";

export function parseAddresses(input: string): string[] {
  const addresses = input.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
  for (const address of addresses) if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address) || address.length > 254) throw new Error(`Check this email address: ${address}`);
  return addresses;
}
export function mailRecipients(input: string): MailAddress[] { return parseAddresses(input).map((address) => ({ emailAddress: { address } })); }
export function validateComposition(mail: MailComposition, sending = true) {
  const to = parseAddresses(mail.to); const all = [...to, ...parseAddresses(mail.cc), ...parseAddresses(mail.bcc)];
  if (sending && !to.length) throw new Error("Add at least one recipient in To.");
  if (all.length > 100) throw new Error("Use up to 100 recipients for a manual email. Use Spreadsheets for campaigns.");
  if (new Set(all.map((address) => address.toLowerCase())).size !== all.length) throw new Error("An address appears more than once in To, Cc, or Bcc. Remove the duplicate.");
  if (/[\r\n]/.test(mail.subject) || mail.subject.length > 255) throw new Error("Keep the subject to one line and 255 characters or fewer.");
  if (sending && !mail.subject.trim()) throw new Error("Add an email subject.");
  if (sending && !mail.html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() && !/<img\b/i.test(mail.html)) throw new Error("Write a message before sending.");
  if (new TextEncoder().encode(mail.html).length > 500000) throw new Error("This message is too large. Shorten the quoted message.");
  if (mail.attachments.length > 10 || mail.attachments.reduce((total, item) => total + item.size, 0) > MAX_ATTACHMENT_BYTES) throw new Error("Attach up to 10 files, with a combined size of 2 MB or less.");
  return all;
}
export function draftPayload(mail: MailComposition) {
  validateComposition(mail, false);
  return { subject: mail.subject.trim(), body: { contentType: "HTML", content: mail.html }, toRecipients: mailRecipients(mail.to), ccRecipients: mailRecipients(mail.cc), bccRecipients: mailRecipients(mail.bcc) };
}
export function attachmentPayload(item: MailComposition["attachments"][number]) {
  return { "@odata.type": "#microsoft.graph.fileAttachment", name: item.name, contentType: item.contentType, contentBytes: item.contentBytes };
}
export function addressText(addresses: MailAddress[] = []) { return addresses.map((item) => item.emailAddress.address).join(", "); }
export function outlookLink(link?: string) {
  try { const url = new URL(link ?? ""); return url.protocol === "https:" && !url.username && !url.password && !url.port && ["outlook.live.com", "outlook.office.com", "outlook.office365.com"].includes(url.hostname) ? url.href : null; } catch { return null; }
}
