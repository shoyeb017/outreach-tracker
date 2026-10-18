// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),database:vi.fn(),client:vi.fn()}));
vi.mock("@/lib/admin/server",()=>({privilegedDatabase:mocks.database}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseServerClient:mocks.client}));
import { GET,HEAD } from "@/app/e/[token]/route";
const token="a".repeat(64),owner="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockReturnValue({abortSignal:async()=>({data:"https://inuberry.com/services",error:null})});mocks.database.mockReturnValue({rpc:mocks.rpc});mocks.client.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:owner}}})}});});
const context=(value=token)=>({params:Promise.resolve({token:value})});
describe("public opaque engagement links",()=>{
 it("redirects anonymous recipients without sign-in, cookies, email addresses or token disclosure",async()=>{
  const response=await GET(new Request(`https://autmail.vercel.app/e/${token}`,{headers:{"User-Agent":"Mozilla/5.0"}}),context());
  expect(response.status).toBe(302);expect(response.headers.get("Location")).toBe("https://inuberry.com/services");expect(response.headers.get("Cache-Control")).toContain("no-store");expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");expect(response.headers.get("Set-Cookie")).toBeNull();
  expect(mocks.rpc).toHaveBeenCalledWith("engagement_visit",expect.objectContaining({p_kind:"visit",p_viewer:null,p_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}));expect(mocks.rpc.mock.calls[0][1].p_hash).not.toBe(token);expect(mocks.client).not.toHaveBeenCalled();
 });
 it("passes identifiable sender identity privately and ignores HEAD/prefetch recording",async()=>{
  await GET(new Request(`https://autmail.vercel.app/e/${token}`,{headers:{cookie:"sb-fixture=opaque","Sec-Purpose":"prefetch"}}),context());expect(mocks.rpc).toHaveBeenLastCalledWith("engagement_visit",expect.objectContaining({p_viewer:owner,p_kind:"ignore"}));
  await HEAD(new Request(`https://autmail.vercel.app/e/${token}`,{method:"HEAD"}),context());expect(mocks.rpc).toHaveBeenLastCalledWith("engagement_visit",expect.objectContaining({p_kind:"ignore"}));
 });
 it("rejects malformed, expired and unsafe destinations without accepting an arbitrary URL parameter",async()=>{
  expect((await GET(new Request("https://autmail.vercel.app/e/invalid?url=https://attacker.example"),context("invalid"))).status).toBe(404);expect(mocks.rpc).not.toHaveBeenCalled();
  for(const destination of [null,"javascript:alert(1)","https://user:secret@example.com"]){mocks.rpc.mockReturnValue({abortSignal:async()=>({data:destination,error:null})});const response=await GET(new Request(`https://autmail.vercel.app/e/${token}`),context());expect(response.status).toBe(404);expect(response.headers.get("Location")).toBeNull();}
 });
 it("does not expose backend errors or secrets",async()=>{mocks.database.mockImplementation(()=>{throw new Error("secret-internal-error");});const response=await GET(new Request(`https://autmail.vercel.app/e/${token}`),context());expect(response.status).toBe(503);expect(await response.text()).not.toContain("secret-internal");});
});
