import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { HistoryTable, type HistoryRow } from "@/components/history/history-table";
import { createHistoryPreview } from "@/lib/ui-preview/history";

const requests = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/engagement/client", () => ({ engagementRequest: requests.request }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ title, children }: { title: string; children: React.ReactNode }) => <div role="dialog" aria-label={title}>{children}</div> }));
afterEach(cleanup);

describe("readable history", () => {
  it("filters scheduled results and selects zero-click recipients for a separately confirmed follow-up", async () => {
    requests.request.mockResolvedValue({ id: "new-sheet", added: 1 });
    const rows = createHistoryPreview(); rows[0].sending_method = "scheduled"; rows[1].sending_method = "manual";
    render(<HistoryTable rows={rows} />);
    fireEvent.change(screen.getByLabelText("Sending method"), { target: { value: "scheduled" } });
    expect(screen.getByText("1 email found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: `Select ${rows[0].recipient_email}, history ${rows[0].id}` }));
    fireEvent.click(screen.getByRole("button", { name: "Create follow-up spreadsheet" }));
    expect(screen.getByRole("button", { name: "Create spreadsheet" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Create only/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create spreadsheet" }));
    await screen.findByText(/Follow-up spreadsheet created/);
    expect(requests.request).toHaveBeenCalledWith("/api/history/followup", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("link", { name: "Choose template and review" })).toHaveAttribute("href", "/datasets/new-sheet?tab=required-setup");
    await waitFor(() => expect(screen.getByText("0 selected for follow-up")).toBeInTheDocument());
  });
  it("clears selection when filters change and excludes test results", () => {
    const rows = createHistoryPreview(); rows[1].is_test = true;
    render(<HistoryTable rows={rows} />);
    expect(screen.getByRole("checkbox", { name: `Select ${rows[1].recipient_email}, history ${rows[1].id}` })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: `Select ${rows[0].recipient_email}, history ${rows[0].id}` }));
    expect(screen.getByText("1 selected for follow-up")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("History status"), { target: { value: "sent" } });
    expect(screen.getByText("0 selected for follow-up")).toBeInTheDocument();
  });
  it("fetches the full saved body only when the preview is opened and neutralizes tracking links", async () => {
    const rows = createHistoryPreview(); rows[0].body_loaded = false; rows[0].final_html_body = "";
    requests.request.mockResolvedValue({ final_html_body: '<a href="https://autmail.vercel.app/e/' + "a".repeat(64) + '">Visit</a>', final_plain_text_body: null });
    render(<HistoryTable rows={rows} />);
    const before = requests.request.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: `View full email to ${rows[0].recipient_email}` }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Visit" })).toHaveAttribute("href", "#engagement-preview"));
    expect(requests.request.mock.calls.length).toBe(before + 1);
  });
  it("shows standalone scheduled tests without broken spreadsheet links or resend actions", () => {
    const rows: HistoryRow[]=[{ ...createHistoryPreview()[0], dataset_id:null, dataset_row_id:null, datasets:null, templates:null, is_test:true }];
    render(<HistoryTable rows={rows} />);
    expect(screen.getAllByRole("link",{name:"Scheduled test email · no spreadsheet"})[0]).toHaveAttribute("href","/scheduled");
    expect(screen.getByRole("option",{name:"Scheduled tests"})).toHaveValue("scheduled-tests");
    fireEvent.click(screen.getByRole("button",{name:"View full email to international.partnerships.and.operations@example.com"}));
    const dialog=screen.getByRole("dialog"); expect(within(dialog).queryByRole("button",{name:"Resend with review"})).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link",{name:"View scheduled email results"})).toHaveAttribute("href","/scheduled");
    expect(within(dialog).getByText("Fixed test message")).toBeInTheDocument();
  });
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
