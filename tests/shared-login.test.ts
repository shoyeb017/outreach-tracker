import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ adminLogin: vi.fn(), signIn: vi.fn(), client: vi.fn(), origin: vi.fn(), clear: vi.fn(), signOut: vi.fn() }));
vi.mock("@/app/api/admin/login/route", () => ({ POST: mocks.adminLogin }));
vi.mock("@/lib/admin/server", () => ({ assertSameOrigin: mocks.origin, clearAdministratorCookies: mocks.clear, adminAuthClient: async () => ({ auth: { signOut: mocks.signOut } }) }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.client }));
import { POST } from "@/app/api/auth/login/route";
const request = (email: string, password = "test") => new Request("https://app.example/api/auth/login", { method: "POST", headers: { Origin: "https://app.example" }, body: JSON.stringify({ email, password }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_LOGIN_EMAIL", "admin@example.com");
  mocks.client.mockResolvedValue({ auth: { signInWithPassword: mocks.signIn } });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.adminLogin.mockResolvedValue(Response.json({ ok: true }));
});
afterEach(() => vi.unstubAllEnvs());
describe("one sign-in endpoint", () => {
  it("authenticates normal users with their existing short password and clears old admin sessions", async () => {
    const response = await POST(request("user@example.com"));
    expect(await response.json()).toEqual({ ok: true, destination: "/dashboard" });
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "user@example.com", password: "test" });
    expect(mocks.clear).toHaveBeenCalled();
    expect(mocks.adminLogin).not.toHaveBeenCalled();
  });
  it("routes the configured administrator through existing role, audit and rate checks", async () => {
    const response = await POST(request("ADMIN@example.com"));
    expect(await response.json()).toEqual({ ok: true, destination: "/admin" });
    expect(mocks.adminLogin).toHaveBeenCalledOnce();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("does not fall back to workspace login after denied admin authentication", async () => {
    mocks.adminLogin.mockResolvedValue(Response.json({ error: "Access denied" }, { status: 401 }));
    expect((await POST(request("admin@example.com"))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("does not clear sessions or report success after invalid user credentials", async () => {
    mocks.signIn.mockResolvedValue({ error: new Error("Invalid credentials") });
    expect((await POST(request("user@example.com"))).status).toBe(401);
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("rejects cross-origin login before authentication", async () => {
    mocks.origin.mockImplementation(() => { throw new Error("Wrong origin"); });
    expect((await POST(request("user@example.com"))).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("requires a password but not eight characters", async () => {
    expect((await POST(request("user@example.com", ""))).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
