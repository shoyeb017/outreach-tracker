import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), user: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ administrator: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/logout-context", () => ({ getSignOutMicrosoftClientIds: () => Promise.resolve([]) }));
vi.mock("@/components/motion/landing-motion", () => ({ LandingMotion: () => null }));
vi.mock("@/components/motion/blue-tubes-background", () => ({ BlueTubesBackground: () => null }));
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => <button>Theme</button> }));
import { publicNavigation } from "@/lib/public-navigation";
import HomePage from "@/app/page";

beforeEach(() => {
  vi.clearAllMocks(); mocks.admin.mockResolvedValue(null);
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.user } });
  mocks.user.mockResolvedValue({ data: { user: null } });
});
afterEach(cleanup);

describe("role-aware public navigation", () => {
  it("prioritizes a verified administrator session even if a workspace session also exists", async () => {
    mocks.admin.mockResolvedValue({ email: "admin@example.com", local: false });
    expect(await publicNavigation()).toMatchObject({ signedIn: true, destination: "/admin", helpDestination: "/admin" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses workspace destinations for signed-in users", async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: "user" } } });
    expect(await publicNavigation()).toMatchObject({ signedIn: true, destination: "/dashboard", helpDestination: "/settings#microsoft" });
  });
  it("keeps public visitors out of protected settings, including persistence-disabled previews", async () => {
    mocks.client.mockResolvedValue(null);
    expect(await publicNavigation()).toMatchObject({ signedIn: false, destination: "/login", helpDestination: "/" });
  });
});

describe("landing page stays accessible", () => {
  it.each(["user", "administrator"])("renders for a signed-in %s instead of redirecting", async (role) => {
    if (role === "administrator") mocks.admin.mockResolvedValue({ email: "admin@example.com", local: false });
    else mocks.user.mockResolvedValue({ data: { user: { id: "user" } } });
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your spreadsheet.");
    const name = role === "administrator" ? "Open administration" : "Open workspace";
    for (const link of screen.getAllByRole("link", { name })) expect(link).toHaveAttribute("href", role === "administrator" ? "/admin" : "/dashboard");
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not show sign out for anonymous visitors", async () => {
    render(await HomePage());
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "AUTMAIL - Email Automation System" })).toBeInTheDocument();
    expect(screen.getByText("Microsoft email automation")).toBeInTheDocument();
    expect(screen.queryByText("Microsoft 365 outreach")).not.toBeInTheDocument();
    expect(screen.getByText("AUTMAIL - Email Automation System. Built for deliberate outreach.")).toBeInTheDocument();
    expect(screen.getByText(/Connect a personal Outlook.com mailbox/)).toHaveTextContent("Hotmail, Live, or MSN");
  });
});
