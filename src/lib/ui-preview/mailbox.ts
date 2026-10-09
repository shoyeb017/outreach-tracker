import type { MailboxClient } from "@/lib/microsoft/mailbox";
import type { MailMessage } from "@/lib/mail/types";
import { draftPayload } from "@/lib/mail/compose";

// Explicit design-preview fixture only. It never uses Graph or represents a real connection.
export function createMailboxPreview(): MailboxClient {
  const inbox: MailMessage[] = [
    { id: "preview-1", subject: "A quick question about our next project", bodyPreview: "Hi, could we arrange a short introductory call?", isRead: false, isDraft: false, hasAttachments: false, receivedDateTime: "2026-10-09T08:30:00Z", from: { emailAddress: { name: "Alex at Northstar", address: "alex@example.com" } }, toRecipients: [{ emailAddress: { address: "demo@example.com" } }], ccRecipients: [], body: { contentType: "HTML", content: "<p>Hi there,</p><p>Could we arrange a short introductory call next week to discuss our next project?</p><p>Best regards,<br>Alex</p>" } },
    { id: "preview-2", subject: "An intentionally long subject to check wrapping on narrow screens and tablet layouts without squeezing the message row", bodyPreview: "Here are the details we discussed. Please let me know if you have any questions.", isRead: true, isDraft: false, hasAttachments: false, receivedDateTime: "2026-10-08T10:00:00Z", from: { emailAddress: { name: "Taylor Morgan", address: "taylor@example.com" } }, toRecipients: [{ emailAddress: { address: "demo@example.com" } }], ccRecipients: [], body: { contentType: "HTML", content: "<p>Here are the details we discussed.</p>" } },
  ];
  const drafts: MailMessage[] = []; let count = 0;
  return {
    enable: async () => "preview-only",
    list: async (folder) => ({ messages: folder === "inbox" ? inbox : folder === "drafts" ? drafts : [] }),
    get: async (id) => [...inbox, ...drafts].find((item) => item.id === id)!,
    markRead: async (id, read) => { const item = inbox.find((mail) => mail.id === id); if (item) item.isRead = read; },
    attachments: async () => [], download: async () => { throw new Error("Attachments are not available in design preview."); },
    save: async (mail, id) => {
      const payload = draftPayload(mail); const saved = { ...inbox[0], ...payload, id: id ?? `preview-draft-${++count}`, isDraft: true, isRead: true, bodyPreview: "Preview draft" };
      const index = drafts.findIndex((item) => item.id === saved.id); if (index < 0) drafts.push(saved); else drafts[index] = saved;
      return saved;
    },
    startReply: async (id) => ({ ...inbox.find((item) => item.id === id)!, id: `preview-draft-${++count}`, isDraft: true, subject: "Re: A quick question about our next project", toRecipients: [{ emailAddress: { address: "alex@example.com" } }] }),
    startForward: async (id) => ({ ...inbox.find((item) => item.id === id)!, id: `preview-draft-${++count}`, isDraft: true, subject: "Fw: A quick question about our next project", toRecipients: [] }),
    send: async () => { throw new Error("Real sending is disabled in design preview."); },
    sendNew: async () => { throw new Error("Real sending is disabled in design preview."); },
  };
}
