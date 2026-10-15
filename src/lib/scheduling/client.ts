export async function schedulingRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers }, signal: options?.signal ?? AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Scheduled emails are unavailable. Try refreshing.");
  return data as T;
}
export type { ScheduledBatch, ScheduledItem } from "./core";
export interface BackgroundStatus { connected: boolean; status: string; senderEmail: string | null; reason: string | null; updatedAt: string | null; microsoftConnected: boolean; custom: boolean; setupReady: boolean }
export interface SchedulerHealth { enabled: boolean; healthy: boolean; lastTickAt: string | null }
export interface SchedulePreview {
  datasetName: string; live: boolean; senderEmail: string | null; hash: string; readyCount: number; blockedCount: number;
  items: { row_id: string; row_number: number; recipient_email: string; template_name: string; subject: string; html_body: string; status: string; note?: string; warning?: string }[];
}
