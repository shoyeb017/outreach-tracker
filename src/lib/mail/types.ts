export type MailFolder = "inbox" | "sentitems" | "drafts" | "junkemail";
export interface MailAddress { emailAddress: { address: string; name?: string } }
export interface MailMessage {
  id: string; subject: string; bodyPreview: string; isRead: boolean; isDraft: boolean;
  hasAttachments: boolean; receivedDateTime: string; sentDateTime?: string; lastModifiedDateTime?: string;
  from?: MailAddress; toRecipients: MailAddress[]; ccRecipients: MailAddress[]; bccRecipients?: MailAddress[];
  replyTo?: MailAddress[]; body?: { contentType: string; content: string }; webLink?: string;
}
export interface MailAttachment { id: string; name: string; size: number; contentType?: string; isInline?: boolean; "@odata.type"?: string }
export interface OutgoingAttachment { name: string; contentType: string; contentBytes: string; size: number }
export interface MailComposition { to: string; cc: string; bcc: string; subject: string; html: string; attachments: OutgoingAttachment[] }
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
