import { describe, expect, it, vi } from "vitest";
import { BrowserSendQueue, resumableItems, summarizeQueue } from "@/lib/sending/queue";
import { UncertainSendError } from "@/lib/sending/errors";
import type { SendQueueItem } from "@/types";

const item = (id: string, status: SendQueueItem["status"] = "queued"): SendQueueItem => ({ id, rowId: `row-${id}`, recipientEmail: `${id}@example.com`, templateId: "template", subject: "Hello", htmlBody: "<p>Hello</p>", plainTextBody: "Hello", status, attempts: 0 });

describe("browser send queue", () => {
  it("keeps an outcome uncertain when its confirmation cannot be saved", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const queue = new BrowserSendQueue([item("1")], vi.fn().mockRejectedValue(new UncertainSendError()), persist, 0);
    await queue.run();
    persist.mockRejectedValueOnce(new Error("Offline"));
    await expect(queue.resolveUncertain("1", false)).rejects.toThrow("Offline");
    expect(queue.snapshot().items[0].status).toBe("sending");
    expect(queue.snapshot().state).toBe("paused");
  });

  it("does not start another worker while a paused request is still in flight", async () => {
    let finish!: () => void;
    const send = vi.fn(() => new Promise<"sent">((resolve) => { finish = () => resolve("sent"); }));
    const queue = new BrowserSendQueue([item("1")], send, vi.fn().mockResolvedValue(undefined), 0);
    const running = queue.run();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    queue.pause();
    expect(queue.resume()).toBe(running);
    finish();
    await running;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("summarizes durable states", () => {
    const summary = summarizeQueue([item("1", "sent"), item("2", "failed"), item("3", "skipped"), item("4")], "paused");
    expect(summary).toMatchObject({ processed: 3, sent: 1, failed: 1, skipped: 1, state: "paused" });
  });

  it("never automatically resends interrupted or completed items", () => {
    const result = resumableItems([item("1", "sent"), item("2", "sending"), item("3", "queued"), item("4", "simulated")]);
    expect(result.map((entry) => [entry.id, entry.status])).toEqual([["3", "queued"]]);
  });

  it("sends sequentially, persists each result, and completes", async () => {
    const send = vi.fn().mockResolvedValueOnce("sent").mockResolvedValueOnce("simulated");
    const persist = vi.fn().mockResolvedValue(undefined);
    const queue = new BrowserSendQueue([item("1"), item("2")], send, persist, 0);
    const final = await queue.run();
    expect(send).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(4);
    expect(persist.mock.calls[0][0].status).toBe("sending");
    expect(final).toMatchObject({ state: "completed", processed: 2, sent: 2, failed: 0 });
  });

  it("records a permanent item failure without losing later work", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("Invalid recipient")).mockResolvedValueOnce("sent");
    const queue = new BrowserSendQueue([item("1"), item("2")], send, vi.fn().mockResolvedValue(undefined), 0);
    const final = await queue.run();
    expect(final.failed).toBe(1); expect(final.sent).toBe(1); expect(final.state).toBe("completed");
  });

  it("pauses on permission errors and resumes only after deliberate recovery", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("Permission denied")).mockResolvedValue("sent");
    const queue = new BrowserSendQueue([item("1"), item("2")], send, vi.fn().mockResolvedValue(undefined), 0);
    expect(await queue.run()).toMatchObject({ state: "paused", failed: 1, sent: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await queue.resume()).toMatchObject({ state: "completed", sent: 2 });
  });

  it("keeps an uncertain outcome paused and never retries that recipient", async () => {
    const send = vi.fn().mockRejectedValueOnce(new UncertainSendError()).mockResolvedValue("sent");
    const queue = new BrowserSendQueue([item("1"), item("2")], send, vi.fn().mockResolvedValue(undefined), 0);
    expect(await queue.run()).toMatchObject({ state: "paused", sent: 0, failed: 0 });
    expect(queue.snapshot().items[0].status).toBe("sending");
    expect(await queue.resume()).toMatchObject({ state: "paused", sent: 1 });
    expect(send.mock.calls.map(([entry]) => entry.id)).toEqual(["1", "2"]);
  });

  it("does not contact Microsoft if pre-send persistence fails", async () => {
    const send = vi.fn();
    const queue = new BrowserSendQueue([item("1")], send, vi.fn().mockRejectedValue(new Error("Offline")), 0);
    await expect(queue.run()).rejects.toThrow("Offline");
    expect(send).not.toHaveBeenCalled();
    expect(queue.snapshot().state).toBe("paused");
  });

  it("requires explicit resolution before retrying an uncertain item", async () => {
    const send = vi.fn().mockRejectedValueOnce(new UncertainSendError()).mockResolvedValue("sent");
    const persist = vi.fn().mockResolvedValue(undefined);
    const queue = new BrowserSendQueue([item("1")], send, persist, 0);
    await queue.run();
    expect(await queue.resolveUncertain("1", false)).toMatchObject({ state: "paused", failed: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await queue.resume()).toMatchObject({ state: "completed", sent: 1 });
  });

  it("preserves completed counts and stops only remaining recipients", async () => {
    const send = vi.fn().mockResolvedValue("sent");
    const queue = new BrowserSendQueue([item("1", "sent"), item("2"), item("3")], send, async (_item, snapshot) => { if (snapshot.sent === 2) queue.stop(); }, 0);
    expect(await queue.run()).toMatchObject({ state: "cancelled", sent: 2, skipped: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
