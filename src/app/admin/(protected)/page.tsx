import Link from "next/link";
import { Users, Mail, Files, LayoutTemplate, Send, Activity, ArrowUpRight, ShieldCheck } from "lucide-react";
import { requireAdministrator, privilegedDatabase } from "@/lib/admin/server";
import { adminAudience, adminDate, type AdminDirectoryUser } from "@/lib/admin/presentation";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export default async function AdminPage() {
  await requireAdministrator(); const db = privilegedDatabase();
  const [directory, connected, datasets, templates, campaigns, sent, defaults, custom, cleanup, settings, activity] = await Promise.all([
    db.rpc("admin_user_directory", { p_search: "", p_filter: "all", p_page: 1 }),
    db.from("microsoft_integrations").select("id",{count:"exact",head:true}).eq("connection_status","connected"),
    db.from("datasets").select("id",{count:"exact",head:true}),
    db.from("templates").select("id",{count:"exact",head:true}).eq("is_system",false),
    db.from("send_runs").select("id",{count:"exact",head:true}),
    db.from("email_history").select("id",{count:"exact",head:true}).eq("status","sent").eq("is_test",false),
    db.from("microsoft_integrations").select("id",{count:"exact",head:true}).eq("connection_status","connected").eq("connection_method","default"),
    db.from("microsoft_integrations").select("id",{count:"exact",head:true}).eq("connection_status","connected").eq("connection_method","custom"),
    db.from("admin_account_deletions").select("user_id",{count:"exact",head:true}).neq("status","deleted"),
    db.from("microsoft_default_configuration").select("name,enabled,verified_at,detected_audience,validation_error").maybeSingle(),
    db.from("admin_audit_log").select("id,action,created_at,actor_email").order("created_at",{ascending:false}).limit(6),
  ]);
  const metrics = [
    { label: "Accounts", value: directory.error ? null : directory.data?.total ?? 0, icon: Users, hint: "Registered accounts and pending cleanup" },
    { label: "Connected senders", value: connected.error ? null : connected.count ?? 0, icon: Mail, hint: "Saved Microsoft connections" },
    { label: "Spreadsheets", value: datasets.error ? null : datasets.count ?? 0, icon: Files, hint: "Across all workspaces" },
    { label: "Personal templates", value: templates.error ? null : templates.count ?? 0, icon: LayoutTemplate, hint: "Excludes shared system templates" },
    { label: "Campaigns", value: campaigns.error ? null : campaigns.count ?? 0, icon: Activity, hint: "Includes practice campaigns" },
    { label: "Live sends recorded", value: sent.error ? null : sent.count ?? 0, icon: Send, hint: "Not proof of inbox delivery" },
  ];
  const recent = (directory.data?.users ?? []).slice(0,5) as AdminDirectoryUser[];
  const quickLinks = [
    { href: "/admin/users", title: "Manage accounts", description: "Find users, inspect workspace usage, and manage account access.", icon: Users },
    { href: "/admin/microsoft-settings", title: "Microsoft setup", description: "Configure the default connection and personal configuration choices.", icon: Mail },
    { href: "/admin/security", title: "Review audit trail", description: "Track administrator sign-ins, configuration changes, and account actions.", icon: ShieldCheck },
  ];
  return <main>
    <DashboardHero variant="admin" eyebrow="Administration" title="Administration overview" description="A clear view of your accounts, email setup, and workspace activity." actions={<ButtonLink href="/admin/users" variant="outline">Manage users<ArrowUpRight size={16} /></ButtonLink>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(({label,value,icon:Icon,hint}) => <Card key={label}><CardContent><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{label}</p><span className="admin-metric-icon"><Icon size={18} aria-hidden="true" /></span></div><p className="mt-3 text-2xl font-semibold tabular-nums">{value === null ? "Unavailable" : Number(value).toLocaleString("en")}</p><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{hint}</p></CardContent></Card>)}</div>
    {cleanup.error ? <p role="alert" className="admin-notice mt-5">Account controls need setup. Apply the admin-controls migration before using the user directory or deletion tools.</p> : Boolean(cleanup.count) && <div className="admin-notice mt-5 flex flex-wrap items-center justify-between gap-3"><p>{cleanup.count} account cleanup {cleanup.count === 1 ? "needs" : "tasks need"} attention. These workspaces remain locked.</p><ButtonLink href="/admin/users?filter=cleanup" variant="outline" size="sm">Review cleanup</ButtonLink></div>}
    <section aria-label="Administration shortcuts" className="my-6 grid gap-4 lg:grid-cols-3">{quickLinks.map(({href,title,description,icon:Icon}) => <Link href={href} key={href} className="admin-shortcut focus-ring"><div className="flex justify-between gap-3 text-[var(--primary)]"><Icon size={20} aria-hidden="true" /><ArrowUpRight size={16} aria-hidden="true" /></div><h2 className="mt-4 text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">{description}</p></Link>)}</section>
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Microsoft connection setup</CardTitle><ButtonLink href="/admin/microsoft-settings" variant="ghost" size="sm">Manage setup</ButtonLink></CardHeader><CardContent>
        {settings.error ? <p role="alert">Microsoft settings unavailable. Check the administrator migration.</p> : <><span className="admin-status">{settings.data?.enabled ? "Default configuration enabled" : "Default configuration not enabled"}</span><p className="mt-4 text-sm font-semibold">{settings.data?.name ?? "No default configuration saved"}</p>{settings.data?.validation_error && <p className="mt-3 text-sm text-[var(--danger)]">{settings.data.validation_error}</p>}<dl className="admin-details mt-5"><dt>Default senders</dt><dd>{defaults.error ? "Unavailable" : defaults.count ?? 0}</dd><dt>Personal senders</dt><dd>{custom.error ? "Unavailable" : custom.count ?? 0}</dd><dt>Last verified</dt><dd>{adminDate(settings.data?.verified_at)}</dd><dt>Account audience</dt><dd>{adminAudience(settings.data?.detected_audience)}</dd></dl></>}
        <p className="mt-5 text-xs leading-6 text-[var(--muted-foreground)]">Each user grants their own mailbox permissions. A saved connection is not a live account or delivery test.</p>
      </CardContent></Card>
      <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Recent admin activity</CardTitle><ButtonLink href="/admin/security" variant="ghost" size="sm">All events</ButtonLink></CardHeader><CardContent>{activity.error ? <p role="alert">Audit data unavailable.</p> : !activity.data?.length ? <p className="text-sm text-[var(--muted-foreground)]">Admin actions will appear here once recorded.</p> : <ol className="admin-activity">{activity.data.map(entry => <li key={entry.id}><p className="text-sm font-medium capitalize">{entry.action.replaceAll("_"," ")}</p><p className="mt-1 break-all text-xs leading-5 text-[var(--muted-foreground)]">{entry.actor_email}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{adminDate(entry.created_at)}</p></li>)}</ol>}</CardContent></Card>
    </div>
    <Card className="mt-6"><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Latest accounts</CardTitle><ButtonLink href="/admin/users" variant="ghost" size="sm">View all users</ButtonLink></CardHeader><CardContent>{directory.error ? <p role="alert">Account directory unavailable until admin controls are configured.</p> : recent.length ? <ul className="divide-y divide-[var(--border)]">{recent.map(user => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0"><p className="break-words text-sm font-medium">{user.full_name || "New account"}</p><p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">{user.email}</p></div><ButtonLink href={"/admin/users/"+user.id} variant="outline" size="sm">Manage account</ButtonLink></li>)}</ul> : <p className="text-sm text-[var(--muted-foreground)]">No accounts registered yet.</p>}</CardContent></Card>
  </main>;
}
