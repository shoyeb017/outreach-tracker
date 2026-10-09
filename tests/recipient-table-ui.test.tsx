import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DatasetRowsTable } from "@/components/data-table/dataset-rows-table";
import type { DatasetColumn, DatasetRow } from "@/types";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }) }));
afterEach(cleanup);
const row: DatasetRow & { chosen_template_name: string; outreach_status: string } = {
  id: "row-1", dataset_id: "dataset", row_number: 1,
  recipient_email: "international.partnerships.and.operations@example.com", email_normalized: "international.partnerships.and.operations@example.com", email_valid: true,
  original_data: {}, data: { company: "VeryLongCompanyNameWithoutSpaces".repeat(4) }, routing_value: null, subject_value: null, template_override_id: null,
  created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-08T00:00:00Z",
  chosen_template_name: "Technology introductory consultation", outreach_status: "not_sent",
};
const columns = [{ id: "email", standard_field: "recipient_email", placeholder_slug: "email", original_label: "Public Email" }, { id: "company", standard_field: null, placeholder_slug: "company", original_label: "Business Name" }] as DatasetColumn[];

describe("recipient table layout and controls", () => {
  it("keeps complete values with deliberate widths and adjustable density", () => {
    render(<DatasetRowsTable datasetId="dataset" columns={columns} initialRows={[row]} initialCount={1} selection={new Set()} onSelectionChange={vi.fn()} onPreview={vi.fn()} onEdit={vi.fn()} onSuppress={vi.fn()} templates={[]} rules={[]} />);
    const table = screen.getByRole("table");
    expect(table).toHaveClass("recipient-table");
    expect(table.querySelectorAll("col")).toHaveLength(9);
    expect(screen.getByText(row.data.company as string).closest("td")).not.toHaveClass("truncate");
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(table).toHaveAttribute("data-density", "compact");
  });
  it("preserves selection, preview, edit, suppression, and column visibility", () => {
    const onSelectionChange = vi.fn(), onPreview = vi.fn(), onEdit = vi.fn(), onSuppress = vi.fn();
    render(<DatasetRowsTable datasetId="dataset" columns={columns} initialRows={[row]} initialCount={1} selection={new Set()} onSelectionChange={onSelectionChange} onPreview={onPreview} onEdit={onEdit} onSuppress={onSuppress} templates={[]} rules={[]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["row-1"]));
    fireEvent.click(screen.getByRole("button", { name: "Preview" })); expect(onPreview).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole("button", { name: "Edit" })); expect(onEdit).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole("button", { name: "Suppress" })); expect(onSuppress).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByLabelText("Business Name"));
    expect(screen.queryByRole("columnheader", { name: "Business Name" })).not.toBeInTheDocument();
  });
});
