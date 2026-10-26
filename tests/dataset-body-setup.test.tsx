import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DatasetSetupPanel } from "@/components/datasets/dataset-setup-panel";
import type { Dataset, DatasetColumn, EmailTemplate } from "@/types";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock("@/lib/supabase/client",()=>({getSupabaseBrowserClient:()=>({rpc:mocks.rpc})}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({error:null});});
const dataset={id:"dataset",body_source:"template",routing_column_id:null,fallback_template_id:null,subject_strategy:"template"} as Dataset;
const columns=[
  {id:"to",original_label:"Email",placeholder_slug:"email",standard_field:"recipient_email"},
  {id:"subject",original_label:"Subject",placeholder_slug:"subject",standard_field:"subject"},
  {id:"body",original_label:"Message",placeholder_slug:"message",standard_field:"email_body"},
] as DatasetColumn[];
describe("existing spreadsheet body setup",()=>{
 it("saves without sending empty-string UUIDs or requiring a template, then allows continuing",async()=>{
  const onContinue=vi.fn(); render(<DatasetSetupPanel dataset={dataset} columns={columns} templates={[]} onContinue={onContinue}/>);
  fireEvent.change(screen.getByLabelText("Where should the email body come from?"),{target:{value:"spreadsheet"}});
  expect(screen.queryByLabelText("Email template for everyone")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Which column contains the email bodies? (required)")).toHaveValue("body");
  expect(screen.getByRole("button",{name:"Continue to email content"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Save choices"}));
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith("save_spreadsheet_content_setup",{p_dataset_id:"dataset",p_email_column:"to",p_subject_column:"subject",p_body_column:"body",p_routing_column:null,p_template:null,p_source:"spreadsheet",p_signature:true}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Continue to email content"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Continue to email content"}));expect(onContinue).toHaveBeenCalledOnce();
 });
 it("still supports template setup and marks a change in body source unsaved",async()=>{
  const template={id:"template",name:"Introduction"} as EmailTemplate;
  render(<DatasetSetupPanel dataset={{...dataset,fallback_template_id:"template"}} columns={columns} templates={[template]} onContinue={vi.fn()}/>);
  expect(screen.getByLabelText("Email template for everyone")).toHaveValue("template");
  fireEvent.change(screen.getByLabelText("Where should the email body come from?"),{target:{value:"spreadsheet"}});
  expect(screen.getByRole("button",{name:"Continue to email content"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Which column contains the email bodies? (required)"),{target:{value:""}});
  expect(screen.getByRole("button",{name:"Save choices"})).toBeDisabled();
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
