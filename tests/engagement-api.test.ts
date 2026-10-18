// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEngagement } from "@/lib/engagement/core";
const mocks=vi.hoisted(()=>({context:vi.fn(),rpc:vi.fn(),from:vi.fn(),eq:vi.fn(),upsert:vi.fn(),select:vi.fn(),single:vi.fn(),origin:vi.fn(),client:vi.fn()}));
vi.mock("@/lib/engagement/server",async original=>({...await original<typeof import("@/lib/engagement/server")>(),engagementUser:mocks.context,engagementOrigin:mocks.origin}));
import { POST as followup } from "@/app/api/engagement/route";
import { POST as prepare } from "@/app/api/engagement/prepare/route";
import { PUT as settings } from "@/app/api/engagement/settings/route";
const owner="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222";
beforeEach(()=>{
 vi.clearAllMocks();const chain={select:mocks.select,eq:mocks.eq,upsert:mocks.upsert,maybeSingle:mocks.single,single:mocks.single};mocks.from.mockReturnValue(chain);mocks.select.mockReturnValue(chain);mocks.eq.mockReturnValue(chain);mocks.upsert.mockReturnValue(chain);mocks.single.mockResolvedValue({data:{id},error:null});mocks.rpc.mockResolvedValue({data:{id},error:null});mocks.origin.mockReturnValue("https://autmail.vercel.app");mocks.context.mockResolvedValue({user:{id:owner},database:{from:mocks.from,rpc:mocks.rpc}});
});
const request=(path:string,body:unknown,method="POST")=>new Request(`https://autmail.vercel.app/api/engagement${path}`,{method,headers:{Origin:"https://autmail.vercel.app","Content-Type":"application/json"},body:JSON.stringify(body)});
describe("private engagement APIs",()=>{
 it("binds follow-up creation to the authenticated owner and requires explicit confirmation",async()=>{
  const body={ids:[id],name:"Follow-up",requestKey:crypto.randomUUID(),confirmed:true,userId:"attacker"};
  expect((await followup(request("",body))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("engagement_create_followup",expect.objectContaining({p_owner:owner,p_ids:[id]}));
  mocks.rpc.mockClear();expect((await followup(request("",{...body,confirmed:false}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("refuses more than 500 selected messages",async()=>{
  expect((await followup(request("",{ids:Array(501).fill(id),name:"Too many",requestKey:crypto.randomUUID(),confirmed:true}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("checks item ownership and uses the configured origin, not a supplied tracking URL",async()=>{
  expect((await prepare(request("/prepare",{itemId:id,origin:"https://attacker.example"}))).status).toBe(200);
  expect(mocks.eq).toHaveBeenCalledWith("user_id",owner);expect(mocks.rpc).toHaveBeenCalledWith("engagement_prepare_send",{p_item:id,p_origin:"https://autmail.vercel.app"});
  mocks.rpc.mockClear();mocks.single.mockResolvedValue({data:null,error:null});expect((await prepare(request("/prepare",{itemId:id}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("validates destinations and styling before saving, and never trusts a posted owner",async()=>{
  const value={...defaultEngagement,enabled:true,destination:"https://inuberry.com",user_id:"attacker"};
  expect((await settings(request("/settings",value,"PUT"))).status).toBe(200);expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({user_id:owner}),expect.anything());
  mocks.upsert.mockClear();expect((await settings(request("/settings",{...value,destination:"javascript:alert(1)"},"PUT"))).status).toBe(400);expect(mocks.upsert).not.toHaveBeenCalled();
 });
 it("stops private operations when authentication, workspace or same-origin checks fail",async()=>{
  mocks.context.mockRejectedValue(new Error("Sign in again."));expect((await prepare(request("/prepare",{itemId:id}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
