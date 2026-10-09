import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HelpLayout from "@/app/help/layout";
const mocks = vi.hoisted(() => ({ navigation: vi.fn() }));
vi.mock("@/lib/public-navigation", () => ({ publicNavigation: mocks.navigation }));
vi.mock("next/navigation", () => ({ usePathname: () => "/help/default-connection" }));
beforeEach(() => mocks.navigation.mockResolvedValue({ helpDestination: "/settings#microsoft", helpLabel: "Back to Email account settings" }));
afterEach(cleanup);

describe("help return navigation", () => {
  it("returns signed-in workspace users to their email account tab", async () => {
    render(await HelpLayout({ children: <h1>Default connection guide</h1> }));
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Back to Email account settings" })).toHaveAttribute("href", "/settings#microsoft");
    expect(header).toHaveClass("sticky", "top-0");
    expect(within(header).getByRole("link", { name: /Help center/ })).toHaveAttribute("href", "/help");
    expect(within(header).getByRole("link", { name: "Landing page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("heading", { name: "Default connection guide" })).toBeVisible();
  });
  it("returns verified administrators to administration, not user settings", async () => {
    mocks.navigation.mockResolvedValue({ helpDestination: "/admin", helpLabel: "Back to administration" });
    render(await HelpLayout({ children: <h1>Setup guide</h1> }));
    for (const link of screen.getAllByRole("link", { name: "Back to administration" })) expect(link).toHaveAttribute("href", "/admin");
    expect(screen.getAllByRole("link", { name: "Back to administration" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Back to Email account settings" })).not.toBeInTheDocument();
  });
  it("lets anonymous visitors return to the public landing page", async () => {
    mocks.navigation.mockResolvedValue({ helpDestination: "/", helpLabel: "Back to landing page" });
    render(await HelpLayout({ children: <h1>Setup guide</h1> }));
    for (const link of screen.getAllByRole("link", { name: "Back to landing page" })) expect(link).toHaveAttribute("href", "/");
  });
});
