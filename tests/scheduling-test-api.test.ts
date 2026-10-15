// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), health: vi.fn(), background: vi.fn(), existing: vi.fn(), preference: vi.fn(), upgrade: vi.fn(), rpc: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/scheduling/server", async (original) => ({ ...await original<typeof import("@/lib/scheduling/server")>(), scheduleUser: mocks.context, schedulerHealth: mocks.health, backgroundStatus: mocks.background }));
import { GET, POST } from "@/app/api/schedules/test/route";
import { SCHEDULE_TEST_MESSAGE } from "@/lib/scheduling/test-message";
const owner="11111111-1111-4111-8111-111111111111", requestKey="22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: { id: owner }, database: { rpc: mocks.rpc, from: (table: string) => {
    const chain = { select: () => chain, eq: (...args: unknown[]) => { mocks.eq(...args); return chain; }, maybeSingle: table==="user_preferences" ? mocks.preference : mocks.existing, limit: mocks.upgrade }; return chain;
  } } });
  mocks.health.mockResolvedValue({ enabled: true, healthy: true }); mocks.background.mockResolvedValue({ connected: true, senderEmail: "sender@example.com" });
  mocks.existing.mockResolvedValue({ data: null, error: null }); mocks.preference.mockResolvedValue({ data: { live_sending_enabled: true }, error: null });
  mocks.upgrade.mockResolvedValue({ data: [], error: null }); mocks.rpc.mockResolvedValue({ data: "test-batch", error: null });
});
function request(overrides: Record<string, unknown>={}) { return new Request("https://autmail.vercel.app/api/schedules/test", { method: "POST", headers: { Origin: "https://autmail.vercel.app" }, body: JSON.stringify({ recipient: " Reader@Example.com ", scheduledAt: new Date(Date.now()+600000).toISOString(), timezone: "Asia/Dhaka", expectedSender: "sender@example.com", requestKey, confirmed: true, ...overrides }) }); }
describe("scheduled dummy-email API", () => {
  it("returns real-send requirements and the fixed preview, without sending", async () => {
    expect(await (await GET()).json()).toMatchObject({ liveEnabled: true, message: SCHEDULE_TEST_MESSAGE, connection: { connected: true } }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("schedules only the server's fixed test using the signed-in owner", async () => {
    const response=await POST(request({ userId: "someone-else", subject: "untrusted", html: "untrusted", live: false, datasetId: "fake" }));
    expect(response.status).toBe(200); expect(mocks.context).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.rpc).toHaveBeenCalledWith("scheduler_create_test", { p_owner: owner, p_recipient: "reader@example.com", p_time: expect.any(String), p_timezone: "Asia/Dhaka", p_key: requestKey, p_sender: "sender@example.com" });
  });
  it.each([{ recipient: "invalid" },{ recipient: "one@example.com,two@example.com" },{ confirmed: false },{ expectedSender: "" },{ timezone: "Invalid/Timezone" },{ scheduledAt: new Date(0).toISOString() }])("rejects invalid or unconfirmed input: %j",async (input) => { expect((await POST(request(input))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it.each([{ enabled: false, healthy: true },{ enabled: true, healthy: false }])("does not bypass an unavailable worker: %j",async (health) => { mocks.health.mockResolvedValue(health); expect((await POST(request())).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("blocks missing background authorization",async () => { mocks.background.mockResolvedValue({ connected: false }); expect((await POST(request())).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("reuses a lost-response confirmation without attempting to queue again",async () => {
    mocks.existing.mockResolvedValue({ data: { id: "existing", kind: "test", items: [{ recipient_email: "reader@example.com" }] }, error: null });
    const response=await POST(request({ scheduledAt: new Date(0).toISOString() })); expect(await response.json()).toMatchObject({ id: "existing", existing: true });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.eq).toHaveBeenCalledWith("user_id",owner);
  });
  it("rejects reusing a confirmation for another recipient or campaign", async () => {
    mocks.existing.mockResolvedValue({ data: { id: "existing", kind: "dataset", items: [] }, error: null }); expect((await POST(request())).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports the follow-up migration, not raw database errors",async () => {
    mocks.upgrade.mockResolvedValue({ data: null, error: { code: "42703", message: "private database detail" } });
    expect(await (await GET()).json()).toEqual({ error: expect.stringContaining("20261016_scheduled_test_mail.sql") });
  });
  it("preserves readable database safety refusals and rejects failed authentication",async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "This address is on your do-not-email list." } }); expect(await (await POST(request())).json()).toMatchObject({ error: expect.stringContaining("do-not-email") });
    mocks.rpc.mockClear(); mocks.context.mockRejectedValue(new Error("Sign in again.")); expect((await POST(request())).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
