// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/engagement/server", async original => ({ ...await original<typeof import("@/lib/engagement/server")>(), engagementUser: mocks.context }));
import { POST } from "@/app/api/records/delete/route";
const owner = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const request = (body: unknown) => new Request("https://autmail.vercel.app/api/records/delete", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ user: { id: owner }, database: { rpc: mocks.rpc } }); mocks.rpc.mockResolvedValue({ data: { removed: 1 }, error: null }); });
describe("owner-scoped bulk deletion API", () => {
  it.each(["engagement", "history", "schedule"])("binds %s removals to the verified owner", async kind => {
    expect((await POST(request({ kind, ids: [id, id], confirmed: true, userId: "attacker" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("records_delete_selection", { p_owner: owner, p_kind: kind, p_ids: [id] });
  });
  it("rejects missing confirmation, unknown sections and oversized selections", async () => {
    for (const body of [{ kind: "history", ids: [id], confirmed: false }, { kind: "users", ids: [id], confirmed: true }, { kind: "history", ids: Array(501).fill(id), confirmed: true }]) expect((await POST(request(body))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("stops when sign-in/workspace/origin checks fail and hides database internals", async () => {
    mocks.context.mockRejectedValueOnce(new Error("Sign in again."));
    expect((await POST(request({ kind: "history", ids: [id], confirmed: true }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "internal database detail" } });
    const result = await POST(request({ kind: "history", ids: [id], confirmed: true }));
    expect(await result.text()).toContain("record-deletion migration");
  });
});
