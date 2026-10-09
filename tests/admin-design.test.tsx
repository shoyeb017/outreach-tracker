import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/microsoft-settings", useRouter: () => ({ refresh: vi.fn() }) }));
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { MicrosoftDefaultForm } from "@/components/admin/microsoft-default-form";
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.fetch.mockResolvedValue(Response.json({ configuration: { detected_audience: null } })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("clear administrator setup", () => {
  it("marks the active administrator section", () => {
    render(<AdminNavigation />);
    expect(screen.getByRole("link", { name: "Microsoft setup" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
  it("separates required setup from collapsed diagnostics and preserves saves", async () => {
    render(<MicrosoftDefaultForm initial={null} />);
    expect(screen.getByRole("heading", { name: "1. Your Microsoft app" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. What users can choose" })).toBeVisible();
    expect(screen.getByText("Configuration diagnostics").closest("details")).not.toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("Application (Client) ID"), { target: { value: "22222222-2222-4222-8222-222222222222" } });
    fireEvent.change(screen.getByLabelText("Directory (Tenant) ID"), { target: { value: "33333333-3333-4333-8333-333333333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent).toMatchObject({ enabled: true, allow_custom: true, fallback_audience: null, client_id: "22222222-2222-4222-8222-222222222222" });
  });
});
