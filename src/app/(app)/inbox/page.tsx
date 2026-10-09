import { MailWorkspacePage } from "@/components/mail/mail-workspace-page";
export const metadata = { title: "Inbox" };
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) { return <MailWorkspacePage preview={(await searchParams).preview === "1"} />; }
