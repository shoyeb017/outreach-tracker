import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SendPanel } from "@/components/sending/send-panel";
import { defaultEngagement } from "@/lib/engagement/core";
import type { Dataset, DatasetRow, EmailTemplate } from "@/types";
const mocks=vi.hoisted(()=>({send:vi.fn(),verify:vi.fn(),request:vi.fn(),inserted:[] as {table:string;payload:unknown}[],events:[] as string[]}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/engagement/client",()=>({engagementRequest:mocks.request}));
vi.mock("@/lib/microsoft/graph",()=>({sendGraphEmail:mocks.send,verifyMicrosoftSender:mocks.verify}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({title,children}:{title:string;children:React.ReactNode})=><section role="dialog" aria-label={title}>{children}</section>}));
vi.mock("@/lib/supabase/client",()=>({getSupabaseBrowserClient:()=>({auth:{getUser:async()=>({data:{user:{id:"owner"}}})},rpc:async(name:string)=>{mocks.events.push(name);return {data:name==="send_recipient_protection"?{suppressed:[],uncertain:[],scheduled:[],history:[]}:true,error:null};},from:(table:string)=>{
 let payload:unknown;const result=()=>({data:table==="dataset_rows"?[row]:table==="send_run_items"?payload?[{...(payload as object[])[0],id:"item"}]:[{id:"item"}]:null,error:null});
 const chain={select:()=>chain,eq:()=>chain,in:()=>chain,insert:(value:unknown)=>{payload=value;mocks.inserted.push({table,payload:value});return chain;},update:()=>chain,upsert:()=>chain,single:async()=>({data:{...(payload as object),id:"run"},error:null}),then:(resolve:(value:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};return chain;
}})}));
const row={id:"row",dataset_id:"dataset",row_number:1,data:{},original_data:{},recipient_email:"reader@example.com",email_valid:true,template_override_id:null,routing_value:null,subject_value:null} as DatasetRow;
const template={id:"template",name:"Introduction",is_active:true,is_archived:false,signature_behavior:"none",subject_template:"Hello",html_body:"<p>Message</p>",plain_text_body:"Message"} as EmailTemplate;
beforeEach(()=>{vi.clearAllMocks();mocks.inserted=[];mocks.events=[];mocks.verify.mockResolvedValue("sender@example.com");mocks.request.mockImplementation(async()=>{mocks.events.push("prepare-link");return {htmlBody:`<p>Message</p><a href="https://autmail.vercel.app/e/${"a".repeat(64)}">Visit</a>`,plainTextBody:"Message"};});mocks.send.mockImplementation(async()=>{mocks.events.push("graph-send");return {status:"sent"};});});
afterEach(cleanup);
function panel(live=true){return <SendPanel engagement={{...defaultEngagement,enabled:true,destination:"https://inuberry.com"}} dataset={{id:"dataset",fallback_template_id:"template",routing_column_id:null,subject_strategy:"template"} as Dataset} columns={[]} placeholderMappings={[]} templates={[template]} rules={[]} signatureFields={[]} preferences={{live_sending_enabled:live,delay_between_sends_ms:0}} integration={{connected_email:"sender@example.com",connection_status:"connected"}} selection={new Set(["row"])} suppressions={[]} history={[]} unfinishedRuns={[]} onRepair={vi.fn()}/>;}
describe("immediate engagement delivery ordering",()=>{
 it("never reserves a token while reviewing, then claims, prepares and sends the tracked body in order",async()=>{
  render(panel());fireEvent.click(screen.getByRole("button",{name:"Review and send"}));
  await screen.findByRole("button",{name:"Send 1 emails"});fireEvent.click(screen.getByRole("button",{name:"Preview email for row 1"}));
  expect(screen.getByRole("link",{name:"Visit our website"})).toHaveAttribute("href","#engagement-preview");expect(mocks.request).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Back to final review"}));fireEvent.click(screen.getByRole("button",{name:"Send 1 emails"}));
  await waitFor(()=>expect(mocks.send).toHaveBeenCalledOnce());
  expect(mocks.events.indexOf("claim_send_run_item")).toBeLessThan(mocks.events.indexOf("prepare-link"));expect(mocks.events.indexOf("prepare-link")).toBeLessThan(mocks.events.indexOf("graph-send"));
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({email:expect.objectContaining({htmlBody:expect.stringContaining("https://autmail.vercel.app/e/")})}));
  const inserted=mocks.inserted.find(value=>value.table==="send_run_items")!.payload as {engagement_snapshot:{enabled:boolean};resolved_html_body:string}[];
  expect(inserted[0].engagement_snapshot.enabled).toBe(true);expect(inserted[0].resolved_html_body).not.toContain("/e/");
 });
 it("keeps practice untracked and uses a direct destination in the saved body",async()=>{
  mocks.send.mockResolvedValue({status:"simulated"});render(panel(false));fireEvent.click(screen.getByRole("button",{name:"Review and send"}));fireEvent.click(await screen.findByRole("button",{name:"Practice with 1 recipients"}));
  await waitFor(()=>expect(mocks.send).toHaveBeenCalledOnce());expect(mocks.request).not.toHaveBeenCalled();
  const inserted=mocks.inserted.find(value=>value.table==="send_run_items")!.payload as {engagement_snapshot?:unknown;resolved_html_body:string}[];
  expect(inserted[0].engagement_snapshot).toBeUndefined();expect(inserted[0].resolved_html_body).toContain('href="https://inuberry.com"');expect(mocks.verify).not.toHaveBeenCalled();
 });
});
