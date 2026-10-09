import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard" }));
import { AppHeader } from "@/components/layout/app-header";
afterEach(cleanup);
describe("navbar Microsoft sender", () => {
  it("shows the connected sending email separately from the workspace login", () => {
    render(<AppHeader email="login@example.com" microsoftConnected microsoftEmail="sender@example.com" liveEnabled={false} />);
    expect(screen.getByText("Sender: sender@example.com")).toBeVisible();
    expect(screen.getByText("login@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connected Microsoft sender: sender@example.com" })).toHaveAttribute("href", "/settings#microsoft");
    expect(screen.queryByText("Microsoft not connected")).not.toBeInTheDocument();
  });
  it("does not display a stale address after disconnect", () => {
    render(<AppHeader microsoftConnected={false} microsoftEmail="old@example.com" liveEnabled={false} />);
    expect(screen.getByText("Microsoft not connected")).toBeVisible();
    expect(screen.queryByText(/old@example.com/)).not.toBeInTheDocument();
  });
  it("does not claim a sender is connected without a mailbox address", () => {
    render(<AppHeader microsoftConnected microsoftEmail={null} liveEnabled={false} />);
    expect(screen.getByText("Microsoft not connected")).toBeVisible();
  });
});
