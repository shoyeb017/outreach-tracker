import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SendReviewDialog } from "@/components/sending/send-review-dialog";
import type { DatasetRow } from "@/types";

vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ title, children }: { title: string; children: React.ReactNode }) => <div role="dialog" aria-label={title}>{children}</div> }));
afterEach(cleanup);
const row: DatasetRow = { id: "row", dataset_id: "dataset", row_number: 1, original_data: {}, data: {}, recipient_email: "contact@example.com", email_normalized: "contact@example.com", email_valid: true, routing_value: "Technology", subject_value: null, template_override_id: null, created_at: "2026-10-08", updated_at: "2026-10-08" };
const email = { template: null, subject: "A personal introduction", htmlBody: "<p>Your exact preview message.</p>", plainTextBody: "Your exact preview message.", missing: [], requiredFields: [], routeSource: "fallback" as const };

describe("review table actions", () => {
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
