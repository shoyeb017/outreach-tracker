import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HistoryTable } from "@/components/history/history-table";
import { createHistoryPreview } from "@/lib/ui-preview/history";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ title, children }: { title: string; children: React.ReactNode }) => <div role="dialog" aria-label={title}>{children}</div> }));
afterEach(cleanup);

describe("readable history", () => {
  it("groups details into five columns without truncating recipient, subject, or source", () => {
    render(<HistoryTable rows={createHistoryPreview()} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(table).getByText("international.partnerships.and.operations@example.com")).toBeInTheDocument();
    expect(within(table).getAllByText(/Technology & Software/)).toHaveLength(25);
    expect(table).toHaveAttribute("data-density", "comfortable");
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(table).toHaveAttribute("data-density", "compact");
    expect(screen.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
  });
  it("paginates locally and resets the page when a filter changes", () => {
    render(<HistoryTable rows={createHistoryPreview()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("26–28 of 28 · Page 2 of 2")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search history"), { target: { value: "international.partnerships" } });
    expect(screen.getByText("1 email found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("28 emails found")).toBeInTheDocument();
  });
  it("keeps saved HTML sanitized and hides resend actions for fictional preview data", () => {
    const rows = createHistoryPreview(); rows[0].final_html_body += "<script>alert(1)</script>";
    render(<HistoryTable rows={rows} readOnlyDemo />);
    fireEvent.click(screen.getByRole("button", { name: "View full email to international.partnerships.and.operations@example.com" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("This is a fictional preview message. No email was sent.")).toBeInTheDocument();
    expect(dialog.querySelector("script")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Resend with review" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "View source row" })).not.toBeInTheDocument();
  });
});
