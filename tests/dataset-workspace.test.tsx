import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DatasetWorkspace } from "@/components/datasets/dataset-workspace";
import { datasetWorkflowState, initialDatasetStep } from "@/lib/datasets/workflow";
import type { Dataset, DatasetColumn, DatasetPlaceholderMapping, EmailTemplate, RoutingRule } from "@/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock("@/components/datasets/dataset-setup-panel", () => ({ DatasetSetupPanel: ({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) => <div><h2>Email setup</h2><button onClick={() => onDirtyChange(true)}>Edit setup</button></div> }));
vi.mock("@/components/datasets/routing-panel", () => ({ RoutingPanel: () => <h2>Choose templates</h2> }));
vi.mock("@/components/datasets/placeholder-mapping-panel", () => ({ PlaceholderMappingPanel: () => <h2>Personalize your emails</h2> }));
vi.mock("@/components/data-table/dataset-rows-table", () => ({ DatasetRowsTable: ({ onSelectionChange }: { onSelectionChange: (selection: Set<string>) => void }) => <button onClick={() => onSelectionChange(new Set(["row"]))}>Select sample row</button> }));
vi.mock("@/components/sending/send-panel", () => ({ SendPanel: () => <h2>Final email review</h2> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const dataset = { id: "dataset", name: "Contacts", row_count: 2, valid_email_count: 2, missing_email_count: 0, invalid_email_count: 0, routing_column_id: null, fallback_template_id: "template", subject_strategy: "template", created_at: "2026-10-08T00:00:00Z" } as Dataset;
const columns = [
  { id: "email", original_label: "Public Email", placeholder_slug: "public_email", standard_field: "recipient_email" },
  { id: "company", original_label: "Business Name", placeholder_slug: "business_name", standard_field: null },
  { id: "industry", original_label: "Industry", placeholder_slug: "industry", standard_field: null },
] as DatasetColumn[];
const templates = [{ id: "template", name: "Introduction", subject_template: "Hello {{company_name}}", html_body: "<p>Hello {{company_name}}</p>", plain_text_body: null, is_active: true, is_archived: false }] as EmailTemplate[];
const placeholderMappings = [{ id: "mapping", placeholder: "company_name", column_id: "company" }] as DatasetPlaceholderMapping[];
const props = { dataset, columns, templates, placeholderMappings, rules: [] as RoutingRule[], routingValues: [], initialRows: [], rowCount: 2, signatureFields: [], preferences: {}, suppressions: [], history: [], unfinishedRuns: [] };
const state = (overrides: Partial<Parameters<typeof datasetWorkflowState>[0]> = {}) => datasetWorkflowState({ ...props, selectedCount: 0, ...overrides });

describe("dataset workflow state", () => {
  it("recommends the first unfinished step, not an unrelated tab", () => {
    expect(state({ columns: [] }).recommended).toBe("required setup");
    expect(state({ placeholderMappings: [] }).recommended).toBe("placeholder mapping");
    expect(state().recommended).toBe("recipients");
    expect(state({ selectedCount: 1 }).recommended).toBe("send");
  });
  it("requires an explicit template choice for each group", () => {
    const mixed = { dataset: { ...dataset, routing_column_id: "industry", fallback_template_id: null }, routingValues: [{ routing_value: "Technology", row_count: 2 }] };
    expect(state(mixed).recommended).toBe("template routing");
    expect(state({ ...mixed, rules: [{ action: "skip", normalized_value: "technology", template_id: null } as RoutingRule] }).templates).toBe(true);
  });
  it("does not treat archived templates or removed column mappings as ready", () => {
    expect(state({ templates: [{ ...templates[0], is_archived: true }] }).setup).toBe(false);
    expect(state({ placeholderMappings: [{ ...placeholderMappings[0], column_id: "removed" }] }).personalized).toBe(false);
  });
  it("preserves old step links and maps the old summary to a useful step", () => {
    expect(initialDatasetStep("placeholder-mapping", "recipients")).toBe("placeholder mapping");
    expect(initialDatasetStep("overview", "required setup")).toBe("required setup");
    expect(initialDatasetStep("unknown", "recipients")).toBe("recipients");
  });
});

describe("dataset details navigation", () => {
  it("uses one five-step navigation and keeps file details separate", () => {
    render(<DatasetWorkspace {...props} />);
    const nav = screen.getByRole("navigation", { name: "Spreadsheet workflow" });
    expect(within(nav).getAllByRole("button")).toHaveLength(5);
    expect(screen.queryByLabelText("Spreadsheet sections")).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Select recipients/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Spreadsheet details").closest("details")).not.toHaveAttribute("open");
  });
  it("explains missing mappings before opening send", () => {
    render(<DatasetWorkspace {...props} placeholderMappings={[]} initialTab="send" />);
    expect(screen.getByText("Complete personalize first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to personalize" }));
    expect(screen.getByRole("heading", { name: "Personalize your emails" })).toBeInTheDocument();
  });
  it("makes empty review actionable and preserves selection across steps", () => {
    render(<DatasetWorkspace {...props} initialTab="send" />);
    expect(screen.getByRole("heading", { name: "Select recipients before reviewing" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Select recipients$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select sample row" }));
    fireEvent.click(screen.getByRole("button", { name: /^Review 1$/ }));
    expect(screen.getByRole("heading", { name: "Final email review" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to select recipients" }));
    expect(screen.getByRole("button", { name: /^Review 1$/ })).toBeEnabled();
  });
  it("lets a user cancel navigation to keep unsaved choices", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DatasetWorkspace {...props} initialTab="required-setup" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit setup" }));
    expect(within(screen.getByRole("navigation")).getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: /Personalize/ }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("unsaved changes"));
    expect(screen.getByRole("heading", { name: "Email setup" })).toBeInTheDocument();
  });
});
