import type { SendQueueItem, SendStatus } from "@/types";
import { UncertainSendError } from "./errors";

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
  return items.filter((item) => item.status === "queued" || item.status === "failed");
}

export class BrowserSendQueue {
  private state: QueueState = "idle";
  private items: SendQueueItem[];
  private processing: Promise<QueueSnapshot> | null = null;
  constructor(
    items: SendQueueItem[],
    private readonly send: (item: SendQueueItem) => Promise<"sent" | "simulated">,
    private readonly persist: (item: SendQueueItem, snapshot: QueueSnapshot, phase?: "before" | "after" | "resolution") => Promise<void>,
    private readonly delayMs = 500,
    private readonly concurrency = 1,
  ) { this.items = items; }

  snapshot() { return summarizeQueue(this.items, this.state); }
  isProcessing() { return this.processing !== null; }
  pause() { if (this.state === "running") this.state = "paused"; }
  resume() { if (this.state === "paused") return this.run(); }
  async resolveUncertain(id: string, accepted: boolean) {
    if (this.processing) throw new Error("Wait for in-flight emails to finish before confirming an outcome.");
    if (this.state !== "paused") throw new Error("Pause the run before resolving an outcome.");
    const index = this.items.findIndex((item) => item.id === id && item.status === "sending");
    if (index < 0) throw new Error("This outcome no longer needs confirmation.");
    const previousItem = this.items[index];
    const previousState = this.state;
    this.items[index] = { ...previousItem, status: accepted ? "sent" : "failed", error: accepted ? "User confirmed the email in Microsoft Sent Items" : "User checked the outcome and explicitly approved retry" };
    if (!this.items.some((item) => ["queued", "failed", "sending"].includes(item.status))) this.state = "completed";
    try { await this.persist(this.items[index], this.snapshot(), "resolution"); }
    catch (error) { this.items[index] = previousItem; this.state = previousState; throw error; }
    return this.snapshot();
  }
  stop() {
    this.state = "cancelled";
    this.items = this.items.map((item) => item.status === "queued" ? { ...item, status: "cancelled" } : item);
    if (!this.processing && this.items.some((item) => item.status === "sending")) this.state = "paused";
  }

  run() {
    if (this.processing) return this.processing;
    this.processing = this.process().finally(() => { this.processing = null; });
    return this.processing;
  }

  private async process() {
    this.state = "running";
    let cursor = 0;
    const worker = async () => {
      while (cursor < this.items.length && this.state === "running") {
        const index = cursor++;
        const item = this.items[index];
        if (!["queued", "failed"].includes(item.status)) continue;
        this.items[index] = { ...item, status: "sending", attempts: item.attempts + 1, error: undefined };
        try { await this.persist(this.items[index], this.snapshot(), "before"); }
        catch (error) { this.state = "paused"; throw error; }
        try {
          const status = await this.send(this.items[index]);
          this.items[index] = { ...this.items[index], status };
        } catch (error) {
          this.items[index] = { ...this.items[index], status: error instanceof UncertainSendError ? "sending" : "failed", error: error instanceof Error ? error.message : "Unknown sending error" };
          if (error instanceof UncertainSendError || (error instanceof Error && /expired|connect|session|denied|permission|account changed/i.test(error.message))) this.state = "paused";
        }
        try { await this.persist(this.items[index], this.snapshot(), "after"); }
        catch (error) { this.state = "paused"; throw error; }
        if (this.delayMs > 0 && cursor < this.items.length) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(3, this.concurrency)) }, worker));
    if (this.snapshot().state === "cancelled" && this.items.some((item) => item.status === "sending")) this.state = "paused";
    if (this.state === "running") this.state = this.items.some((item) => item.status === "sending") ? "paused" : "completed";
    return this.snapshot();
  }
}
