import { MailWorkspacePage } from "@/components/mail/mail-workspace-page";
export const metadata = { title: "Compose email" };
export default async function ComposePage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) { return <MailWorkspacePage compose preview={(await searchParams).preview === "1"} />; }
