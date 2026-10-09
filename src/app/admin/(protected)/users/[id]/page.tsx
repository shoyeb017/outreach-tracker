import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdministrator, privilegedDatabase } from "@/lib/admin/server";
import { adminDate } from "@/lib/admin/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { AccountActions } from "@/components/admin/account-actions";

export default async function AdminAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdministrator();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = privilegedDatabase();
  const [identity, profile, sender, role, deletion] = await Promise.all([
    db.auth.admin.getUserById(id), db.from("profiles").select("full_name").eq("id",id).maybeSingle(),
    db.from("microsoft_integrations").select("connected_email,connection_status,connection_method,last_verified_at").eq("user_id",id).maybeSingle(),
    db.from("application_administrators").select("enabled").eq("user_id",id).maybeSingle(),
    db.from("admin_account_deletions").select("status,confirmation_email,updated_at").eq("user_id",id).maybeSingle(),
  ]);
  const user = identity.data.user;
  if (identity.error && identity.error.code !== "user_not_found") return <main><PageHeader title="Account unavailable" description="Account identity could not be verified. Refresh or check Supabase access." actions={<ButtonLink href="/admin/users" variant="outline">Back to users</ButtonLink>} /></main>;
  if (!user && !deletion.data) notFound();
  const email = user?.email ?? deletion.data?.confirmation_email ?? null;
  const protectedAccount = Boolean(role.data?.enabled || user?.id === admin.id || email?.toLowerCase() === admin.email.toLowerCase());
  const usage = await Promise.all(["datasets","dataset_rows","templates","send_runs","email_history","signature_fields","suppression_list"].map(table => db.from(table).select("id",{count:"exact",head:true}).eq("user_id",id)));
  const labels = ["Spreadsheets","Recipient rows","Personal templates","Campaigns","History records","Signature blocks","Suppressed addresses"];
  return <main>
    <PageHeader eyebrow="Account management" title={profile.data?.full_name || email || "Account details"} description="Workspace usage and saved sender information. Mailbox contents and credentials are not displayed." actions={<ButtonLink href="/admin/users" variant="outline">Back to users</ButtonLink>} />
    {deletion.data && <p role="status" className="admin-notice mb-6">{deletion.data.status === "deleted" ? "This account has been deleted. The audit checkpoint is retained." : "This workspace is locked for deletion. Cleanup may be incomplete; retry to finish removing its data."} Updated {adminDate(deletion.data.updated_at)}.</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Account identity</CardTitle></CardHeader><CardContent><dl className="admin-details"><dt>Account email</dt><dd>{email ?? "Not available"}</dd><dt>Email verification</dt><dd>{user?.email_confirmed_at ? "Verified" : "Not verified"}</dd><dt>Joined</dt><dd>{adminDate(user?.created_at)}</dd><dt>Last sign-in</dt><dd>{adminDate(user?.last_sign_in_at)}</dd><dt>Role</dt><dd>{protectedAccount ? "Administrator · protected" : "Workspace user"}</dd><dt>Account ID</dt><dd className="font-mono text-xs">{id}</dd></dl></CardContent></Card>
      <Card><CardHeader><CardTitle>Microsoft sender</CardTitle></CardHeader><CardContent>{sender.error ? <p role="alert">Saved sender unavailable.</p> : <dl className="admin-details"><dt>Sending address</dt><dd>{sender.data?.connected_email ?? "Not connected"}</dd><dt>Status</dt><dd>{sender.data?.connection_status ?? "Not connected"}</dd><dt>Configuration</dt><dd>{sender.data?.connection_method === "custom" ? "Personal configuration" : "Application default"}</dd><dt>Last verified</dt><dd>{adminDate(sender.data?.last_verified_at)}</dd></dl>}<p className="mt-5 text-xs leading-6 text-[var(--muted-foreground)]">Saved metadata does not confirm current token validity or email delivery.</p></CardContent></Card>
    </div>
    <Card className="mt-6"><CardHeader><CardTitle>Workspace usage</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-7">{usage.map((result,index) => <div key={labels[index]}><p className="text-xl font-semibold tabular-nums">{result.error ? "Unavailable" : result.count ?? 0}</p><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{labels[index]}</p></div>)}</div></CardContent></Card>
    {deletion.data?.status !== "deleted" && <Card className="mt-6"><CardHeader><CardTitle>Account controls</CardTitle></CardHeader><CardContent><AccountActions id={id} email={email} protectedAccount={protectedAccount} connected={sender.data?.connection_status === "connected"} cleanup={Boolean(deletion.data)} available={!deletion.error && !role.error} /></CardContent></Card>}
  </main>;
}
