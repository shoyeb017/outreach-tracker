import { PageHeader } from "@/components/layout/page-header";
import { EngagementWorkspace } from "@/components/engagement/engagement-workspace";
export const metadata = { title: "Email engagement" };
export default function EngagementPage() {
  return <main className="page-shell"><PageHeader eyebrow="Campaign insights" title="Email engagement" description="Understand link activity and prepare a reviewed follow-up." /><EngagementWorkspace /></main>;
}
