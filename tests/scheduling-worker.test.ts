// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seal } from "@/lib/scheduling/core";
import { runScheduledWorker } from "@/lib/scheduling/worker";
import { SCHEDULE_TEST_MESSAGE } from "@/lib/scheduling/test-message";
const key = Buffer.alloc(32, 1).toString("base64");
const item = { id: "item", user_id: "owner", recipient_email: "reader@example.com", subject: "Frozen subject", html_body: "<p>Frozen body</p>", attempts: 0 };
let connection: Record<string, unknown>;
beforeEach(async () => { connection = { id: "connection", user_id: "owner", status: "connected", client_id: "11111111-1111-4111-8111-111111111111", authority: "https://login.microsoftonline.com/common", sender_email: "sender@example.com", microsoft_user_id: "ms-user", refresh_ciphertext: await seal("fixture-refresh", key, "owner:refresh"), credential_ciphertext: await seal("fixture-credential", key, "owner:credential") }; });
function database(live = true, attempts = 0, arm = true, test = false) {
  const queue = [{ batch: { id: "batch", user_id: "owner", connection_id: "connection", live_enabled: live, kind: test ? "test" : "dataset", dataset_id: test ? null : "dataset" }, item: { ...item, attempts, ...(test ? { dataset_row_id: null, template_id: null, subject: SCHEDULE_TEST_MESSAGE.subject, html_body: SCHEDULE_TEST_MESSAGE.html } : {}) } }];
  const rpc = vi.fn(async (name: string) => ({ data: name === "scheduler_next_item" ? queue.shift() ?? null : name === "scheduler_arm_item" ? arm : true, error: null }));
  const chain = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(async () => ({ data: connection, error: null })), then: (resolve: (value: { data: null; error: null }) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.update.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  return { rpc, from, chain, client: { rpc, from } as unknown as SupabaseClient };
}
function graph(send: Response | Error = new Response(null, { status: 202 }), wrongSender = false) {
  return vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ access_token: "fixture-access", refresh_token: "rotated-fixture", scope: "User.Read Mail.Send" })).mockResolvedValueOnce(Response.json({ id: wrongSender ? "wrong-ms-user" : "ms-user", mail: "sender@example.com" })).mockImplementationOnce(async () => { if (send instanceof Error) throw send; return send; });
}
describe("scheduled worker (no real Microsoft calls)", () => {
  it("uses the same authenticated worker for standalone tests with no spreadsheet/template", async () => {
    const db=database(true,0,true,true), fetcher=graph(); await runScheduledWorker(db.client,key,fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toMatchObject({message:{subject:SCHEDULE_TEST_MESSAGE.subject,body:{content:SCHEDULE_TEST_MESSAGE.html},toRecipients:[{emailAddress:{address:"reader@example.com"}}]}});
    expect(db.rpc).toHaveBeenCalledWith("scheduler_finish_item",expect.objectContaining({p_status:"accepted"}));
  });
  it("uses the frozen message and persists an accepted result only after an atomic claim", async () => {
    const db = database(); const fetcher = graph();
    expect(await runScheduledWorker(db.client, key, fetcher)).toMatchObject({ processed: 1 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const request = fetcher.mock.calls[2]; expect(request[0]).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({ message: { subject: "Frozen subject", body: { content: "<p>Frozen body</p>" }, toRecipients: [{ emailAddress: { address: "reader@example.com" } }] }, saveToSentItems: true });
    expect(db.rpc).toHaveBeenCalledWith("scheduler_arm_item", expect.objectContaining({ p_item: "item" }));
    expect(db.rpc).toHaveBeenCalledWith("scheduler_finish_item", expect.objectContaining({ p_status: "accepted" }));
    expect(db.chain.update).toHaveBeenCalledWith(expect.objectContaining({ refresh_ciphertext: expect.stringMatching(/^v1\./) }));
  });
  it("runs practice without obtaining a token or calling Graph", async () => {
    const db = database(false); const fetcher = vi.fn<typeof fetch>();
    await runScheduledWorker(db.client, key, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith("scheduler_finish_item", expect.objectContaining({ p_status: "simulated" }));
  });
  it("never sends if the final database safety claim refuses the item", async () => {
    const db = database(true, 0, false); const fetcher = graph(); await runScheduledWorker(db.client, key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(db.rpc).not.toHaveBeenCalledWith("scheduler_finish_item", expect.anything());
  });
  it("stops before sending if Microsoft returns a different mailbox identity", async () => {
    const db = database(); const fetcher = graph(new Response(null, { status: 202 }), true); await runScheduledWorker(db.client, key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(db.rpc).not.toHaveBeenCalledWith("scheduler_arm_item", expect.anything());
    expect(db.rpc).toHaveBeenCalledWith("scheduler_hold_batch", expect.objectContaining({ p_status: "reconnect_required" }));
  });
  it.each([new Error("network lost"), new Response(null, { status: 503 }), new Response(null, { status: 408 })])("records unknown outcomes without retrying", async (response) => {
    const db = database(); const fetcher = graph(response); await runScheduledWorker(db.client, key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3); expect(db.rpc).toHaveBeenCalledWith("scheduler_finish_item", expect.objectContaining({ p_status: "uncertain" }));
  });
  it.each([0, 2])("bounds explicit throttling retries at attempt %s", async (attempts) => {
    const db = database(true, attempts); await runScheduledWorker(db.client, key, graph(new Response(null, { status: 429, headers: { "retry-after": "180" } })));
    expect(db.rpc).toHaveBeenCalledWith("scheduler_finish_item", expect.objectContaining({ p_status: attempts === 2 ? "failed" : "pending", p_retry_seconds: 180 }));
  });
  it("requires reconnection if refresh authorization is revoked, without attempting mail", async () => {
    const db = database(); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 })); await runScheduledWorker(db.client, key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(db.rpc).not.toHaveBeenCalledWith("scheduler_arm_item", expect.anything());
    expect(db.rpc).toHaveBeenCalledWith("scheduler_hold_batch", expect.objectContaining({ p_status: "reconnect_required" }));
  });
});
