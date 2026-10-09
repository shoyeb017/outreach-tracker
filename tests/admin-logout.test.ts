// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ origin: vi.fn(), clear: vi.fn(), authClient: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ assertSameOrigin: mocks.origin, clearAdministratorCookies: mocks.clear, adminAuthClient: mocks.authClient }));
import { POST } from "@/app/api/admin/logout/route";
const request = () => new Request("https://app.example/api/admin/logout", { method: "POST", headers: { Origin: "https://app.example" } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_LOGIN_PASSWORD", "");
  mocks.authClient.mockResolvedValue({ auth: { signOut: mocks.signOut } });
});
afterEach(() => vi.unstubAllEnvs());
describe("administrator sign-out", () => {
  it("clears an environment session without requiring a provider account", async () => {
    vi.stubEnv("ADMIN_LOGIN_PASSWORD", "test");
    expect((await POST(request())).status).toBe(200);
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.authClient).not.toHaveBeenCalled();
  });
  it("revokes the provider session before removing its cookies", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.clear.mock.invocationCallOrder[0]);
  });
  it("still removes cookies if provider sign-out fails", async () => {
    mocks.signOut.mockRejectedValue(new Error("Provider unavailable"));
    expect((await POST(request())).status).toBe(400);
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it("rejects cross-origin sign-out before changing any session", async () => {
    mocks.origin.mockImplementation(() => { throw new Error("Wrong origin"); });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.authClient).not.toHaveBeenCalled();
  });
});
