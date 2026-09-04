import type { SendQueueItem, SendStatus } from "@/types";

export type QueueState = "idle" | "running" | "paused" | "completed" | "cancelled";
export interface QueueSnapshot { state: QueueState; items: SendQueueItem[]; processed: number; sent: number; failed: number; skipped: number }

export function summarizeQueue(items: SendQueueItem[], state: QueueState = "idle"): QueueSnapshot {
  const completedStatuses: SendStatus[] = ["sent", "failed", "skipped", "cancelled", "simulated"];
  return {
    state,
    items,
    processed: items.filter((item) => completedStatuses.includes(item.status)).length,
    sent: items.filter((item) => item.status === "sent" || item.status === "simulated").length,
    failed: items.filter((item) => item.status === "failed").length,
    skipped: items.filter((item) => item.status === "skipped" || item.status === "cancelled").length,
  };
}

export function resumableItems(items: SendQueueItem[]) {
  return items.filter((item) => item.status === "queued" || item.status === "failed" || item.status === "sending").map((item) => item.status === "sending" ? { ...item, status: "queued" as const } : item);
}

export class BrowserSendQueue {
  private state: QueueState = "idle";
  private items: SendQueueItem[];
  constructor(
    items: SendQueueItem[],
    private readonly send: (item: SendQueueItem) => Promise<"sent" | "simulated">,
    private readonly persist: (item: SendQueueItem, snapshot: QueueSnapshot) => Promise<void>,
    private readonly delayMs = 500,
    private readonly concurrency = 1,
  ) { this.items = items; }

  snapshot() { return summarizeQueue(this.items, this.state); }
  pause() { if (this.state === "running") this.state = "paused"; }
  resume() { if (this.state === "paused") return this.run(); }
  stop() {
    this.state = "cancelled";
    this.items = this.items.map((item) => item.status === "queued" ? { ...item, status: "cancelled" } : item);
  }

  async run() {
    this.state = "running";
    let cursor = 0;
    const worker = async () => {
      while (cursor < this.items.length && this.state === "running") {
        const index = cursor++;
        const item = this.items[index];
        if (!["queued", "failed"].includes(item.status)) continue;
        this.items[index] = { ...item, status: "sending", attempts: item.attempts + 1, error: undefined };
        try {
          const status = await this.send(this.items[index]);
          this.items[index] = { ...this.items[index], status };
        } catch (error) {
          this.items[index] = { ...this.items[index], status: "failed", error: error instanceof Error ? error.message : "Unknown sending error" };
        }
        await this.persist(this.items[index], this.snapshot());
        if (this.delayMs > 0 && cursor < this.items.length) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(3, this.concurrency)) }, worker));
    if (this.state === "running") this.state = "completed";
    return this.snapshot();
  }
}
