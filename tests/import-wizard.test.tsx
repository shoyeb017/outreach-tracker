import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ImportWizard } from "@/components/spreadsheet/import-wizard";
import type { DatasetColumn, DatasetPlaceholderMapping, DatasetRow, EmailTemplate } from "@/types";
import { inspectSpreadsheetFile, parseSpreadsheetFile, type ParsedSheet } from "@/lib/spreadsheet/parser";
import { prepareRowEmail } from "@/lib/email/render";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), database: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: mocks.database }));
vi.mock("@/lib/spreadsheet/parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/spreadsheet/parser")>();
  return { ...actual, inspectSpreadsheetFile: vi.fn().mockResolvedValue({ fileName: "contacts.csv", sheetNames: ["Contacts"] }), parseSpreadsheetFile: vi.fn().mockResolvedValue({ fileName: "contacts.csv", selectedSheet: "Contacts", sheetNames: ["Contacts"], columns: [{ originalLabel: "Public Email", slug: "public_email", index: 0 }, { originalLabel: "Business Name", slug: "business_name", index: 1 }], rows: [{ "Public Email": "contact@example.com", "Business Name": "Northstar Labs" }], previewRows: [{ "Public Email": "contact@example.com", "Business Name": "Northstar Labs" }] }) };
});
afterEach(cleanup);
const parsedSheet: ParsedSheet = { fileName: "contacts.csv", selectedSheet: "Contacts", sheetNames: ["Contacts"], columns: [{ originalLabel: "Public Email", slug: "public_email", index: 0 }, { originalLabel: "Business Name", slug: "business_name", index: 1 }], rows: [{ "Public Email": "contact@example.com", "Business Name": "Northstar Labs" }], previewRows: [{ "Public Email": "contact@example.com", "Business Name": "Northstar Labs" }], analysis: { totalRows: 1, potentialEmails: 1, missingValues: 0, duplicateRows: 0, invalidEmails: 0 } };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(parseSpreadsheetFile).mockResolvedValue(parsedSheet); vi.mocked(inspectSpreadsheetFile).mockResolvedValue({ fileName: "contacts.csv", sheetNames: ["Contacts"] }); });
const template = { id: "template", name: "Introduction", subject_template: "Hi {{company_name}}", html_body: "<p>Hi {{company_name}}</p>", plain_text_body: null, is_active: true, is_archived: false } as EmailTemplate;

describe("first-time spreadsheet setup", () => {
  it("lists worksheets before parsing any rows, requires a deliberate selection and suggests the combined name", async () => {
    vi.mocked(inspectSpreadsheetFile).mockResolvedValue({ fileName: "contacts.xlsx", sheetNames: ["Empty summary", "Partners"] });
    vi.mocked(parseSpreadsheetFile).mockResolvedValue({ ...parsedSheet, fileName: "contacts.xlsx", selectedSheet: "Partners", sheetNames: ["Empty summary", "Partners"] });
    render(<ImportWizard templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Choose a spreadsheet file"), { target: { files: [new File(["mock"], "contacts.xlsx")] } });
    await screen.findByRole("heading", { name: "Choose the worksheet to import" });
    expect(parseSpreadsheetFile).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Worksheet")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Use this worksheet/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Worksheet"), { target: { value: "Partners" } });
    fireEvent.click(screen.getByRole("button", { name: /Use this worksheet/ }));
    await screen.findByLabelText("Which column contains the email address we should send to?");
    expect(parseSpreadsheetFile).toHaveBeenCalledWith(expect.any(File), "Partners");
    expect(screen.getByText(/Worksheet: Partners/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email template for everyone"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Spreadsheet name")).toHaveValue("contacts — Partners");
  });
  it("keeps the sheet picker usable after an empty worksheet and resets mappings when switching", async () => {
    const names = ["Summary", "Contacts", "Other"];
    vi.mocked(inspectSpreadsheetFile).mockResolvedValue({ fileName: "book.ods", sheetNames: names });
    vi.mocked(parseSpreadsheetFile).mockImplementation(async (_file, sheet) => sheet === "Summary" ? { ...parsedSheet, rows: [], previewRows: [] } : sheet === "Other" ? { ...parsedSheet, fileName: "book.ods", sheetNames: names, selectedSheet: "Other", columns: [{ originalLabel: "Partner Email", slug: "partner_email", index: 0 }], rows: [{ "Partner Email": "other@example.com" }], previewRows: [{ "Partner Email": "other@example.com" }] } : { ...parsedSheet, fileName: "book.ods", sheetNames: names });
    render(<ImportWizard templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Choose a spreadsheet file"), { target: { files: [new File(["mock"], "book.ods")] } });
    await screen.findByLabelText("Worksheet");
    fireEvent.change(screen.getByLabelText("Worksheet"), { target: { value: "Summary" } });
    fireEvent.click(screen.getByRole("button", { name: /Use this worksheet/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no recipient rows");
    fireEvent.change(screen.getByLabelText("Worksheet"), { target: { value: "Contacts" } });
    fireEvent.click(screen.getByRole("button", { name: /Use this worksheet/ }));
    await screen.findByLabelText("Which column contains the email address we should send to?");
    expect(screen.getByLabelText("Which column contains the email address we should send to?")).toHaveValue("Public Email");
    fireEvent.click(screen.getByRole("button", { name: "Change worksheet" }));
    fireEvent.change(screen.getByLabelText("Worksheet"), { target: { value: "Other" } });
    fireEvent.click(screen.getByRole("button", { name: /Use this worksheet/ }));
    await waitFor(() => expect(screen.getByText(/Worksheet: Other/)).toBeInTheDocument());
    expect(screen.getByLabelText("Which column contains the email address we should send to?")).toHaveValue("");
    expect(screen.queryByRole("option", { name: "Public Email" })).not.toBeInTheDocument();
  });

  async function upload() {
    fireEvent.change(screen.getByLabelText("Choose a spreadsheet file"), { target: { files: [new File(["mock"], "contacts.csv")] } });
    await screen.findByLabelText("Which column contains the email address we should send to?");
  }
  it("uses an icon file-picker button and preserves the selected file name on Back", async () => {
    render(<ImportWizard templates={[template]} />);
    const input = screen.getByLabelText("Choose a spreadsheet file");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose file" }));
    expect(click).toHaveBeenCalledOnce();
    expect(input).toHaveClass("sr-only");
    await upload();
    expect(screen.getByRole("heading", { name: "Recipient emails" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeEnabled();
    expect(screen.getAllByText("contacts.csv")).toHaveLength(2);
  });
  it("offers only two subject types and only asks for a column when needed", async () => {
    render(<ImportWizard templates={[template]} />); await upload();
    fireEvent.click(screen.getByText("Subject options (optional)"));
    const source = screen.getByLabelText("Subject source");
    expect(within(source).getAllByRole("option")).toHaveLength(2);
    expect(source).toHaveValue("template");
    expect(screen.queryByLabelText("Spreadsheet subject column")).not.toBeInTheDocument();
    fireEvent.change(source, { target: { value: "spreadsheet_fallback" } });
    expect(screen.getByLabelText("Spreadsheet subject column")).toBeRequired();
    fireEvent.change(source, { target: { value: "template" } });
    expect(screen.queryByLabelText("Spreadsheet subject column")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Choose templates" })).toBeInTheDocument();
  });
  it("rejects using the recipient email column for spreadsheet subjects", async () => {
    render(<ImportWizard templates={[template]} />); await upload();
    fireEvent.change(screen.getByLabelText("Subject source"), { target: { value: "spreadsheet_fallback" } });
    fireEvent.change(screen.getByLabelText("Spreadsheet subject column"), { target: { value: "Public Email" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Email addresses and subjects must use different columns");
  });
  it("requires the shared default template when a group uses it", async () => {
    render(<ImportWizard templates={[template]} />); await upload();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("radio", { name: /Different templates by spreadsheet value/ }));
    fireEvent.change(screen.getByLabelText("Which column should choose the template?"), { target: { value: "Business Name" } });
    const action = screen.getByLabelText("Action for Northstar Labs");
    expect(within(action).getAllByRole("option").map((option) => option.textContent)).toEqual(["Skip these recipients", "Choose a template", "Use default template"]);
    expect(action).toHaveValue("skip");
    expect(screen.queryByLabelText("Email template for Northstar Labs")).not.toBeInTheDocument();
    fireEvent.change(action, { target: { value: "fallback" } });
    const defaultTemplate = screen.getByLabelText("Default template (required)");
    expect(defaultTemplate).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a default template below");
    fireEvent.change(defaultTemplate, { target: { value: "template" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Default: Introduction")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Personalize your emails" })).toBeInTheDocument();
    expect(screen.getByLabelText("Spreadsheet column for company_name")).toHaveValue("Business Name");
  });
  it.each([
    ["Accounting firm Arlington, Virginia", false],
    ["Accounting firm Arlington, Virginia, Business consulting Arlington", false],
    ["Acounting firm Arlington", true],
  ])("suggests the accounting template during creation for %s", async (value, typo) => {
    const rows = [{ "Public Email": "contact@example.com", "Business Name": value }];
    vi.mocked(parseSpreadsheetFile).mockResolvedValue({ ...parsedSheet, rows, previewRows: rows });
    const accounting = { ...template, id: "accounting", name: "Accounting firm Outreach", category: "Accounting firm" };
    const consulting = { ...template, id: "consulting", name: "Business consulting Outreach", category: "Business consulting" };
    render(<ImportWizard templates={[consulting, accounting]} />); await upload();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("radio", { name: /Different templates by spreadsheet value/ }));
    fireEvent.change(screen.getByLabelText("Which column should choose the template?"), { target: { value: "Business Name" } });
    expect(screen.getByLabelText(`Action for ${value}`)).toHaveValue("template");
    expect(screen.getByLabelText(`Email template for ${value}`)).toHaveValue("accounting");
    expect(screen.getByText(typo ? /Possible spelling match: Accounting firm/ : /Matched business type: Accounting firm/)).toBeInTheDocument();
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("requires a specific template only for Choose a template, and allows deliberate skips", async () => {
    render(<ImportWizard templates={[template]} />); await upload();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("radio", { name: /Different templates by spreadsheet value/ }));
    fireEvent.change(screen.getByLabelText("Which column should choose the template?"), { target: { value: "Business Name" } });
    const action = screen.getByLabelText("Action for Northstar Labs");
    fireEvent.change(action, { target: { value: "template" } });
    expect(screen.getByLabelText("Email template for Northstar Labs")).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent('Choose an active template for "Northstar Labs"');
    fireEvent.change(action, { target: { value: "skip" } });
    expect(screen.getByLabelText("Default template (optional)")).not.toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("No spreadsheet fields are needed for these emails. You can continue.")).toBeInTheDocument();
  });
  it("uses consistent step names and disables later steps until reached", async () => {
    render(<ImportWizard templates={[template]} />);
    const nav = screen.getByRole("navigation", { name: "Spreadsheet creation" });
    expect(within(nav).getAllByRole("button")).toHaveLength(5);
    expect(within(nav).getByRole("button", { name: /Choose templates/ })).toBeDisabled();
    expect(within(nav).getByRole("button", { name: /Save spreadsheet/ })).toBeDisabled();
    await upload();
    expect(within(nav).getByRole("button", { name: /Email setup/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/select individual rows after saving/)).toBeInTheDocument();
  });
  it("can return to Upload and continue with the same file without resetting choices", async () => {
    render(<ImportWizard templates={[template]} />);
    await upload();
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue with this file" }));
    expect(screen.getByLabelText("Which column contains the email address we should send to?")).toHaveValue("Public Email");
  });
  it("requires each personalization column before moving to Save", async () => {
    render(<ImportWizard templates={[template]} />);
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email template for everyone"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Spreadsheet column for company_name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Connect these fields before continuing: {{company_name}}");
    expect(screen.queryByRole("heading", { name: "Save your spreadsheet" })).not.toBeInTheDocument();
  });
  it("requires a subject column for spreadsheet subjects and keeps template fields for fallback", async () => {
    render(<ImportWizard templates={[{ ...template, subject_template: "{{subject_only}}" }]} />);
    await upload();
    fireEvent.change(screen.getByLabelText("Subject source"), { target: { value: "spreadsheet_fallback" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the spreadsheet column containing subject lines");
    fireEvent.change(screen.getByLabelText("Spreadsheet subject column"), { target: { value: "Business Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email template for everyone"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Spreadsheet column for subject_only")).toBeInTheDocument();
    expect(screen.getByLabelText("Spreadsheet column for company_name")).toHaveValue("Business Name");
  });
  it("shows the saved-setup handoff without confusing it with sending", async () => {
    render(<ImportWizard templates={[template]} />);
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email template for everyone"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Save your spreadsheet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and select recipients" })).toBeEnabled();
    expect(screen.getByText(/Saving this spreadsheet does not send an email/)).toBeInTheDocument();
    expect(screen.getByText("Template selection")).toBeInTheDocument();
    expect(screen.queryByText("Optional: keep the file or reuse this setup")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Keep a private copy of the original file")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Save these choices for future spreadsheets")).not.toBeInTheDocument();
  });
  it("keeps email and template choices when going back, and explains personalization with real values", async () => {
    render(<ImportWizard templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Choose a spreadsheet file"), { target: { files: [new File(["mock"], "contacts.csv", { type: "text/csv" })] } });
    await waitFor(() => expect(screen.getByLabelText("Which column contains the email address we should send to?")).toHaveValue("Public Email"));
    expect(screen.getByText("1 valid")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email template for everyone"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Spreadsheet column for company_name")).toHaveValue("Business Name");
    expect(screen.getByText("Example result: Northstar Labs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(screen.getByLabelText("Email template for everyone")).toHaveValue("template");
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(screen.getByLabelText("Which column contains the email address we should send to?")).toHaveValue("Public Email");
  });
  it("announces a missing recipient column before continuing", async () => {
    render(<ImportWizard templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Choose a spreadsheet file"), { target: { files: [new File(["mock"], "contacts.csv")] } });
    await screen.findByLabelText("Which column contains the email address we should send to?");
    fireEvent.change(screen.getByLabelText("Which column contains the email address we should send to?"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the column containing recipient email addresses");
  });
  it.each(["template", "spreadsheet_fallback"] as const)("saves %s subjects without uploading the original file or saving a new setup", async (strategy) => {
    const rows = [
      { "Public Email": "contact@example.com", "Business Name": "Northstar Labs", Subject: "Spreadsheet introduction" },
      { "Public Email": "other@example.com", "Business Name": "Harbor Works", Subject: "" },
    ];
    const sheet = { ...parsedSheet, columns: [...parsedSheet.columns, { originalLabel: "Subject", slug: "subject", index: 2 }], rows, previewRows: rows };
    vi.mocked(parseSpreadsheetFile).mockResolvedValue(sheet);
    const writes: Record<string, Record<string, unknown> | Record<string, unknown>[]> = {};
    const savedColumns = sheet.columns.map((column) => ({ id: "column-" + column.index, original_label: column.originalLabel }));
    const database = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } }, error: null }) },
      storage: { from: vi.fn() },
      from: vi.fn((table: string) => ({ insert: vi.fn((payload: Record<string, unknown> | Record<string, unknown>[]) => {
        writes[table] = payload;
        if (table === "datasets") return { select: () => ({ single: async () => ({ data: { id: "new-dataset" }, error: null }) }) };
        if (table === "dataset_columns") return { select: async () => ({ data: savedColumns, error: null }) };
        return Promise.resolve({ error: null });
      }) })),
    };
    mocks.database.mockReturnValue(database);
    render(<ImportWizard templates={[template]} />); await upload();
    if (strategy !== "template") fireEvent.change(screen.getByLabelText("Subject source"), { target: { value: strategy } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email template for everyone"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and select recipients" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/datasets/new-dataset?tab=recipients"));
    expect(writes.datasets).toMatchObject({ name: "contacts — Contacts", source_file_name: "contacts.csv", source_sheet_name: "Contacts", subject_strategy: strategy, fallback_template_id: "template" });
    expect(database.storage.from).not.toHaveBeenCalled();
    expect(database.from).not.toHaveBeenCalledWith("column_mapping_profiles");
    const columns = (writes.dataset_columns as Record<string, unknown>[]).map((column, index) => ({ ...column, id: savedColumns[index].id })) as unknown as DatasetColumn[];
    expect(columns.find((column) => column.original_label === "Subject")?.standard_field).toBe(strategy === "template" ? null : "subject");
    const prepared = (writes.dataset_rows as unknown as DatasetRow[]).map((row) => prepareRowEmail({ row, dataset: { fallback_template_id: "template", subject_strategy: strategy, routing_column_id: null }, columns, templates: [template], rules: [], placeholderMappings: writes.dataset_placeholder_mappings as unknown as DatasetPlaceholderMapping[] }));
    expect(prepared.map((email) => email.subject)).toEqual(strategy === "template" ? ["Hi Northstar Labs", "Hi Harbor Works"] : ["Spreadsheet introduction", "Hi Harbor Works"]);
    expect(prepared.every((email) => email.missing.length === 0)).toBe(true);
  });
});

describe("spreadsheet-body import", () => {
  async function uploadBodySheet() {
    const data = { "Public Email": "reader@example.com", Subject: "A personal subject", Message: "Hello,\n\nMessage from spreadsheet." };
    vi.mocked(parseSpreadsheetFile).mockResolvedValue({ ...parsedSheet, columns: [{ originalLabel:"Public Email",slug:"public_email",index:0 },{originalLabel:"Subject",slug:"subject",index:1},{originalLabel:"Message",slug:"message",index:2}],rows:[data],previewRows:[data] });
    fireEvent.change(screen.getByLabelText("Choose a spreadsheet file"),{target:{files:[new File(["mock"],"contacts.csv")]}});
    await screen.findByLabelText("Where should the email body come from?");
    fireEvent.change(screen.getByLabelText("Where should the email body come from?"),{target:{value:"spreadsheet"}});
  }
  it("works without templates, explains the skipped template step, and saves nullable template IDs", async () => {
    const writes: Record<string, unknown> = {};
    const update = vi.fn((payload:unknown)=>({eq:async()=>{writes.dataset_update=payload;return {error:null};}}));
    const database = {
      auth:{getUser:async()=>({data:{user:{id:"user"}},error:null})},
      from:vi.fn((table:string)=>({ update, insert:(payload:unknown)=>{
        writes[table]=payload;
        if(table==="datasets")return {select:()=>({single:async()=>({data:{id:"new-dataset"},error:null})})};
        if(table==="dataset_columns")return {select:async()=>({data:[{id:"to",original_label:"Public Email"},{id:"subject",original_label:"Subject"},{id:"body",original_label:"Message"}],error:null})};
        return Promise.resolve({error:null});
      }})),
    };
    mocks.database.mockReturnValue(database);
    render(<ImportWizard templates={[]} />); await uploadBodySheet();
    expect(screen.queryByText("Subject options (optional)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Which column contains the email bodies? (required)")).toHaveValue("Message");
    fireEvent.click(screen.getByLabelText("Add my saved signature"));
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByRole("heading",{name:"Email content"})).toBeInTheDocument();
    expect(screen.getByText(/Template selection is not needed/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email template for everyone")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByText(/No template fields need to be connected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByText("Not needed — using spreadsheet bodies")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Save and select recipients"}));
    await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith("/datasets/new-dataset?tab=recipients"));
    expect(writes.datasets).toMatchObject({body_source:"spreadsheet",subject_strategy:"spreadsheet",spreadsheet_signature:false,fallback_template_id:null});
    expect(writes.dataset_update).toMatchObject({body_column_id:"body",routing_column_id:null});
    expect(database.from).not.toHaveBeenCalledWith("routing_rules");
    expect(writes.dataset_rows).toEqual([expect.objectContaining({subject_value:"A personal subject",data:expect.objectContaining({message:"Hello,\n\nMessage from spreadsheet."})})]);
  });
  it("requires distinct recipient, subject and body columns and restores template mode when switched back", async () => {
    render(<ImportWizard templates={[template]} />); await uploadBodySheet();
    fireEvent.change(screen.getByLabelText("Which column contains the email bodies? (required)"),{target:{value:"Public Email"}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByRole("alert")).toHaveTextContent("must use different columns");
    fireEvent.change(screen.getByLabelText("Which column contains the email bodies? (required)"),{target:{value:"Message"}});
    fireEvent.change(screen.getByLabelText("Which column contains the subjects? (required)"),{target:{value:""}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the spreadsheet column containing subject lines");
    fireEvent.change(screen.getByLabelText("Where should the email body come from?"),{target:{value:"template"}});
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByRole("heading",{name:"Choose templates"})).toBeInTheDocument();
    expect(screen.getByLabelText("Email template for everyone")).toBeInTheDocument();
  });
});
