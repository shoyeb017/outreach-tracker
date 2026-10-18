import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import HistoryPage from "@/app/(app)/history/page";

const mocks = vi.hoisted(() => ({ load: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.client }));
vi.mock("@/lib/history/server", () => ({ loadHistory: mocks.load, historyLoadError: () => "Database connection unavailable. Refresh to retry." }));
vi.mock("@/lib/config/ui-test-mode", () => ({ isUiTestMode: () => false }));
beforeEach(() => { vi.clearAllMocks(); mocks.client.mockResolvedValue({}); });
afterEach(cleanup);

describe("email history page failures", () => {
  it("shows a retryable error rather than throwing a runtime error or pretending history is empty", async () => {
    mocks.load.mockResolvedValue({ rows: [], error: "Database connection unavailable. Refresh to retry." });
    render(await HistoryPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Database connection unavailable");
    expect(screen.getByRole("link", { name: "Retry email history" })).toHaveAttribute("href", "/history");
    expect(screen.queryByText("No email history yet")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Scheduled mail" })).toHaveAttribute("href", "/scheduled");
  });
  it("handles unexpected connection failures safely", async () => {
    mocks.load.mockRejectedValue(new Error("private connection details"));
    render(await HistoryPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh to retry");
    expect(screen.queryByText("private connection details")).not.toBeInTheDocument();
  });
});
