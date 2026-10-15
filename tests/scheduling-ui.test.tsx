import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ request: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/scheduling/client", () => ({ schedulingRequest: mocks.request }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ title, children }: { title: string; children: React.ReactNode }) => <section role="dialog" aria-label={title}>{children}</section> }));
import { ScheduleDialog } from "@/components/scheduling/schedule-dialog";
import { ScheduledMailHub } from "@/components/scheduling/scheduled-mail-hub";
import { ScheduleTestDialog } from "@/components/scheduling/schedule-test-dialog";
import { SCHEDULE_TEST_MESSAGE } from "@/lib/scheduling/test-message";
const preview = { datasetName: "Contacts", live: false, senderEmail: null, hash: "a".repeat(64), readyCount: 1, blockedCount: 1, items: [{ row_id: "row", row_number: 2, recipient_email: "reader@example.com", template_name: "Introduction", subject: "Hi Northstar", html_body: "<p>Saved preview</p>", status: "ready" }, { row_id: "blocked", row_number: 3, recipient_email: "blocked@example.com", template_name: "Introduction", subject: "Hi", html_body: "<p>Blocked</p>", status: "suppressed", note: "This address is on your do-not-email list." }] };
const health = { enabled: true, healthy: true, lastTickAt: new Date().toISOString() };
const connection = { connected: false, status: "disconnected", senderEmail: null, reason: null, microsoftConnected: false, custom: false, setupReady: true };
const batch = { id: "batch", dataset_id: "dataset", dataset_name: "Contacts", status: "scheduled", scheduled_at: new Date(Date.now() + 900000).toISOString(), timezone: "Asia/Dhaka", live_enabled: false, sender_email: null, items: [{ status: "pending" }] };
const detail = { batch, items: [{ id: "item", recipient_email: "reader@example.com", template_name: "Introduction", subject: "Saved subject", html_body: "<p>Saved preview</p>", status: "pending", attempts: 0, reason: null }] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/schedules/preview") return { preview, health, connection };
    if (url === "/api/schedules" && options?.method === "POST") return { id: "saved" };
    if (url === "/api/schedules/batch") return detail;
    return { batches: [batch], total: 1, page: 1, health, connection };
  });
});
afterEach(cleanup);
describe("simple scheduled-email UI", () => {
  it("requires a separate explicit confirmation and keeps controls before the table", async () => {
    render(<ScheduleDialog datasetId="dataset" rowIds={["row", "blocked"]} duplicatePolicy="block_template_recipient" onClose={vi.fn()} />);
    const confirm = await screen.findByRole("button", { name: "Confirm practice schedule" }); expect(confirm).toBeDisabled();
    expect(screen.getByText("1 ready")).toBeInTheDocument(); expect(screen.getByText("1 left out")).toBeInTheDocument();
    expect(confirm.compareDocumentPosition(screen.getByRole("table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/scheduled?batch=saved"));
    const calls = mocks.request.mock.calls.filter(([url]) => url === "/api/schedules"); expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body)).toMatchObject({ expectedHash: preview.hash, confirmed: true, timezone: expect.any(String) });
  });
  it("blocks real scheduling without background access and explains setup without losing the selection", async () => {
    mocks.request.mockResolvedValue({ preview: { ...preview, live: true }, health, connection });
    render(<ScheduleDialog datasetId="dataset" rowIds={["row"]} duplicatePolicy="block_template_recipient" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Confirm schedule · 1 emails" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Set up background access" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "Refresh checks" })).toBeEnabled();
  });
  it("shows a protected email preview without scheduling or sending", async () => {
    render(<ScheduleDialog datasetId="dataset" rowIds={["row"]} duplicatePolicy="block_template_recipient" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview scheduled email for row 2" }));
    expect(screen.getByTitle("Scheduled email content").getAttribute("srcdoc")).toContain("Saved preview");
    expect(mocks.request.mock.calls.filter(([url]) => url === "/api/schedules")).toHaveLength(0);
  });
  it("shows upcoming/history views and status counts with no real send controls", async () => {
    render(<ScheduledMailHub />); await screen.findByRole("button", { name: "View details" });
    expect(screen.getByText("1 pending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/api/schedules?view=history&page=1"));
    expect(screen.queryByRole("button", { name: /^Send \d/ })).not.toBeInTheDocument();
  });
  it("requires confirmation before cancelling pending emails", async () => {
    render(<ScheduledMailHub />); fireEvent.click(await screen.findByRole("button", { name: "View details" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel remaining emails" }));
    const confirm = within(screen.getByRole("dialog", { name: "Cancel remaining emails?" }));
    expect(confirm.getByText(/Already accepted emails cannot be recalled/)).toBeInTheDocument();
    expect(mocks.request.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
    fireEvent.click(confirm.getByRole("button", { name: "Confirm cancel" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("/api/schedules/batch", expect.objectContaining({ method: "PATCH" })));
  });
  it("shows connection/setup failures instead of fabricated scheduled data", async () => {
    mocks.request.mockRejectedValue(new Error("Apply the scheduled-mail migration.")); render(<ScheduledMailHub />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Apply the scheduled-mail migration");
    expect(screen.queryByRole("button", { name: "View details" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setup and troubleshooting" })).toHaveAttribute("href", "/help/scheduled-emails");
  });
});

describe("manual-recipient scheduled test", () => {
  const testSetup = { health, connection: { ...connection, connected: true, senderEmail: "sender@example.com" }, liveEnabled: true, message: SCHEDULE_TEST_MESSAGE };
  beforeEach(() => { mocks.request.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST" ? { id: "saved-test" } : testSetup); });
  it("shows sender and dummy preview, and requires a manual recipient and real-email confirmation", async () => {
    const onScheduled=vi.fn(); render(<ScheduleTestDialog onClose={vi.fn()} onScheduled={onScheduled} />);
    const submit=await screen.findByRole("button",{ name: "Confirm scheduled test email" });
    await screen.findByText(SCHEDULE_TEST_MESSAGE.subject); expect(submit).toBeDisabled(); expect(screen.getByText("sender@example.com")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Test recipient email"),{ target: { value: "reader@example.com" } });
    fireEvent.click(screen.getByRole("checkbox")); expect(submit).toBeEnabled(); fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith("saved-test"));
    const posts=mocks.request.mock.calls.filter(([,options]) => options?.method==="POST"); expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body)).toMatchObject({ recipient: "reader@example.com", expectedSender: "sender@example.com", confirmed: true, requestKey: expect.any(String) });
  });
  it("does not turn practice mode into real sending or bypass a missing worker", async () => {
    mocks.request.mockResolvedValue({ ...testSetup, liveEnabled: false, health: { ...health, healthy: false } });
    render(<ScheduleTestDialog onClose={vi.fn()} onScheduled={vi.fn()} />);
    await screen.findByText(/This test cannot bypass it/); expect(screen.getByRole("link",{ name: "Turn on Real sending in Settings" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Test recipient email"),{ target: { value: "reader@example.com" } }); fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button",{ name: "Confirm scheduled test email" })).toBeDisabled(); expect(mocks.request.mock.calls.filter(([,options])=>options?.method==="POST")).toHaveLength(0);
  });
  it("keeps the same confirmation key after an interrupted request and clears confirmation when recipient changes",async () => {
    mocks.request.mockImplementation(async (_url: string,options?: RequestInit)=>{ if(options?.method==="POST") throw new Error("Connection interrupted. Refresh results."); return testSetup; });
    render(<ScheduleTestDialog onClose={vi.fn()} onScheduled={vi.fn()} />); await screen.findByText(SCHEDULE_TEST_MESSAGE.subject);
    fireEvent.change(screen.getByLabelText("Test recipient email"),{ target:{ value:"reader@example.com" } }); fireEvent.click(screen.getByRole("checkbox"));
    const button=screen.getByRole("button",{name:"Confirm scheduled test email"}); fireEvent.click(button); await screen.findByRole("alert"); await waitFor(()=>expect(button).toBeEnabled());
    fireEvent.click(button); await waitFor(()=>expect(mocks.request.mock.calls.filter(([,options])=>options?.method==="POST")).toHaveLength(2));
    const keys=mocks.request.mock.calls.filter(([,options])=>options?.method==="POST").map(([,options])=>JSON.parse(options.body).requestKey); expect(keys[0]).toBe(keys[1]);
    await waitFor(()=>expect(button).toBeEnabled()); fireEvent.change(screen.getByLabelText("Test recipient email"),{target:{value:"different@example.com"}}); expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
