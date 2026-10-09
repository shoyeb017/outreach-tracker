import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ clear: vi.fn(), signOut: vi.fn(), client: vi.fn(), configured: vi.fn(), fetch: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/microsoft/msal", () => ({ clearWorkspaceMicrosoftSessions: mocks.clear }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: mocks.client, isSupabaseConfigured: mocks.configured }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
import { LandingSignOut } from "@/components/landing/landing-sign-out";
import { signOutOfApplication } from "@/lib/auth/sign-out";
beforeEach(() => {
  vi.clearAllMocks(); mocks.clear.mockResolvedValue(undefined); mocks.configured.mockReturnValue(true);
  mocks.client.mockReturnValue({ auth: { signOut: mocks.signOut } }); mocks.signOut.mockResolvedValue({ error: null });
  mocks.fetch.mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("landing sign out", () => {
  it("clears Microsoft, administrator, and workspace sessions before refreshing the landing page", async () => {
    render(<LandingSignOut microsoftClientIds={["known-app"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.clear).toHaveBeenCalledWith(["known-app"]);
    expect(mocks.fetch).toHaveBeenCalledWith("/api/admin/logout", { method: "POST" });
    expect(mocks.signOut).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]);
    expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0]);
  });
  it("shows a retryable error instead of pretending sign out succeeded", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    render(<LandingSignOut microsoftClientIds={[]} />); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try signing out again");
    expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
  it("retains the page when workspace sign out fails", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("Connection lost") });
    render(<LandingSignOut microsoftClientIds={[]} />); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost"); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("supports administrator-only setup without a workspace browser client", async () => {
    mocks.configured.mockReturnValue(false);
    await signOutOfApplication(); expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.client).not.toHaveBeenCalled();
  });
});
