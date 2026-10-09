import { requireAdministrator, privilegedDatabase } from "@/lib/admin/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
export default async function AdminSecurityPage() {
  await requireAdministrator(); const { data, error } = await privilegedDatabase().from("admin_audit_log").select("id,action,actor_email,created_at").order("created_at",{ascending:false}).limit(100);
  const environmentLogin = Boolean(process.env.ADMIN_LOGIN_PASSWORD);
  return <main>
    <PageHeader title="Security & audit" description="Security controls are enforced on the server. Sensitive environment values are never displayed here." />
    <Card><CardHeader><CardTitle>Active safeguards</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-3 pl-5 text-sm">
      <li>{environmentLogin ? "Environment administrator session: signed, expires after eight hours, and uses HTTP-only, secure production cookies." : "Supabase administrator session with HTTP-only, secure production cookies."}</li>
      <li>{environmentLogin ? "Administrator email and password are verified server-side. Changing the environment credentials invalidates existing sessions." : "Administrator email allowlist and server-side administrator role checks."}</li>
      <li>{environmentLogin ? "Use a long, unique admin password in your hosting environment. Environment login does not provide MFA." : "The shared sign-in accepts existing passwords. Configure Supabase password policy and MFA to protect production accounts."}</li>
      <li>Same-origin request validation, strict same-site cookies, and persistent login rate limiting.</li>
      <li>Normal users cannot read admin audit records or change default settings.</li>
      <li>Microsoft directory reader: {process.env.MICROSOFT_READER_CLIENT_SECRET ? "Backend credential configured; permission not yet proven by this screen" : "Not configured; verified audience detection unavailable"}.</li>
      <li>Configuration saves and administrator login attempts are audited. No tokens or passwords are recorded.</li>
    </ul></CardContent></Card>
    <Card className="mt-8"><CardHeader><CardTitle>Latest 100 audit events</CardTitle></CardHeader><CardContent>{error ? <p>Audit data unavailable.</p> : !data?.length ? <p>No events recorded.</p> : <ul className="max-h-[32rem] space-y-4 overflow-y-auto pr-2" aria-label="Audit events">{data.map((entry)=><li key={entry.id} className="border-b pb-3 text-sm"><p>{entry.action.replaceAll("_"," ")}</p><p className="break-all">{entry.actor_email} · {entry.created_at}</p></li>)}</ul>}</CardContent></Card>
  </main>;
}
