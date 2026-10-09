import { requireAdministrator, privilegedDatabase } from "@/lib/admin/server";
import { adminDate, adminPageNumber } from "@/lib/admin/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, ButtonLink } from "@/components/ui/button";

export default async function AdminSecurityPage({ searchParams }: { searchParams: Promise<{ page?: string; actor?: string; category?: string }> }) {
  await requireAdministrator();
  const input = await searchParams, page = adminPageNumber(input.page), actor = (input.actor ?? "").trim().slice(0,120);
  const category = ["accounts","configuration","login"].includes(input.category ?? "") ? input.category! : "all";
  let query = privilegedDatabase().from("admin_audit_log").select("id,action,actor_email,created_at,details",{count:"exact"});
  if (actor) query = query.ilike("actor_email", "%" + actor.replace(/[\\%_]/g, "\\$&") + "%");
  if (category === "accounts") query = query.in("action", ["account_deletion_started","account_deletion_failed","account_deleted","sender_disconnected"]);
  if (category === "configuration") query = query.eq("action","microsoft_default_saved");
  if (category === "login") query = query.ilike("action","%login%");
  const { data, error, count } = await query.order("created_at",{ascending:false}).order("id").range((page-1)*50,page*50-1);
  const environmentLogin = Boolean(process.env.ADMIN_LOGIN_PASSWORD);
  const pageLink = (number: number) => "?" + new URLSearchParams({ actor, category, page: String(number) });
  return <main>
    <PageHeader eyebrow="Administration" title="Security & audit" description="Review administrator activity and account changes. Credentials and mailbox contents are never displayed." actions={<ButtonLink href="/admin" variant="outline">Back to overview</ButtonLink>} />
    <div className="grid gap-4 md:grid-cols-3 mb-6">{[
      ["Server-side access", "Administrator credentials and permissions are checked for every protected action."],
      ["Audited account controls", "Deletion locks a workspace before cleanup. Incomplete cleanup remains locked and can be retried."],
      ["Separate workspaces", "Account actions target one user. Shared templates and Microsoft defaults are preserved."],
    ].map(([title,description]) => <Card key={title}><CardContent><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">{description}</p></CardContent></Card>)}</div>
    <form action="/admin/security" className="admin-filter-bar mb-6 grid items-end gap-4 sm:grid-cols-[1fr_220px_auto]">
      <div><Label htmlFor="audit-actor">Search administrator email</Label><Input id="audit-actor" name="actor" defaultValue={actor} maxLength={120} placeholder="Administrator email" /></div>
      <div><Label htmlFor="audit-category">Event type</Label><select id="audit-category" name="category" defaultValue={category} className="admin-select w-full"><option value="all">All events</option><option value="accounts">Account management</option><option value="configuration">Microsoft configuration</option><option value="login">Sign-in activity</option></select></div>
      <div className="flex gap-2"><Button type="submit">Filter</Button>{(actor || category !== "all") && <ButtonLink href="/admin/security" variant="ghost">Clear</ButtonLink>}</div>
    </form>
    <Card><CardHeader><CardTitle>Audit trail</CardTitle><p className="mt-2 text-xs text-[var(--muted-foreground)]">{count ?? 0} matching events · Dates shown in UTC</p></CardHeader>
      {error ? <CardContent><p role="alert">Audit data unavailable. Check server access and migrations.</p></CardContent> : <div className="overflow-x-auto" role="region" aria-label="Administrator audit trail" tabIndex={0}><table className="data-table w-full min-w-[760px]"><thead><tr><th>Event</th><th>Administrator</th><th>Time</th><th>Related account</th></tr></thead><tbody>{data?.map(entry => <tr key={entry.id}><td className="capitalize">{entry.action.replaceAll("_"," ")}</td><td className="max-w-64 break-all">{entry.actor_email}</td><td className="whitespace-nowrap text-xs">{adminDate(entry.created_at)}</td><td>{typeof entry.details?.user_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.details.user_id) ? <ButtonLink href={"/admin/users/"+entry.details.user_id} variant="ghost" size="sm">Account details</ButtonLink> : "—"}</td></tr>)}</tbody></table>{!data?.length && <p className="p-6 text-sm text-[var(--muted-foreground)]">No events match these filters.</p>}</div>}
    </Card>
    {!error && <nav className="my-5 flex flex-wrap items-center gap-4 text-sm" aria-label="Audit pages">{page > 1 && <ButtonLink variant="outline" href={pageLink(page-1)}>Previous</ButtonLink>}<span>Page {page} of {Math.max(1,Math.ceil((count ?? 0)/50))}</span>{page*50 < (count ?? 0) && <ButtonLink variant="outline" href={pageLink(page+1)}>Next</ButtonLink>}</nav>}
    <details className="admin-action-box mt-6"><summary className="focus-ring cursor-pointer text-sm font-semibold">Authentication and security safeguards</summary><ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-6 text-[var(--muted-foreground)]">
      <li>{environmentLogin ? "Signed administrator session: expires after eight hours; HTTP-only and secure production cookies." : "Supabase administrator session with server-side role verification and HTTP-only cookies."}</li>
      <li>{environmentLogin ? "Changing the configured credentials invalidates existing sessions. Use a long, unique password; environment login does not provide MFA." : "Configure Supabase password policy and MFA for production administrator accounts."}</li>
      <li>Same-origin request checks and persistent rate limiting protect account actions.</li><li>Normal users cannot read the audit trail or change administrator settings.</li>
      <li>Deletion cannot recall in-flight Microsoft sends or revoke independently held Microsoft tokens. Stop campaigns first.</li>
      <li>Microsoft directory reader: {process.env.MICROSOFT_READER_CLIENT_SECRET ? "Backend credential configured; permission not tested on this page." : "Not configured. Automatic audience detection is unavailable."}</li>
    </ul></details>
  </main>;
}
