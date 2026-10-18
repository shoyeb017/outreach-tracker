// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_FIELDS, loadHistory } from "@/lib/history/server";
import { GET as preview } from "@/app/api/history/[id]/route";
import { POST as followup } from "@/app/api/history/followup/route";

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/engagement/server", async original => ({ ...await original<typeof import("@/lib/engagement/server")>(), engagementUser: mocks.context }));
const owner = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const record = { id, dataset_id: "spreadsheet", dataset_row_id: "row", send_run_id: "run", template_id: "template", recipient_email: "reader@example.com", subject: "Hello", status: "sent", is_test: false };
function database(results: Record<string, { data: unknown; error: unknown }>, auth = true) {
  const chains: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  const from = vi.fn((table: string) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "in", "order"]) chain[method] = vi.fn(() => chain);
    chain.limit = vi.fn(async () => results[table]);
    chain.maybeSingle = vi.fn(async () => results[table]);
    chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(results[table]).then(resolve));
    chains[table] = chain;
    return chain;
  });
  return { client: { from, auth: { getUser: vi.fn(async () => ({ data: { user: auth ? { id: owner } : null }, error: null })) } } as unknown as SupabaseClient, from, chains };
}
beforeEach(() => vi.clearAllMocks());

describe("resilient email history", () => {
  it("loads owner-scoped metadata without HTML or embedded relationships and labels scheduled results", async () => {
    const db = database({ email_history: { data: [record], error: null }, datasets: { data: [{ id: "spreadsheet", name: "Contacts" }], error: null }, templates: { data: [{ id: "template", name: "Intro" }], error: null }, send_runs: { data: [{ id: "run", scheduled_batch_id: "schedule" }], error: null } });
    const result = await loadHistory(db.client);
    expect(HISTORY_FIELDS).not.toMatch(/body|\(|\*/);
    expect(db.chains.email_history.eq).toHaveBeenCalledWith("user_id", owner);
    expect(result.rows[0]).toMatchObject({ recipient_email: "reader@example.com", sending_method: "scheduled", body_loaded: false, datasets: { name: "Contacts" } });
  });
  it("keeps results visible when optional scheduling or name lookups fail", async () => {
    const db = database({ email_history: { data: [record], error: null }, datasets: { data: null, error: { code: "42501" } }, templates: { data: [], error: null }, send_runs: { data: null, error: { code: "42703" } } });
    const result = await loadHistory(db.client);
    expect(result.rows).toHaveLength(1); expect(result.rows[0].sending_method).toBe("unknown"); expect(result.warning).toMatch(/labels are unavailable/);
  });
  it("returns an actionable error instead of throwing or displaying an empty history", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadHistory(database({ email_history: { data: null, error: { code: "57014" } } }).client);
    expect(result.rows).toEqual([]); expect(result.error).toMatch(/took too long/); log.mockRestore();
  });
  it("does not query history without a verified user", async () => {
    const db = database({}, false); expect((await loadHistory(db.client)).error).toMatch(/Sign in again/); expect(db.from).not.toHaveBeenCalled();
  });
  it("loads a saved body on demand only for its owner and reports missing messages", async () => {
    const db = database({ email_history: { data: { final_html_body: "<p>Hello</p>", final_plain_text_body: "Hello" }, error: null } });
    mocks.context.mockResolvedValue({ user: { id: owner }, client: db.client });
    const response = await preview(new Request("https://autmail.vercel.app/api/history/" + id), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200); expect(db.chains.email_history.eq).toHaveBeenCalledWith("user_id", owner); expect(db.chains.email_history.eq).toHaveBeenCalledWith("id", id);
    mocks.context.mockResolvedValue({ user: { id: owner }, client: database({ email_history: { data: null, error: null } }).client });
    expect((await preview(new Request("https://autmail.vercel.app"), { params: Promise.resolve({ id }) })).status).toBe(404);
  });
  it("requires confirmation, binds the follow-up to the signed-in owner and hides database internals", async () => {
    mocks.context.mockResolvedValue({ user: { id: owner }, database: { rpc: mocks.rpc } });
    const body = { ids: [id, id], name: "Follow-up", requestKey: crypto.randomUUID(), confirmed: true, userId: "attacker" };
    const request = (value: unknown) => new Request("https://autmail.vercel.app/api/history/followup", { method: "POST", body: JSON.stringify(value) });
    mocks.rpc.mockResolvedValue({ data: { id }, error: null });
    expect((await followup(request(body))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("history_create_followup", expect.objectContaining({ p_owner: owner, p_ids: [id] }));
    mocks.rpc.mockClear(); expect((await followup(request({ ...body, confirmed: false }))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "private database detail" } });
    const failure = await followup(request(body)); expect(await failure.text()).not.toContain("private database detail");
  });
});
