import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EngagementWorkspace } from "@/components/engagement/engagement-workspace";
import { EngagementSettings } from "@/components/engagement/engagement-settings";
import { defaultEngagement } from "@/lib/engagement/core";
const mocks=vi.hoisted(()=>({request:vi.fn(),refresh:vi.fn(),send:vi.fn()}));
vi.mock("@/lib/engagement/client",()=>({engagementRequest:mocks.request}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock("@/lib/microsoft/graph",()=>({sendGraphEmail:mocks.send,verifyMicrosoftSender:vi.fn()}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({title,children}:{title:string;children:React.ReactNode})=><section role="dialog" aria-label={title}>{children}</section>}));
const id="11111111-1111-4111-8111-111111111111",source="22222222-2222-4222-8222-222222222222";
const message={id,dataset_id:source,campaign_id:"campaign",dataset_name:"Contacts",template_name:"Accounting firm Outreach",recipient_email:"reader@example.com",subject:"Introduction",destination:"https://inuberry.com",status:"accepted",accepted_at:"2026-10-19T00:00:00Z",first_activity_at:null,last_activity_at:null,activity_count:0,suspected_count:0,last_suspected_at:null,created_at:"2026-10-19T00:00:00Z",expires_at:"2027-01-17T00:00:00Z"};
const results={messages:[message],sources:[{id:source,name:"Contacts"}],campaigns:[],page:1,total:1};
beforeEach(()=>{vi.clearAllMocks();mocks.request.mockImplementation(async(url:string,options?:RequestInit)=>url==="/api/engagement/settings"?{settings:{...defaultEngagement,enabled:true,destination:"https://inuberry.com"}}:options?.method==="POST"?{id:"new-spreadsheet",added:1,omitted:0}:results);});
afterEach(cleanup);
describe("simple engagement UI",()=>{
 it("selects a zero-click message directly, chooses its source automatically and requires confirmation",async()=>{
  render(<EngagementWorkspace/>);await screen.findByText("reader@example.com");
  expect(screen.getByRole("button",{name:"Create follow-up spreadsheet"})).toBeDisabled();
  expect(screen.getByRole("checkbox")).toBeEnabled();
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(()=>expect(screen.getByLabelText("Source spreadsheet")).toHaveValue(source));
  fireEvent.click(screen.getByRole("button",{name:"Create follow-up spreadsheet"}));
  expect(screen.getByRole("button",{name:"Create spreadsheet"})).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox",{name:/Create this spreadsheet only/}));
  fireEvent.click(screen.getByRole("button",{name:"Create spreadsheet"}));
  await screen.findByText("Follow-up spreadsheet created");
  expect(screen.getByRole("link",{name:/Choose follow-up template/})).toHaveAttribute("href","/datasets/new-spreadsheet?tab=required-setup");
  const calls=mocks.request.mock.calls.filter(([,options])=>options?.method==="POST");expect(calls).toHaveLength(1);expect(JSON.parse(calls[0][1].body)).toMatchObject({ids:[id],confirmed:true});
  expect(mocks.send).not.toHaveBeenCalled();
 });
 it("separates suspected-only activity, excludes failed messages from selection and clears selection on filter change",async()=>{
  mocks.request.mockResolvedValue({...results,collectionEnabled:false,messages:[{...message,suspected_count:1},{...message,id:"failed",recipient_email:"failed@example.com",status:"failed"}]});
  render(<EngagementWorkspace/>);await screen.findByText("Suspected automated activity only");
  expect(screen.getByText(/Activity recording is paused in Settings/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Source spreadsheet"),{target:{value:source}});
  await waitFor(()=>expect(screen.getByRole("checkbox",{name:`Select reader@example.com, message ${id}`})).toBeEnabled());
  expect(screen.getByRole("checkbox",{name:"Select failed@example.com, message failed"})).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox",{name:`Select reader@example.com, message ${id}`}));
  fireEvent.change(screen.getByLabelText("Activity"),{target:{value:"suspected"}});
  await waitFor(()=>expect(screen.getByRole("button",{name:"Create follow-up spreadsheet"})).toBeDisabled());
 });
 it("shows inactive button previews, keeps changes local until Save and requires confirmation for real tests",async()=>{
  render(<EngagementSettings/>);await screen.findByLabelText("Website to open");
  expect(screen.getByRole("link",{name:"Visit our website"})).toHaveAttribute("href","#engagement-preview");
  fireEvent.click(screen.getByRole("link",{name:"Visit our website"}));expect(mocks.request).toHaveBeenCalledTimes(1);expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Button text"),{target:{value:"Explore services"}});
  expect(mocks.request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button",{name:"Save engagement settings"}));
  await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith("/api/engagement/settings",expect.objectContaining({method:"PUT"})));
  expect(mocks.send).not.toHaveBeenCalled();
 });
 it("does not silently delete history without approval",async()=>{
  vi.spyOn(window,"confirm").mockReturnValue(false);render(<EngagementWorkspace/>);await screen.findByText("reader@example.com");
  fireEvent.click(screen.getByRole("button",{name:"Delete engagement history and disable its links"}));
  expect(mocks.request.mock.calls.filter(([,options])=>options?.method==="DELETE")).toHaveLength(0);
  vi.restoreAllMocks();
 });
});
