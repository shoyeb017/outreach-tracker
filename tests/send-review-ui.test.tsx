import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SendReviewDialog } from "@/components/sending/send-review-dialog";
import type { DatasetRow } from "@/types";

vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ title, children }: { title: string; children: React.ReactNode }) => <div role="dialog" aria-label={title}>{children}</div> }));
afterEach(cleanup);
const row: DatasetRow = { id: "row", dataset_id: "dataset", row_number: 1, original_data: {}, data: {}, recipient_email: "contact@example.com", email_normalized: "contact@example.com", email_valid: true, routing_value: "Technology", subject_value: null, template_override_id: null, created_at: "2026-10-08", updated_at: "2026-10-08" };
const email = { template: null, subject: "A personal introduction", htmlBody: "<p>Your exact preview message.</p>", plainTextBody: "Your exact preview message.", missing: [], requiredFields: [], routeSource: "fallback" as const };

describe("review table actions", () => {
  it("places the send summary and Cancel/Send controls before even a large recipient table", () => {
    const onClose = vi.fn(); const onConfirm = vi.fn();
    const items = Array.from({ length: 150 }, (_, index) => ({ row: { ...row, id: `row-${index}`, row_number: index + 1 }, email, status: "ready" }));
    render(<SendReviewDialog items={items} summary={{ ready: 150 }} routingColumnLabel="Industry" microsoftEmail="sender@example.com" duplicatePolicy="block_template_recipient" duplicatePolicyLabel="Block duplicates" live preparing={false} onClose={onClose} onRepair={vi.fn()} onConfirm={onConfirm} />);
    const table = screen.getByRole("table");
    const summary = screen.getByRole("region", { name: "Send summary" });
    const actions = screen.getByRole("group", { name: "Review actions" });
    expect(summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(summary).getByText("sender@example.com")).toBeInTheDocument();
    expect(within(summary).getByText("Real emails")).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Send 150 emails" })).toBeEnabled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(actions).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it.each([false, true])("keeps confirmation disabled when there are no ready recipients (live=%s)", (live) => {
    const onConfirm = vi.fn();
    render(<SendReviewDialog items={[{ row, email, status: "missing_placeholder", note: "Connect {{company_name}}" }]} summary={{ missing_placeholder: 1 }} duplicatePolicy="warn" duplicatePolicyLabel="Warn about duplicates" live={live} preparing={false} onClose={vi.fn()} onRepair={vi.fn()} onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: live ? "Send 0 emails" : "Practice with 0 recipients" });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Connect missing fields" })).toBeEnabled();
  });
  it("disables both top actions while preparing", () => {
    render(<SendReviewDialog items={[{ row, email, status: "ready" }]} summary={{ ready: 1 }} duplicatePolicy="warn" duplicatePolicyLabel="Warn about duplicates" live preparing onClose={vi.fn()} onRepair={vi.fn()} onConfirm={vi.fn()} />);
    const actions = screen.getByRole("group", { name: "Review actions" });
    expect(within(actions).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(actions).getByRole("button", { name: "Send 1 emails" })).toBeDisabled();
  });
  it("keeps native table rows and a keyboard-accessible preview button without sending", () => {
    const onConfirm = vi.fn();
    render(<SendReviewDialog items={[{ row, email, status: "ready" }]} summary={{ ready: 1 }} duplicatePolicy="block_template_recipient" duplicatePolicyLabel="Block duplicates" live={false} preparing={false} onClose={vi.fn()} onRepair={vi.fn()} onConfirm={onConfirm} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Preview email for row 1" }));
    expect(within(screen.getByRole("dialog", { name: "Email preview — row 1" })).getByText("Your exact preview message.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Practice with 1 recipients" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
