"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, LoaderCircle, Pause, Play, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SendReviewDialog } from "@/components/sending/send-review-dialog";
import { prepareRowEmail, rowTemplateData } from "@/lib/email/render";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email";
import { checkEmailReadiness, type ReadyStatus } from "@/lib/email/readiness";
import { sendGraphEmail, verifyMicrosoftSender } from "@/lib/microsoft/graph";
import { BrowserSendQueue, type QueueSnapshot } from "@/lib/sending/queue";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { dataPlaceholdersForTemplates, templatesUsedByDataset } from "@/lib/templates/dataset-mapping";
import type { Dataset, DatasetColumn, DatasetPlaceholderMapping, DatasetRow, EmailTemplate, MicrosoftIntegration, RoutingRule, SendQueueItem, SendRun, SendRunItem, SignatureField, UserPreferences } from "@/types";

type DuplicatePolicy = UserPreferences["duplicate_policy"];

const duplicatePolicyLabels: Record<DuplicatePolicy, string> = {
  block_template_recipient: "Block same template + recipient",
  warn: "Warn but allow duplicates",
  allow: "Allow duplicates",
};

interface Prepared { row: DatasetRow; email: ReturnType<typeof prepareRowEmail>; status: ReadyStatus; note?: string; warning?: string }

export function SendPanel(props: {
  dataset: Dataset; columns: DatasetColumn[]; placeholderMappings: DatasetPlaceholderMapping[]; templates: EmailTemplate[]; rules: RoutingRule[]; signatureFields: SignatureField[];
  integration?: Partial<MicrosoftIntegration> | null; preferences: Partial<UserPreferences>; selection: Set<string>; suppressions: string[]; history: { recipient_email: string; template_id: string | null; status: string }[];
  unfinishedRuns: (SendRun & { send_run_items: SendRunItem[] })[];
  onRepair: (target: "required setup" | "template routing" | "placeholder mapping" | "recipients") => void;
}) {
  const router = useRouter();
  const [prepared, setPrepared] = useState<Prepared[] | null>(null); const [preparing, setPreparing] = useState(false); const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null); const [activeRun, setActiveRun] = useState<string | null>(null); const [testRecipient, setTestRecipient] = useState(props.preferences.send_test_recipient ?? ""); const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>(props.preferences.duplicate_policy ?? "block_template_recipient"); const queueRef = useRef<BrowserSendQueue | null>(null);
  const [activeLive, setActiveLive] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  useEffect(() => () => { queueRef.current?.pause(); }, []);
  const skippedBaseRef = useRef(0);
  const senderRef = useRef<string | undefined>(undefined);
  const busy = preparing || snapshot?.state === "running" || snapshot?.state === "paused";
  useEffect(() => { if (snapshot?.state !== "running") return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [snapshot?.state]);
  async function verifySender(live: boolean, expected = props.integration?.connected_email) { senderRef.current = undefined; if (!live) return; if (!expected || props.integration?.connection_status !== "connected") throw new Error("Connect Microsoft in Settings before sending real emails."); senderRef.current = await verifyMicrosoftSender(props.integration?.tenant_id ?? "", props.integration?.client_id ?? "", expected); }
  const summary = useMemo(() => prepared ? prepared.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }), {}) : {}, [prepared]);
  const emailColumn = props.columns.find((column) => column.standard_field === "recipient_email");
  const routingColumn = props.columns.find((column) => column.id === props.dataset.routing_column_id);
  const usedTemplates = useMemo(() => templatesUsedByDataset(props.templates, props.rules, props.dataset.fallback_template_id), [props.dataset.fallback_template_id, props.rules, props.templates]);
  const requiredPlaceholders = useMemo(() => dataPlaceholdersForTemplates(usedTemplates, props.dataset.subject_strategy !== "spreadsheet"), [usedTemplates, props.dataset.subject_strategy]);
  const mappedPlaceholders = new Set(props.placeholderMappings.map((mapping) => mapping.placeholder));
  const missingMappings = requiredPlaceholders.filter((placeholder) => !mappedPlaceholders.has(placeholder));
  async function fetchSelectedRows() { const ids = [...props.selection]; const rows: DatasetRow[] = []; const supabase = getSupabaseBrowserClient(); for (let start = 0; start < ids.length; start += 200) { const { data, error } = await supabase.from("dataset_rows").select("*").eq("dataset_id", props.dataset.id).in("id", ids.slice(start, start + 200)); if (error) throw error; rows.push(...(data ?? [])); } return rows; }
  async function prepare() {
    if (busy) return;
    if (!props.selection.size) return toast.error("Select at least one recipient first.");
    setPreparing(true);
    try {
      const rows = (await fetchSelectedRows()).sort((a, b) => a.row_number - b.row_number);
      const supabase = getSupabaseBrowserClient();
      const { data: protection, error } = await supabase.rpc("send_recipient_protection", { p_emails: [...new Set(rows.map((row) => row.recipient_email?.trim().toLowerCase()).filter(Boolean))] });
      if (error) throw error;
      const batchItems: { recipient_email: string; template_id: string }[] = [];
      const items = rows.map<Prepared>((row) => {
        const email = prepareRowEmail({ row, dataset: props.dataset, columns: props.columns, placeholderMappings: props.placeholderMappings, templates: props.templates, rules: props.rules, signatureFields: props.signatureFields });
        const result = checkEmailReadiness({ row, email, mapped: mappedPlaceholders, suppressions: protection.suppressed ?? [], uncertain: protection.uncertain ?? [], history: protection.history ?? [], policy: duplicatePolicy, batchItems });
        if (result.status === "ready" && row.recipient_email && email.template) batchItems.push({ recipient_email: row.recipient_email, template_id: email.template.id });
        return { row, email, ...result };
      });
      setPrepared(items);
    } catch { toast.error("Could not check recipients. Your choices are saved; try again."); }
    finally { setPreparing(false); }
  }
  async function createRun(items: Prepared[], isTest = false) { const supabase = getSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Sign in again before sending."); const ready = items.filter((item) => item.status === "ready"); const skipped = items.length - ready.length;
    const { data: run, error: runError } = await supabase.from("send_runs").insert({ user_id: user.id, dataset_id: props.dataset.id, status: "paused", live_enabled: props.preferences.live_sending_enabled ?? false, selected_count: items.length, sent_count: 0, failed_count: 0, skipped_count: skipped, is_test: isTest, started_at: new Date().toISOString(), microsoft_email: props.integration?.connected_email ?? null }).select("*").single(); if (runError) throw runError;
    const records = items.map((item) => ({ user_id: user.id, send_run_id: run.id, dataset_row_id: item.row.id, recipient_email: item.row.recipient_email || "", template_id: item.email.template?.id ?? null, resolved_subject: item.email.subject, resolved_html_body: item.email.htmlBody, resolved_plain_text_body: item.email.plainTextBody, status: item.status === "ready" ? "queued" : "skipped", attempts: 0, error_message: item.note ?? null }));
    const saved: SendRunItem[] = [];
    for (let start = 0; start < records.length; start += 500) {
      const { data, error } = await supabase.from("send_run_items").insert(records.slice(start, start + 500)).select("*");
      if (error) { await supabase.from("send_runs").update({ status: "cancelled" }).eq("id", run.id); await supabase.from("send_run_items").update({ status: "cancelled" }).eq("send_run_id", run.id).eq("status", "queued"); throw error; }
      saved.push(...(data ?? []));
    }
    const skippedHistory = (saved as SendRunItem[]).filter((item) => item.status === "skipped").map((item) => { const source = items.find((entry) => entry.row.id === item.dataset_row_id); const data: Record<string, unknown> = source ? rowTemplateData(source.row, props.columns, props.placeholderMappings) : {}; return { user_id: user.id, dataset_id: props.dataset.id, dataset_row_id: item.dataset_row_id, send_run_id: run.id, send_run_item_id: item.id, template_id: item.template_id, recipient_email: item.recipient_email, recipient_name: String(data.recipient_name ?? data.name ?? "") || null, company_name: String(data.company_name ?? data.company ?? "") || null, subject: item.resolved_subject, final_html_body: item.resolved_html_body, final_plain_text_body: item.resolved_plain_text_body, sender_microsoft_email: props.integration?.connected_email ?? null, status: "skipped", error_message: item.error_message, is_test: isTest }; });
    for (let start = 0; start < skippedHistory.length; start += 500) { const { error } = await supabase.from("email_history").insert(skippedHistory.slice(start, start + 500)); if (error) throw error; }
    router.refresh(); return { run: run as SendRun, items: saved as SendRunItem[], initialSkipped: skipped };
  }
  async function runQueue(run: SendRun, savedItems: SendRunItem[]) { const supabase = getSupabaseBrowserClient(); const queueItems: SendQueueItem[] = savedItems.map((item) => ({ id: item.id, rowId: item.dataset_row_id, recipientEmail: item.recipient_email, templateId: item.template_id ?? "", subject: item.resolved_subject, htmlBody: item.resolved_html_body, plainTextBody: item.resolved_plain_text_body ?? "", status: item.status, attempts: item.attempts, error: item.error_message ?? undefined }));
    setActiveRun(run.id); skippedBaseRef.current = 0; const live = run.live_enabled === true; setActiveLive(live);
    const queue = new BrowserSendQueue(queueItems, async (item) => { const result = await sendGraphEmail({ tenantId: props.integration?.tenant_id ?? "", clientId: props.integration?.client_id ?? "", liveEnabled: live, expectedAccount: senderRef.current, email: { to: item.recipientEmail, subject: item.subject, htmlBody: item.htmlBody } }); return result.status; }, async (item, current, phase) => {
      setSnapshot({ ...current, skipped: current.skipped }); const status = item.status; const sentAt = status === "sent" || status === "simulated" ? new Date().toISOString() : null;
      if (phase === "before") {
        const { data: claimed, error } = await supabase.rpc("claim_send_run_item", { p_item_id: item.id, p_expected_attempts: item.attempts - 1 });
        if (error) throw error;
        if (!claimed) throw new Error("Another tab has already processed this email. Refresh Send history before continuing.");
      } else {
        const update = supabase.from("send_run_items").update({ status, attempts: item.attempts, error_message: item.error ?? null, sent_at: sentAt }).eq("id", item.id);
        const { data, error } = await (phase === "resolution" ? update.eq("status", "sending").eq("attempts", item.attempts) : update).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("This outcome changed in another tab. Refresh before continuing.");
      }
      const preparedItem = prepared?.find((entry) => entry.row.id === item.rowId); const data: Record<string, unknown> = preparedItem ? rowTemplateData(preparedItem.row, props.columns, props.placeholderMappings) : {};
      if (status !== "sending") { const { error: historyError } = await supabase.from("email_history").upsert({ user_id: run.user_id, dataset_id: props.dataset.id, dataset_row_id: item.rowId, send_run_id: run.id, send_run_item_id: item.id, template_id: item.templateId, recipient_email: item.recipientEmail, recipient_name: String(data.recipient_name ?? data.name ?? "") || null, company_name: String(data.company_name ?? data.company ?? "") || null, subject: item.subject, final_html_body: item.htmlBody, final_plain_text_body: item.plainTextBody, sender_microsoft_email: run.microsoft_email ?? null, status, error_message: item.error ?? null, sent_at: sentAt ?? new Date().toISOString(), is_test: run.is_test }, { onConflict: "send_run_item_id" }); if (historyError) throw historyError; }
      const { error: progressError } = await supabase.from("send_runs").update({ status: current.state === "completed" ? "completed" : current.state === "paused" ? "paused" : "running", sent_count: current.sent, failed_count: current.failed, skipped_count: current.skipped }).eq("id", run.id); if (progressError) throw progressError;
    }, props.preferences.delay_between_sends_ms ?? 1000, props.preferences.send_concurrency ?? 1); queueRef.current = queue; setSnapshot(queue.snapshot()); let final: QueueSnapshot; setQueueProcessing(true); try { final = await queue.run(); } catch (error) { setSnapshot(queue.snapshot()); await supabase.from("send_runs").update({ status: "paused" }).eq("id", run.id); throw error; } finally { setQueueProcessing(false); } setSnapshot({ ...final, skipped: final.skipped }); const finalStatus = final.state === "cancelled" ? "cancelled" : final.state === "paused" ? "paused" : "completed"; const { error: finalError } = await supabase.from("send_runs").update({ status: finalStatus, sent_count: final.sent, failed_count: final.failed, skipped_count: final.skipped, completed_at: finalStatus === "completed" ? new Date().toISOString() : null }).eq("id", run.id); if (finalError) throw finalError; router.refresh(); if (finalStatus === "completed") toast.success(live ? "Microsoft accepted the emails for sending." : "Practice completed. No emails were sent.");
  }
  async function confirmSend() { if (!prepared || preparing || !prepared.some((item) => item.status === "ready")) return; if (props.preferences.live_sending_enabled && props.integration?.connection_status !== "connected") return toast.error("Connect Microsoft before a live send."); setPreparing(true); try { await verifySender(props.preferences.live_sending_enabled === true); const created = await createRun(prepared); setPrepared(null); await runQueue(created.run, created.items); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start send."); } finally { setPreparing(false); } }
  async function sendTest() { if (busy) return; if (!isValidEmail(testRecipient)) return toast.error("Enter a valid test recipient."); if (!props.selection.size) return toast.error("Select a representative row first."); setPreparing(true); try { if (props.preferences.live_sending_enabled && !window.confirm(`Send a real test email to ${testRecipient} from ${props.integration?.connected_email ?? "your Microsoft account"}?`)) return; await verifySender(props.preferences.live_sending_enabled === true); const rows = (await fetchSelectedRows()).sort((a, b) => a.row_number - b.row_number); const row = rows[0]; if (!row) throw new Error("The selected row is no longer available."); const { data: protection, error: protectionError } = await getSupabaseBrowserClient().rpc("send_recipient_protection", { p_emails: [normalizeEmail(testRecipient)] }); if (protectionError) throw protectionError; if ((protection.suppressed ?? []).includes(normalizeEmail(testRecipient))) throw new Error("This test address is suppressed. Choose an address you are allowed to contact."); const email = prepareRowEmail({ row, dataset: props.dataset, columns: props.columns, placeholderMappings: props.placeholderMappings, templates: props.templates, rules: props.rules, signatureFields: props.signatureFields }); if (!email.template) throw new Error("No template resolves for the selected row."); const unmapped = email.requiredFields.filter((placeholder) => !mappedPlaceholders.has(placeholder)); if (unmapped.length) throw new Error(`Map these placeholders first: ${unmapped.map((token) => `{{${token}}}`).join(", ")}`); if (email.missing.length) throw new Error(`Missing placeholder values: ${email.missing.join(", ")}`); const testRow = { ...row, recipient_email: normalizeEmail(testRecipient), email_valid: true }; const item: Prepared = { row: testRow, email: { ...email, subject: `[TEST] ${email.subject}` }, status: "ready" }; const created = await createRun([item], true); await runQueue(created.run, created.items); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send test."); } finally { setPreparing(false); } }
  async function resume(run: SendRun & { send_run_items: SendRunItem[] }) {
    if (busy) return;
    if (run.live_enabled == null) return toast.error("This older run has no saved send mode. Review its history and create a new selection instead.");
    if (!window.confirm(run.live_enabled ? "Resume real emails? Only queued or failed recipients will be retried. Uncertain outcomes will not be resent." : "Resume practice? No real emails will be sent.")) return;
    setPreparing(true);
    try { await verifySender(run.live_enabled, run.microsoft_email); const items: SendRunItem[] = []; for (let offset = 0; ; offset += 500) { const { data, error } = await getSupabaseBrowserClient().from("send_run_items").select("*").eq("send_run_id", run.id).order("created_at").order("id").range(offset, offset + 499); if (error) throw error; items.push(...(data ?? [])); if ((data ?? []).length < 500) break; } await runQueue(run, items); }
    catch { toast.error("Could not resume. Reconnect Microsoft if needed and check Send history before trying again."); }
    finally { setPreparing(false); }
  }
  async function resolveOutcome(id: string, accepted: boolean) {
    if (!queueRef.current || resolving || queueProcessing) return;
    if (accepted && !activeLive) return;
    const message = accepted ? "Have you verified this email in Microsoft Sent Items? Mark it as accepted without sending it again?" : activeLive ? "Retrying can duplicate an email. Have you checked Sent Items and confirmed it was not sent? Allow an explicit retry when you resume?" : "Retry this practice result? No real email will be sent.";
    if (!window.confirm(message)) return;
    setResolving(true);
    try { const result = await queueRef.current.resolveUncertain(id, accepted); setSnapshot(result); if (activeRun) { const { error } = await getSupabaseBrowserClient().from("send_runs").update({ status: result.state === "completed" ? "completed" : "paused", completed_at: result.state === "completed" ? new Date().toISOString() : null }).eq("id", activeRun); if (error) throw error; } router.refresh(); }
    catch { toast.error("Could not save your confirmation. Refresh and check history before doing anything else."); }
    finally { setResolving(false); }
  }
  async function pause() { queueRef.current?.pause(); if (activeRun) await getSupabaseBrowserClient().from("send_runs").update({ status: "paused" }).eq("id", activeRun); setSnapshot((current) => current ? { ...current, state: "paused" } : current); }
  async function resumeActive() { if (!queueRef.current) return; const supabase = getSupabaseBrowserClient(); if (activeRun) await supabase.from("send_runs").update({ status: "running" }).eq("id", activeRun); let result: QueueSnapshot | undefined; setQueueProcessing(true); try { result = await queueRef.current.resume(); } catch { setSnapshot(queueRef.current.snapshot()); toast.error("Progress could not be saved. Check Send history before resuming."); return; } finally { setQueueProcessing(false); } if (result) { const withSkipped = { ...result, skipped: result.skipped + skippedBaseRef.current }; setSnapshot(withSkipped); if (activeRun && result.state === "completed") await supabase.from("send_runs").update({ status: "completed", sent_count: result.sent, failed_count: result.failed, skipped_count: withSkipped.skipped, completed_at: new Date().toISOString() }).eq("id", activeRun); } }
  async function stop() { queueRef.current?.stop(); if (activeRun) { const supabase = getSupabaseBrowserClient(); await supabase.from("send_run_items").update({ status: "cancelled", error_message: "Cancelled by user" }).eq("send_run_id", activeRun).eq("status", "queued"); await supabase.from("send_runs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", activeRun); } setSnapshot((current) => current ? { ...current, state: "cancelled" } : current); }
  return <div className="space-y-6">{props.unfinishedRuns.length > 0 && <Card className="border-[var(--border)] bg-[var(--muted)]"><CardHeader><CardTitle>Unfinished send found</CardTitle></CardHeader><CardContent className="space-y-3">{props.unfinishedRuns.map((run) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-[var(--card)] p-3" key={run.id}><div><div className="text-sm font-semibold">{run.sent_count + run.failed_count + run.skipped_count} / {run.selected_count} processed</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Status: {run.status}</div></div><Button onClick={() => resume(run)} disabled={busy}><Play size={14} />Resume</Button></div>)}</CardContent></Card>}
    {snapshot && <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{snapshot.state === "completed" ? "Send complete" : "Sending"}</CardTitle><Badge tone={snapshot.state === "completed" ? "success" : snapshot.state === "paused" ? "warning" : "info"}>{snapshot.state}</Badge></div></CardHeader><CardContent><div className="text-3xl font-semibold tracking-[-.04em]">{snapshot.processed} / {snapshot.items.length}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--muted)]"><div className="h-full bg-[var(--primary)] transition-[width] duration-200" style={{ width: `${snapshot.items.length ? (snapshot.processed / snapshot.items.length) * 100 : 0}%` }} /></div><div className="mt-4 flex flex-wrap gap-4 text-sm"><span className="text-[var(--primary)]">Accepted / practiced: {snapshot.sent}</span><span className="text-[var(--danger)]">Failed: {snapshot.failed}</span><span className="text-[var(--muted-foreground)]">Skipped: {snapshot.skipped}</span></div>{snapshot.state === "paused" && !queueProcessing && snapshot.items.some((item) => item.status === "sending") && <div role="alert" className="mt-4 rounded-lg bg-[var(--muted)] p-4 text-sm">{activeLive ? "Some email outcomes are unconfirmed. Check Microsoft Sent Items before taking further action. These recipients will not be retried automatically." : "Some practice results were not saved. No real emails were sent. Confirm a retry below to continue."}<ul className="mt-2 list-disc pl-5">{snapshot.items.filter((item) => item.status === "sending").map((item) => <li key={item.id} className="mt-3"><p>{item.recipientEmail}: {item.error || "Interrupted before the outcome was saved"}</p>{snapshot.state === "paused" && <div className="mt-2 flex flex-wrap gap-2">{activeLive && <Button size="sm" variant="outline" disabled={resolving} onClick={() => resolveOutcome(item.id, true)}>Checked: email is in Sent Items</Button>}<Button size="sm" variant="outline" disabled={resolving} onClick={() => resolveOutcome(item.id, false)}>{activeLive ? "Checked: allow deliberate retry" : "Allow practice retry"}</Button></div>}</li>)}</ul></div>}<p className="mt-4 text-xs text-[var(--muted-foreground)]">Keep this browser tab open. Each email is saved before sending. “Sent” means accepted by Microsoft, not confirmed delivery. If an outcome is uncertain, check Microsoft Sent Items; it will not be resent automatically.</p><div className="mt-5 flex gap-2">{snapshot.state === "running" && <Button variant="outline" onClick={pause}><Pause size={14} />Pause</Button>}{snapshot.state === "paused" && <Button disabled={resolving || !snapshot.items.some((item) => item.status === "queued" || item.status === "failed")} onClick={resumeActive}><Play size={14} />Resume</Button>}{["running", "paused"].includes(snapshot.state) && <Button variant="danger" onClick={stop}><Square size={14} />Stop remaining</Button>}</div></CardContent></Card>}
    <Card className={emailColumn && (routingColumn || props.dataset.fallback_template_id) && !missingMappings.length ? "border-[var(--border)]" : "border-[var(--border)]"}><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Before you send</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">These are the exact spreadsheet keys, templates, and placeholder mappings used for this send.</p></div><Badge tone={emailColumn && (routingColumn || props.dataset.fallback_template_id) && !missingMappings.length ? "success" : "warning"}>{emailColumn && (routingColumn || props.dataset.fallback_template_id) && !missingMappings.length ? "Ready" : "Needs attention"}</Badge></div></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="rounded-lg bg-[var(--surface-hover)] p-3 text-sm"><div className="text-xs text-[var(--muted-foreground)]">Recipient email / To column</div><div className="mt-1 font-semibold">{emailColumn?.original_label || "Not selected"}</div></div><div className="rounded-lg bg-[var(--surface-hover)] p-3 text-sm"><div className="text-xs text-[var(--muted-foreground)]">Column that chooses the email</div><div className="mt-1 font-semibold">{routingColumn?.original_label || "One template for everyone"}</div></div><div className="rounded-lg bg-[var(--surface-hover)] p-3 text-sm md:col-span-2"><div className="text-xs text-[var(--muted-foreground)]">Email templates used</div><div className="mt-2 flex flex-wrap gap-2">{usedTemplates.length ? usedTemplates.map((template) => <Badge key={template.id} tone="info">{template.name}</Badge>) : <span className="font-semibold text-[var(--danger)]">No templates selected</span>}</div></div><div className="rounded-lg bg-[var(--surface-hover)] p-3 text-sm md:col-span-2"><div className="text-xs text-[var(--muted-foreground)]">Personalization fields</div><div className="mt-1 font-semibold">{requiredPlaceholders.length - missingMappings.length} of {requiredPlaceholders.length} connected</div>{missingMappings.length > 0 && <p className="mt-2 text-xs text-[var(--danger)]">Missing: {missingMappings.map((placeholder) => `{{${placeholder}}}`).join(", ")}</p>}</div><div className="rounded-lg border bg-[var(--card)] p-3 text-sm md:col-span-2"><Label htmlFor="duplicate-policy">Duplicate handling for this send</Label><Select id="duplicate-policy" className="mt-2" value={duplicatePolicy} disabled={busy} onChange={(event) => setDuplicatePolicy(event.target.value as DuplicatePolicy)}><option value="block_template_recipient">Block same template + recipient</option><option value="warn">Warn but allow duplicates</option><option value="allow">Allow duplicates (useful for testing)</option></Select><p className={`mt-2 text-xs leading-5 ${duplicatePolicy === "allow" ? "text-[var(--danger)]" : "text-[var(--muted-foreground)]"}`}>{duplicatePolicy === "block_template_recipient" ? "Safest default. A repeated address is blocked only when it also resolves to the same template." : duplicatePolicy === "warn" ? "Repeated recipient + template rows remain sendable and are clearly marked in final review." : "No duplicate is blocked. Use this when several company rows intentionally share one test inbox."}</p></div></CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-[1fr_.7fr]"><Card><CardHeader><CardTitle>Review selected recipients</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">We check the selected rows before you confirm. Preview any email, fix missing information, or exclude blocked rows.</p></CardHeader><CardContent><div className="rounded-xl border bg-[var(--surface-hover)] p-5"><div className="text-xs font-bold normal-case tracking-normal text-[var(--muted-foreground)]">Selected recipients</div><div className="mt-2 text-4xl font-semibold tracking-[-.05em]">{props.selection.size.toLocaleString()}</div><Button className="mt-5" onClick={prepare} disabled={busy || !props.selection.size}>{preparing ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} />}Review and send</Button></div><p className="mt-4 flex gap-2 text-xs leading-5 text-[var(--muted-foreground)]"><AlertTriangle size={15} className="shrink-0 text-[var(--muted-foreground)]" />The final review checks email validity, suppression, duplicates, routing, templates, and unresolved or unmapped placeholders.</p></CardContent></Card><Card><CardHeader><CardTitle>Send a test</CardTitle></CardHeader><CardContent><Label htmlFor="test-recipient">Test recipient</Label><Input id="test-recipient" type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="test@example.com" /><p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Uses the first selected row, prefixes the subject with [TEST], and never marks the original recipient as contacted.</p><Button className="mt-4" variant="outline" onClick={sendTest} disabled={busy}>Send test</Button></CardContent></Card></div>
    {prepared && <SendReviewDialog
      items={prepared}
      summary={summary}
      routingColumnLabel={routingColumn?.original_label}
      duplicatePolicy={duplicatePolicy}
      duplicatePolicyLabel={duplicatePolicyLabels[duplicatePolicy]}
      microsoftEmail={props.integration?.connected_email}
      live={props.preferences.live_sending_enabled ?? false}
      preparing={preparing}
      onClose={() => { if (!preparing) setPrepared(null); }}
      onRepair={(target) => { setPrepared(null); props.onRepair(target); }}
      onConfirm={confirmSend}
    />}
  </div>;
}
