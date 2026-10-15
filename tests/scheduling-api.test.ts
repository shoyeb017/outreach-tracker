// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), prepare: vi.fn(), health: vi.fn(), background: vi.fn(), rpc: vi.fn(), select: vi.fn(), eq: vi.fn(), existing: vi.fn() }));
vi.mock("@/lib/scheduling/server", async (original) => ({ ...await original<typeof import("@/lib/scheduling/server")>(), scheduleUser: mocks.context, prepareSchedule: mocks.prepare, schedulerHealth: mocks.health, backgroundStatus: mocks.background }));
import { POST } from "@/app/api/schedules/route";
import { PATCH } from "@/app/api/schedules/[id]/route";
const owner = "11111111-1111-4111-8111-111111111111", datasetId = "22222222-2222-4222-8222-222222222222", rowId = "33333333-3333-4333-8333-333333333333";
const hash = "a".repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.existing }; mocks.select.mockReturnValue(chain); mocks.eq.mockReturnValue(chain); mocks.existing.mockResolvedValue({ data: null, error: null });
  mocks.context.mockResolvedValue({ user: { id: owner }, database: { rpc: mocks.rpc, from: vi.fn(() => chain) } });
  mocks.prepare.mockResolvedValue({ hash, readyCount: 1, live: true, items: [{ row_id: rowId, status: "ready" }, { row_id: "blocked", status: "suppressed" }] });
  mocks.health.mockResolvedValue({ enabled: true, healthy: true }); mocks.background.mockResolvedValue({ connected: true }); mocks.rpc.mockResolvedValue({ data: "new-schedule", error: null });
});
function request(overrides: Record<string, unknown> = {}) { return new Request("https://autmail.vercel.app/api/schedules", { method: "POST", headers: { Origin: "https://autmail.vercel.app", "Content-Type": "application/json" }, body: JSON.stringify({ datasetId, rowIds: [rowId], duplicatePolicy: "block_template_recipient", scheduledAt: new Date(Date.now() + 900000).toISOString(), timezone: "Asia/Dhaka", expectedHash: hash, requestKey: "44444444-4444-4444-8444-444444444444", confirmed: true, ...overrides }) }); }
describe("schedule creation safety", () => {
  it("uses the authenticated owner, server-reviewed rows and current server mode", async () => {
    const response = await POST(request({ userId: "another-user", liveEnabled: false, html: "client-supplied content" }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("scheduler_create_batch", expect.objectContaining({ p_owner: owner, p_live: true, p_items: [{ row_id: rowId, status: "ready" }] }));
    expect(mocks.context).toHaveBeenCalledWith(expect.any(Request));
  });
  it("returns the existing schedule after a lost confirmation response, without re-queuing", async () => {
    mocks.existing.mockResolvedValue({ data: { id: "existing-schedule", dataset_id: datasetId }, error: null });
    const response = await POST(request()); expect(await response.json()).toMatchObject({ id: "existing-schedule", existing: true });
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.eq).toHaveBeenCalledWith("user_id", owner);
  });
  it("rejects a changed review before saving", async () => { mocks.prepare.mockResolvedValue({ hash: "b".repeat(64), readyCount: 1 }); const response = await POST(request()); expect((await response.json()).error).toContain("changed"); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it.each([{ enabled: false, healthy: true }, { enabled: true, healthy: false }])("blocks confirmation when the worker is unavailable: %j", async (health) => { mocks.health.mockResolvedValue(health); const response = await POST(request()); expect((await response.json()).error).toContain("worker"); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("requires background authorization for real mail but not practice", async () => {
    mocks.background.mockResolvedValue({ connected: false }); expect((await POST(request())).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.prepare.mockResolvedValue({ hash, readyCount: 1, live: false, items: [{ row_id: rowId, status: "ready" }] }); expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("scheduler_create_batch", expect.objectContaining({ p_live: false }));
  });
  it("requires confirmation and refuses more than 100 rows", async () => { expect((await POST(request({ confirmed: false }))).status).toBe(400); expect((await POST(request({ rowIds: Array.from({ length: 101 }, () => rowId) }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("stops on authentication or same-origin validation failure", async () => { mocks.context.mockRejectedValue(new Error("This request was not sent from the configured website.")); const response = await POST(request()); expect(response.status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it("never trusts a caller-supplied owner when changing a schedule", async () => {
    await PATCH(new Request("https://autmail.vercel.app/api/schedules/" + datasetId, { method: "PATCH", body: JSON.stringify({ action: "cancel", confirmed: true, userId: "someone-else" }) }), { params: Promise.resolve({ id: datasetId }) });
    expect(mocks.rpc).toHaveBeenCalledWith("scheduler_change_batch", expect.objectContaining({ p_owner: owner, p_batch: datasetId, p_action: "cancel" }));
  });
});
