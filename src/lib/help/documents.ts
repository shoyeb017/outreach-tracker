// Shared metadata only; Markdown reading stays server-side.
export const helpDocuments = [
  { slug: "getting-started", href: "/help", title: "Start sending with confidence", navTitle: "Getting started", group: "Start here", summary: "A simple path from your first spreadsheet to a reviewed email.", minutes: 3 },
  { slug: "spreadsheet-workflow", href: "/help/spreadsheet-workflow", title: "Set up your spreadsheet", navTitle: "Spreadsheet workflow", group: "Start here", summary: "Choose recipient emails, match templates, and connect your columns.", minutes: 4 },
  { slug: "templates-and-personalization", href: "/help/templates-and-personalization", title: "Templates and personal fields", navTitle: "Templates & personalization", group: "Start here", summary: "Write a reusable email and understand exactly where its values come from.", minutes: 3 },
  { slug: "mailbox", href: "/help/mailbox", title: "Inbox and personal email", navTitle: "Inbox & Compose", group: "Start here", summary: "Read your Microsoft mailbox, save drafts, and write or reply to individual emails.", minutes: 4 },
  { slug: "default-connection", href: "/help/default-connection", title: "Connect using the default configuration", navTitle: "Default connection", group: "Connect Microsoft", summary: "Use the administrator’s app setup, then sign in to your own sending mailbox.", minutes: 2 },
  { slug: "custom-connection", href: "/help/custom-connection", title: "Connect using your own app registration", navTitle: "My own app registration", group: "Connect Microsoft", summary: "An optional connection path for people who manage their own Microsoft application.", minutes: 3 },
  { slug: "microsoft-setup", href: "/help/microsoft-setup", title: "Microsoft Entra setup", navTitle: "Microsoft Entra setup", group: "Connect Microsoft", summary: "Administrator reference: registration, account types, redirect URL, and permissions.", minutes: 5 },
  { slug: "permissions", href: "/help/permissions", title: "Microsoft permissions explained", navTitle: "Permissions explained", group: "Connect Microsoft", summary: "Choose reading, sending, or draft access and understand when Microsoft admin approval is needed.", minutes: 5 },
  { slug: "safety", href: "/help/safety", title: "Review and send safely", navTitle: "Sending safety", group: "Review & recover", summary: "Practice, duplicate protection, real test emails, and uncertain send outcomes.", minutes: 4 },
  { slug: "troubleshooting", href: "/help/troubleshooting", title: "Microsoft connection troubleshooting", navTitle: "Troubleshooting", group: "Review & recover", summary: "Find your exact error, fix its cause, and verify before trying again.", minutes: 5 },
] as const;
export type HelpDocument = typeof helpDocuments[number];
// The normal reader goes straight from default connection to safety.
// Own-registration and Entra setup are optional branches, not required steps.
export const helpSequence: Record<HelpDocument["slug"], { previous?: HelpDocument["slug"]; next?: HelpDocument["slug"] }> = {
  "getting-started": { next: "spreadsheet-workflow" },
  "spreadsheet-workflow": { previous: "getting-started", next: "templates-and-personalization" },
  "templates-and-personalization": { previous: "spreadsheet-workflow", next: "default-connection" },
  mailbox: { previous: "default-connection", next: "safety" },
  "default-connection": { previous: "templates-and-personalization", next: "safety" },
  "custom-connection": { previous: "default-connection", next: "microsoft-setup" },
  "microsoft-setup": { previous: "custom-connection", next: "permissions" },
  permissions: { previous: "microsoft-setup", next: "safety" },
  safety: { previous: "default-connection", next: "troubleshooting" },
  troubleshooting: { previous: "safety" },
};
export function findHelpDocument(slug: string): HelpDocument | undefined { return helpDocuments.find((document) => document.slug === slug); }
export function headingId(text: string) { return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-"); }

export function parseConnectionErrors(markdown: string) {
  const content = markdown.split("<!-- interactive-errors -->")[1] || "";
  return content.split(/^### /m).slice(1).map((section) => {
    const [title, ...body] = section.split("\n");
    const answers = [...body.join("\n").matchAll(/\*\*([^*]+):\*\* ([\s\S]*?)(?=\n\n\*\*|$)/g)].map((match) => ({ label: match[1], text: match[2].trim() }));
    return { title: title.trim(), answers };
  });
}
