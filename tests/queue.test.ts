import { describe, expect, it, vi } from "vitest";
import { BrowserSendQueue, resumableItems, summarizeQueue } from "@/lib/sending/queue";
import type { SendQueueItem } from "@/types";

const item = (id: string, status: SendQueueItem["status"] = "queued"): SendQueueItem => ({ id, rowId: `row-${id}`, recipientEmail: `${id}@example.com`, templateId: "template", subject: "Hello", htmlBody: "<p>Hello</p>", plainTextBody: "Hello", status, attempts: 0 });

describe("browser send queue", () => {
  it("summarizes durable states", () => {
    const summary = summarizeQueue([item("1", "sent"), item("2", "failed"), item("3", "skipped"), item("4")], "paused");
    expect(summary).toMatchObject({ processed: 3, sent: 1, failed: 1, skipped: 1, state: "paused" });
  });

  it("resumes only unfinished items and resets interrupted sending", () => {
    const result = resumableItems([item("1", "sent"), item("2", "sending"), item("3", "queued"), item("4", "simulated")]);
    expect(result.map((entry) => [entry.id, entry.status])).toEqual([["2", "queued"], ["3", "queued"]]);
  });

  it("sends sequentially, persists each result, and completes", async () => {
    const send = vi.fn().mockResolvedValueOnce("sent").mockResolvedValueOnce("simulated");
    const persist = vi.fn().mockResolvedValue(undefined);
    const queue = new BrowserSendQueue([item("1"), item("2")], send, persist, 0);
    const final = await queue.run();
    expect(send).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(final).toMatchObject({ state: "completed", processed: 2, sent: 2, failed: 0 });
  });

  it("records a permanent item failure without losing later work", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("Denied")).mockResolvedValueOnce("sent");
    const queue = new BrowserSendQueue([item("1"), item("2")], send, vi.fn().mockResolvedValue(undefined), 0);
    const final = await queue.run();
    expect(final.failed).toBe(1); expect(final.sent).toBe(1); expect(final.state).toBe("completed");
  });
});
