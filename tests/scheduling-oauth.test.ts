// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unseal } from "@/lib/scheduling/core";
const mocks = vi.hoisted(() => ({ context: vi.fn(), configuration: vi.fn(), insert: vi.fn(), upsert: vi.fn(), remove: vi.fn(), setCookie: vi.fn(), getCookie: vi.fn(), update: vi.fn(), limit: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.setCookie, get: mocks.getCookie }) }));
vi.mock("@/lib/admin/server", () => ({ limitRequest: mocks.limit }));
vi.mock("@/lib/scheduling/server", () => ({ scheduleUser: mocks.context, smallJson: (request: Request) => request.json(), checked: (result: { data: unknown; error: unknown }) => { if (result.error) throw new Error("Storage unavailable"); return result.data; }, schedulingFailure: (error: Error) => Response.json({ error: error.message }, { status: 400 }) }));
vi.mock("@/lib/microsoft/configuration-server", () => ({ configurationForUser: mocks.configuration }));
import { POST } from "@/app/api/microsoft/background/start/route";
import { GET } from "@/app/api/microsoft/background/callback/route";
const key = Buffer.alloc(32, 3).toString("base64"), user = "11111111-1111-4111-8111-111111111111";
const configuration = { id: "22222222-2222-4222-8222-222222222222", updated_at: "2026-10-15T00:00:00Z", client_id: "33333333-3333-4333-8333-333333333333", method: "default", authority: "https://login.microsoftonline.com/common", home_account_id: "account", connected_email: "sender@example.com" };
let payload: unknown; let state = ""; let consumed = false;
beforeEach(() => {
  vi.clearAllMocks(); payload = undefined; state = ""; consumed = false;
  vi.stubEnv("SCHEDULE_ENCRYPTION_KEY", key); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://autmail.vercel.app"); vi.stubEnv("MICROSOFT_SCHEDULER_CLIENT_ID", configuration.client_id); vi.stubEnv("MICROSOFT_SCHEDULER_CLIENT_SECRET", "fixture-only-app-credential");
  mocks.configuration.mockResolvedValue(configuration);
  mocks.insert.mockImplementation(async (value) => { payload = value.payload; return { data: null, error: null }; });
  mocks.upsert.mockResolvedValue({ data: null, error: null });
  mocks.setCookie.mockImplementation((_name, value) => { if (value) state = value; });
  mocks.getCookie.mockImplementation(() => ({ value: state }));
  const chain = { eq: vi.fn(), gt: vi.fn(), in: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(async () => { const saved = consumed ? null : { payload }; consumed = true; return { data: saved, error: null }; }), then: (resolve: (value: { data: null; error: null }) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve) };
  chain.eq.mockReturnValue(chain); chain.gt.mockReturnValue(chain); chain.in.mockReturnValue(chain); chain.select.mockReturnValue(chain); mocks.remove.mockReturnValue(chain); mocks.update.mockReturnValue(chain);
  mocks.context.mockResolvedValue({ user: { id: user }, database: { rpc: mocks.upsert, from: () => ({ insert: mocks.insert, delete: mocks.remove, update: mocks.update }) } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function start(body = {}) { return POST(new Request("https://autmail.vercel.app/api/microsoft/background/start", { method: "POST", headers: { Origin: "https://autmail.vercel.app" }, body: JSON.stringify(body) })); }
function callback(value = state) { return GET(new Request(`https://autmail.vercel.app/api/microsoft/background/callback?code=fixture-code&state=${value}`)); }
describe("background Microsoft authorization", () => {
  it("uses a separate Web callback, PKCE and a secure one-use state without exposing secrets", async () => {
    const response = await start(); const result = await response.json(); const url = new URL(result.url);
    expect(url.searchParams.get("redirect_uri")).toBe("https://autmail.vercel.app/api/microsoft/background/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256"); expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(result.url).not.toContain("fixture-only-app-credential"); expect(JSON.stringify(payload)).not.toContain("fixture-only-app-credential");
    expect(mocks.setCookie).toHaveBeenCalledWith("autmail-background-oauth", expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 600 }));
  });
  it("does not use the administrator's secret for a custom registration", async () => { mocks.configuration.mockResolvedValue({ ...configuration, method: "custom" }); const response = await start(); expect(response.status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled(); });
  it("rejects a state-cookie mismatch before exchanging an authorization code", async () => { await start(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect((await callback("wrong-state")).headers.get("location")).toContain("connection=failed"); expect(fetcher).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled(); });
  it("stores only encrypted refresh/credential data for the same selected mailbox and rejects replay", async () => {
    await start(); const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", scope: "User.Read Mail.Send" })).mockResolvedValueOnce(Response.json({ id: "ms-user", mail: "sender@example.com" })); vi.stubGlobal("fetch", fetcher);
    const response = await callback(); expect(response.headers.get("location")).toContain("connection=connected");
    expect(mocks.upsert.mock.calls[0][0]).toBe("scheduler_save_connection");
    const saved = mocks.upsert.mock.calls[0][1].p_connection; expect(saved.sender_email).toBe("sender@example.com"); expect(saved.access_token).toBeUndefined();
    expect(await unseal(saved.refresh_ciphertext, key, `${user}:refresh`)).toBe("fixture-refresh"); expect(JSON.stringify(saved)).not.toContain("fixture-refresh");
    expect((await callback()).headers.get("location")).toContain("connection=failed"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects a changed app configuration during authorization", async () => { await start(); mocks.configuration.mockResolvedValue({ ...configuration, updated_at: "2026-10-16T00:00:00Z" }); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect((await callback()).headers.get("location")).toContain("connection=failed"); expect(fetcher).not.toHaveBeenCalled(); });
  it("rejects approval from a different mailbox without replacing the saved sender", async () => { await start(); vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", scope: "Mail.Send" })).mockResolvedValueOnce(Response.json({ id: "another-ms-user", mail: "different@example.com" }))); expect((await callback()).headers.get("location")).toContain("connection=failed"); expect(mocks.upsert).not.toHaveBeenCalled(); });
});
