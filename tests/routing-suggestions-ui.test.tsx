import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoutingPanel } from "@/components/datasets/routing-panel";
import type { Dataset, DatasetColumn, EmailTemplate, RoutingRule } from "@/types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, rpc: mocks.rpc }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const value = "Accounting firm Arlington, Virginia, Business consulting Arlington";
const accounting = { id: "accounting", category: "Accounting firm", name: "Accounting firm Outreach", is_active: true, is_archived: false } as EmailTemplate;
const consulting = { ...accounting, id: "consulting", category: "Business consulting", name: "Business consulting Outreach" };
function panel(templates = [accounting, consulting], initialRules: RoutingRule[] = []) {
  return <RoutingPanel dataset={{ id: "dataset", routing_column_id: "column", fallback_template_id: null } as Dataset} columns={[{ id: "column", original_label: "Search phrase" } as DatasetColumn]} templates={templates} initialRules={initialRules} routingValues={[{ routing_value: value, row_count: 3 }]} />;
}
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null }); });

describe("reviewing suggested spreadsheet template choices", () => {
  it("suggests the first business type, explains it, and only persists on Save", async () => {
    render(panel());
    fireEvent.click(screen.getByRole("button", { name: "Suggest templates" }));
    expect(screen.getByLabelText(`Email template for ${value}`)).toHaveValue("accounting");
    expect(screen.getByLabelText(`Action for ${value}`)).toHaveValue("template");
    expect(screen.getByText(/Matched business type: Accounting firm/)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save email choices" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("save_email_choices", {
      p_dataset_id: "dataset", p_default: null,
      p_rules: [{ user_id: "owner", dataset_id: "dataset", routing_value: value, normalized_value: value.toLowerCase(), action: "template", template_id: "accounting" }],
    }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps a user's existing template choice", () => {
    render(panel(undefined, [{ normalized_value: value.toLowerCase(), action: "template", template_id: "consulting" } as RoutingRule]));
    fireEvent.click(screen.getByRole("button", { name: "Suggest templates" }));
    expect(screen.getByLabelText(`Email template for ${value}`)).toHaveValue("consulting");
    expect(screen.queryByText(/Matched business type:/)).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("leaves ambiguous suggestions for the user to choose", () => {
    render(panel([accounting, consulting, { ...accounting, id: "copy", name: "My accounting copy" }]));
    fireEvent.click(screen.getByRole("button", { name: "Suggest templates" }));
    expect(screen.getByLabelText(`Action for ${value}`)).toHaveValue("skip");
    expect(screen.getByLabelText(`Email template for ${value}`)).toHaveValue("");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
