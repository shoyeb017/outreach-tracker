import { ScheduledMailHub } from "@/components/scheduling/scheduled-mail-hub";
export const metadata = { title: "Scheduled emails" };
export default async function ScheduledPage({ searchParams }: { searchParams: Promise<{ batch?: string; connection?: string }> }) {
  const query = await searchParams;
  return <ScheduledMailHub initialBatch={query.batch} connectionResult={query.connection === "connected" || query.connection === "failed" ? query.connection : undefined} />;
}
