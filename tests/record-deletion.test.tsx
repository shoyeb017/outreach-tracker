import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DeleteRecords } from "@/components/records/delete-records";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/engagement/client", () => ({ engagementRequest: mocks.request }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ title, children }: { title: string; children: React.ReactNode }) => <section role="dialog" aria-label={title}>{children}</section> }));
beforeEach(() => { vi.clearAllMocks(); mocks.request.mockResolvedValue({ removed: 1 }); });
afterEach(cleanup);
describe("explicit record removal", () => {
  it("does nothing before a separate checked confirmation, then submits the frozen selection once", async () => {
    const deleted = vi.fn();
    render(<DeleteRecords kind="engagement" ids={["message"]} onDeleted={deleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(screen.getByText(/Their tracking links will stop working/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm deletion" })).toBeDisabled();
    expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(deleted).toHaveBeenCalledWith(["message"]));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ kind: "engagement", ids: ["message"], confirmed: true });
  });
  it("explains preserved duplicate protections and never deletes on cancel", () => {
    render(<DeleteRecords kind="history" ids={["history"]} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(screen.getByText(/Internal send records are retained/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep records" }));
    expect(mocks.request).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps a failed deletion visible and leaves the records untouched", async () => {
    const deleted = vi.fn(); mocks.request.mockRejectedValue(new Error("Resolve unknown emails first."));
    render(<DeleteRecords kind="schedule" ids={["batch"]} onDeleted={deleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("checkbox")); fireEvent.click(dialog.getByRole("button", { name: "Confirm deletion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Resolve unknown emails first");
    expect(deleted).not.toHaveBeenCalled();
  });
  it("disables empty and protected selections", () => {
    render(<DeleteRecords kind="schedule" ids={[]} onDeleted={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeDisabled();
  });
});
