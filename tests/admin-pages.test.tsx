import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({admin:vi.fn(),db:vi.fn(),rpc:vi.fn(),failure:false}));
vi.mock("@/lib/admin/server",()=>({requireAdministrator:mocks.admin,privilegedDatabase:mocks.db}));
vi.mock("@/components/motion/blue-tubes-background",()=>({BlueTubesBackground:()=>null}));
import AdminOverview from "@/app/admin/(protected)/page";
import AdminUsers from "@/app/admin/(protected)/users/page";
import AdminSecurity from "@/app/admin/(protected)/security/page";
const account={id:"22222222-2222-4222-8222-222222222222",email:"alex@example.com",full_name:"Alex Example",created_at:"2026-10-09T12:00:00Z",last_sign_in_at:null,confirmed:true,connection_status:"connected",connected_email:"sender@example.com",deletion_status:null,administrator:false};
beforeEach(()=>{
  vi.clearAllMocks();mocks.failure=false;mocks.admin.mockResolvedValue({id:null,email:"admin@example.com"});mocks.rpc.mockResolvedValue({data:{total:52,users:[account]},error:null});
  mocks.db.mockReturnValue({rpc:mocks.rpc,from:(table:string)=>{
    const result=()=>({error:mocks.failure ? {message:"unavailable"} : null,count:2,data:table==="admin_audit_log" ? [{id:"event",action:"account_deleted",actor_email:"admin@example.com",created_at:"2026-10-09T12:00:00Z",details:{user_id:account.id}}] : table==="microsoft_default_configuration" ? {enabled:true,name:"Application default",verified_at:null} : null});
    const query={select:()=>query,eq:()=>query,neq:()=>query,in:()=>query,ilike:()=>query,order:()=>query,range:()=>query,limit:()=>query,maybeSingle:async()=>result(),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};return query;
  }});
});
afterEach(cleanup);
describe("administrator page structure",()=>{
  it("shows workspace metrics, useful shortcuts, setup status, and recent users",async()=>{
    const view=render(await AdminOverview());expect(screen.getByRole("heading",{name:"Administration overview"})).toBeVisible();
    expect(view.container.querySelector('[data-dashboard-hero="admin"] [data-tubes-background]')).toHaveAttribute("aria-hidden","true");
    for(const name of ["Accounts","Connected senders","Spreadsheets","Personal templates","Campaigns","Live sends recorded"])expect(screen.getByText(name,{exact:true})).toBeVisible();
    expect(screen.getByRole("link",{name:/Manage accounts/})).toHaveAttribute("href","/admin/users");expect(screen.getByText("Alex Example")).toBeVisible();expect(screen.getByRole("link",{name:"Review cleanup"})).toHaveAttribute("href","/admin/users?filter=cleanup");
  });
  it("passes search text as an RPC parameter, preserves filters on pagination, and links account controls",async()=>{
    render(await AdminUsers({searchParams:Promise.resolve({search:"alex',or(email)",filter:"connected",page:"1.7"})}));
    expect(mocks.rpc).toHaveBeenCalledWith("admin_user_directory",{p_search:"alex',or(email)",p_filter:"connected",p_page:1});
    expect(screen.getByRole("link",{name:"Manage account"})).toHaveAttribute("href","/admin/users/"+account.id);expect(screen.getByRole("link",{name:"Next"}).getAttribute("href")).toContain("filter=connected");
  });
  it("shows directory and audit errors without presenting false success",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:"missing"}});const users=render(await AdminUsers({searchParams:Promise.resolve({})}));expect(screen.getByRole("alert")).toHaveTextContent("migration");users.unmount();
    mocks.failure=true;render(await AdminSecurity({searchParams:Promise.resolve({})}));expect(screen.getByRole("alert")).toHaveTextContent("Audit data unavailable");
  });
  it("shows a paginated audit table and collapsed safeguards instead of a crowded wall of settings",async()=>{
    render(await AdminSecurity({searchParams:Promise.resolve({category:"accounts"})}));expect(screen.getByRole("table")).toBeVisible();expect(screen.getByRole("link",{name:"Account details"})).toHaveAttribute("href","/admin/users/"+account.id);expect(screen.getByText("Authentication and security safeguards").closest("details")).not.toHaveAttribute("open");
  });
});
