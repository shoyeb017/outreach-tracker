import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ImportWizard } from "@/components/spreadsheet/import-wizard";
import type { EmailTemplate } from "@/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock("@/lib/spreadsheet/parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/spreadsheet/parser")>();
  return { ...actual, parseSpreadsheetFile: vi.fn().mockResolvedValue({ fileName: "contacts.csv", selectedSheet: "Contacts", sheetNames: ["Contacts"], columns: [{ originalLabel: "Public Email", slug: "public_email", index: 0 }, { originalLabel: "Business Name", slug: "business_name", index: 1 }], rows: [{ "Public Email": "contact@example.com", "Business Name": "Northstar Labs" }], previewRows: [{ "Public Email": "contact@example.com", "Business Name": "Northstar Labs" }] }) };
});
afterEach(cleanup);
const template = { id: "template", name: "Introduction", subject_template: "Hi {{company_name}}", html_body: "<p>Hi {{company_name}}</p>", plain_text_body: null, is_active: true, is_archived: false } as EmailTemplate;

describe("first-time spreadsheet setup", () => {
  async function upload() {
    fireEvent.change(screen.getByLabelText("Choose an Excel or CSV file"), { target: { files: [new File(["mock"], "contacts.csv")] } });
    await screen.findByLabelText("Which column contains the email address we should send to?");
  }
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
  it("chooses the subject before personalization and excludes unused template-subject fields", async () => {
    render(<ImportWizard templates={[{ ...template, subject_template: "{{subject_only}}" }]} />);
    await upload();
    fireEvent.change(screen.getByLabelText("Subject source"), { target: { value: "spreadsheet" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a spreadsheet subject column");
    fireEvent.change(screen.getByLabelText("Spreadsheet subject column"), { target: { value: "Business Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email template for everyone"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByLabelText("Spreadsheet column for subject_only")).not.toBeInTheDocument();
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
  });
  it("keeps email and template choices when going back, and explains personalization with real values", async () => {
    render(<ImportWizard templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Choose an Excel or CSV file"), { target: { files: [new File(["mock"], "contacts.csv", { type: "text/csv" })] } });
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
    fireEvent.change(screen.getByLabelText("Choose an Excel or CSV file"), { target: { files: [new File(["mock"], "contacts.csv")] } });
    await screen.findByLabelText("Which column contains the email address we should send to?");
    fireEvent.change(screen.getByLabelText("Which column contains the email address we should send to?"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the column containing recipient email addresses");
  });
});
