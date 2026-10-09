import Link from "next/link";
import { requireAdministrator, privilegedDatabase } from "@/lib/admin/server";
import { adminDate, adminPageNumber, type AdminDirectoryUser } from "@/lib/admin/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string; search?: string; filter?: string; deleted?: string }> }) {
  const admin = await requireAdministrator();
  const input = await searchParams;
  const page = adminPageNumber(input.page), search = (input.search ?? "").trim().slice(0,120);
  const filter = ["connected","not_connected","cleanup"].includes(input.filter ?? "") ? input.filter! : "all";
  const { data, error } = await privilegedDatabase().rpc("admin_user_directory", { p_search: search, p_filter: filter, p_page: page });
  const users = (data?.users ?? []) as AdminDirectoryUser[], total = Number(data?.total ?? 0);
  const pageLink = (number: number) => `?${new URLSearchParams({ search, filter, page: String(number) })}`;
  return <main>
    <PageHeader eyebrow="Account management" title="Registered users" description="Find an account, check its workspace, or manage its saved sender. Open an account for deletion and cleanup controls." actions={<ButtonLink href="/admin" variant="outline">Back to overview</ButtonLink>} />
    {input.deleted === "1" && <p role="status" className="admin-notice mb-6">Account deletion completed. Its workspace data and uploaded files were removed. The audit record is available in Security &amp; audit.</p>}
    <form className="admin-filter-bar mb-6 grid items-end gap-4 sm:grid-cols-[1fr_220px_auto]" action="/admin/users">
      <div><Label htmlFor="user-search">Search name or account email</Label><Input id="user-search" name="search" defaultValue={search} maxLength={120} placeholder="e.g. alex@example.com" /></div>
      <div><Label htmlFor="user-filter">Show accounts</Label><select id="user-filter" name="filter" defaultValue={filter} className="admin-select w-full"><option value="all">All accounts</option><option value="connected">Sender connected</option><option value="not_connected">No connected sender</option><option value="cleanup">Cleanup needs attention</option></select></div>
      <div className="flex gap-2"><Button type="submit">Search</Button>{(search || filter !== "all") && <ButtonLink href="/admin/users" variant="ghost">Clear</ButtonLink>}</div>
    </form>
    {error ? <p role="alert" className="admin-notice">The account directory is unavailable. Apply the admin-controls migration and check server access.</p> : <>
      <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm text-[var(--muted-foreground)]"><p>{total} {total === 1 ? "account" : "accounts"}{search && " matching your search"}</p><p>Dates shown in UTC</p></div>
      <div className="table-frame" role="region" aria-label="Registered users" tabIndex={0}><table className="data-table w-full min-w-[780px]"><thead><tr>{["Account","Microsoft sender","Account status","Joined","Manage"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{users.map(user => <tr key={user.id}>
        <td className="max-w-72"><Link href={`/admin/users/${user.id}`} className="focus-ring font-semibold">{user.full_name || user.email || "Unnamed account"}</Link><span className="cell-meta break-all">{user.email ?? "No email"}</span></td>
        <td className="max-w-64 break-all">{user.deletion_status ? "Workspace locked" : user.connection_status === "connected" ? user.connected_email || "Saved connection" : "Not connected"}<span className="cell-meta">Saved metadata, not a live mailbox check</span></td>
        <td>{user.administrator || user.email?.toLowerCase() === admin.email ? <span className="admin-status">Administrator · protected</span> : user.deletion_status ? <span className="text-[var(--danger)]">{user.deletion_status === "failed" ? "Cleanup needs retry" : "Cleanup in progress"}</span> : user.confirmed ? "Email verified" : "Email unverified"}</td>
        <td className="whitespace-nowrap text-xs">{adminDate(user.created_at)}</td><td><ButtonLink href={`/admin/users/${user.id}`} variant="outline" size="sm">Manage account</ButtonLink></td>
      </tr>)}</tbody></table>{!users.length && <div className="p-8 text-center"><p className="font-semibold">No accounts found</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">Try a different search or clear the filters.</p></div>}</div>
      <nav className="mt-5 flex flex-wrap items-center gap-4 text-sm" aria-label="User directory pages">{page > 1 && <ButtonLink variant="outline" href={pageLink(page-1)}>Previous</ButtonLink>}<span>Page {page} of {Math.max(1,Math.ceil(total/50))}</span>{page*50 < total && <ButtonLink variant="outline" href={pageLink(page+1)}>Next</ButtonLink>}</nav>
    </>}
  </main>;
}
