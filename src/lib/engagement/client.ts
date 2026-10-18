export async function engagementRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...options?.headers }, signal: options?.signal ?? AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Email engagement is unavailable. Try refreshing.");
  return data as T;
}
export interface EngagementMessage {
  id: string; dataset_id: string | null; campaign_id: string; dataset_name: string; template_name: string; recipient_email: string;
  subject: string; destination: string; status: string; accepted_at: string | null; first_activity_at: string | null;
  last_activity_at: string | null; activity_count: number; suspected_count: number; last_suspected_at: string | null; created_at: string; expires_at: string;
}
