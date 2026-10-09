// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({ actor:vi.fn(), origin:vi.fn(), limit:vi.fn(), db:vi.fn(), rpc:vi.fn(), remove:vi.fn() }));
vi.mock("@/lib/admin/server",()=>({ administrator:mocks.actor, assertSameOrigin:mocks.origin, limitRequest:mocks.limit, privilegedDatabase:mocks.db }));
vi.mock("@/lib/admin/account-controls",()=>({ deleteAccount:mocks.remove }));
import { POST } from "@/app/api/admin/users/[id]/route";
const id="22222222-2222-4222-8222-222222222222";
const request=(body:unknown)=>new Request("https://app.example/api/admin/users/"+id,{method:"POST",body:JSON.stringify(body)});
const params={params:Promise.resolve({id})};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({id:null,email:"admin@example.com"});mocks.origin.mockImplementation(()=>undefined);mocks.limit.mockResolvedValue(undefined);mocks.db.mockReturnValue({rpc:mocks.rpc});mocks.rpc.mockResolvedValue({data:true,error:null});mocks.remove.mockResolvedValue(undefined);});
describe("account controls endpoint",()=>{
  it("denies unauthenticated and ordinary users before privileged reads",async()=>{mocks.actor.mockResolvedValue(null);expect((await POST(request({action:"disconnect"}),params)).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();});
  it("rejects wrong origins before authentication or mutation",async()=>{mocks.origin.mockImplementation(()=>{throw new Error("Wrong origin");});expect((await POST(request({action:"disconnect"}),params)).status).toBe(400);expect(mocks.actor).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();});
  it.each([{action:"delete",confirmation:"user@example.com"},{action:"delete",confirmation:"not-email",acknowledged:true},{action:"unknown"}])("requires a valid explicit deletion acknowledgement: %j",async body=>{expect((await POST(request(body),params)).status).toBe(400);expect(mocks.db).not.toHaveBeenCalled();});
  it("requires UUID targets",async()=>{expect((await POST(request({action:"disconnect"}),{params:Promise.resolve({id:"../other"})})).status).toBe(400);expect(mocks.db).not.toHaveBeenCalled();});
  it("enforces persistent limits before mutation",async()=>{mocks.limit.mockRejectedValue(new Error("Too many requests"));expect((await POST(request({action:"disconnect"}),params)).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();});
  it("disconnects through the audited service-only target guard",async()=>{const response=await POST(request({action:"disconnect"}),params);expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("no-store");expect(mocks.rpc).toHaveBeenCalledWith("admin_disconnect_sender",{p_target:id,p_actor:null,p_email:"admin@example.com"});});
  it("invokes scoped deletion only after confirmation validation",async()=>{expect((await POST(request({action:"delete",confirmation:"user@example.com",acknowledged:true}),params)).status).toBe(200);expect(mocks.remove).toHaveBeenCalledWith({rpc:mocks.rpc},id,"user@example.com",{id:null,email:"admin@example.com"});});
  it("preserves server-protected administrator rejection",async()=>{mocks.rpc.mockResolvedValue({error:{code:"P0001",message:"Administrator accounts cannot be changed here."}});const response=await POST(request({action:"disconnect"}),params);expect(response.status).toBe(400);expect((await response.json()).error).toContain("Administrator");});
});
