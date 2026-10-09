import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), fetch: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp } }) }));
import { AuthForm } from "@/components/auth/auth-form";
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.fetch.mockResolvedValue(Response.json({ ok: true, destination: "/dashboard" })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("password validation at sign-in", () => {
  it("passes an existing short password through the shared sign-in without a separate admin link", async () => {
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ body: JSON.stringify({ email: "user@example.com", password: "test" }) })));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByRole("link", { name: "Administrator sign in" })).toBeNull();
  });
  it("uses the same form to send authenticated administrators to their portal", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: true, destination: "/admin" }));
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin"));
  });
  it("retains the minimum length when creating a new password", async () => {
    render(<AuthForm mode="register" />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least eight characters.")).toBeTruthy();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
