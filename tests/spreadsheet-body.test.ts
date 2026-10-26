import { describe, expect, it } from "vitest";
import { prepareRowEmail } from "@/lib/email/render";
import { checkEmailReadiness } from "@/lib/email/readiness";
import { datasetWorkflowState } from "@/lib/datasets/workflow";
import { defaultEngagement, ENGAGEMENT_PREVIEW_URL } from "@/lib/engagement/core";
import type { Dataset, DatasetColumn, DatasetRow, EmailTemplate, SignatureField } from "@/types";

const dataset = { id: "campaign", body_source: "spreadsheet", body_column_id: "body", spreadsheet_signature: true, subject_strategy: "spreadsheet", fallback_template_id: null, routing_column_id: null } as Dataset;
const columns = [
  { id: "body", placeholder_slug: "message", standard_field: "email_body" },
  { id: "to", placeholder_slug: "email", standard_field: "recipient_email" },
  { id: "subject", placeholder_slug: "subject", standard_field: "subject" },
  { id: "company", placeholder_slug: "company", standard_field: null },
] as DatasetColumn[];
const row = { id: "row", dataset_id: "campaign", recipient_email: "reader@example.com", email_valid: true, subject_value: "A personal introduction", data: { message: "Hi {{company}},\n\nCan we talk?", company: "Northstar & Co" } } as unknown as DatasetRow;
const signature = [{ id: "signature", field_type: "text", enabled: true, value: "Alex Sender", display_order: 0 }] as SignatureField[];
const args = { row, dataset, columns, templates: [] as EmailTemplate[], rules: [], signatureFields: signature };
const ready = (email = prepareRowEmail(args), overrides: Partial<Parameters<typeof checkEmailReadiness>[0]> = {}) => checkEmailReadiness({ row, email, mapped: new Set(), suppressions: [], policy: "block_template_recipient", ...overrides });

describe("spreadsheet email bodies", () => {
  it("renders without any template, preserving paragraphs, subject and signature", () => {
    const email = prepareRowEmail(args);
    expect(email.template).toBeNull();
    expect(email.bodySource).toBe("spreadsheet");
    expect(email.contentKey).toBe("spreadsheet:campaign");
    expect(email.subject).toBe("A personal introduction");
    expect(email.htmlBody).toContain("Hi Northstar &amp; Co,<br /><br />Can we talk?");
    expect(email.plainTextBody).toContain("Hi Northstar & Co,\n\nCan we talk?");
    expect(email.htmlBody).toContain("Alex Sender");
    expect(email.missing).toEqual([]);
    expect(ready(email).status).toBe("ready");
  });
  it("does not fall back to an old override, rule or default template", () => {
    const email = prepareRowEmail({ ...args, dataset: { ...dataset, fallback_template_id: "old" }, row: { ...row, template_override_id: "old", routing_value: "skip" }, rules: [{ action: "skip", normalized_value: "skip", template_id: null }] as never });
    expect(email.routeSource).toBe("spreadsheet");
    expect(ready(email).status).toBe("ready");
  });
  it("can omit the saved signature when the spreadsheet already contains it", () => {
    const email = prepareRowEmail({ ...args, dataset: { ...dataset, spreadsheet_signature: false } });
    expect(email.htmlBody).not.toContain("Alex Sender");
    expect(email.plainTextBody).not.toContain("Alex Sender");
  });
  it("escapes HTML cells and replacement values instead of running markup", () => {
    const email = prepareRowEmail({ ...args, row: { ...row, data: { message: '<script>alert(1)</script>\n{{company}}', company: '<img src=x onerror=alert(2)>' } } });
    expect(email.htmlBody).not.toContain("<script");
    expect(email.htmlBody).not.toContain("<img");
    expect(email.htmlBody).toContain("&lt;script&gt;");
    expect(email.htmlBody).toContain("&lt;img");
  });
  it.each(["", "   ", "\n"])("blocks a blank body even when a signature would make the email nonempty (%j)", cell => {
    const email = prepareRowEmail({ ...args, row: { ...row, data: { message: cell } } });
    expect(email.missing).toContain("email_body");
    expect(ready(email).status).toBe("missing_placeholder");
  });
  it("blocks missing body columns and blank spreadsheet subjects, with no template fallback", () => {
    expect(prepareRowEmail({ ...args, dataset: { ...dataset, body_column_id: "deleted" } }).missing).toContain("email_body");
    expect(prepareRowEmail({ ...args, row: { ...row, subject_value: "" } }).missing).toContain("email_subject");
  });
  it("resolves exact spreadsheet keys and flags unresolved fields without manual template mapping", () => {
    const email = prepareRowEmail({ ...args, row: { ...row, data: { message: "Hello {{unknown}}" } } });
    expect(email.missing).toContain("unknown");
    expect(email.requiredFields).toEqual([]);
    expect(ready(email).status).toBe("missing_placeholder");
  });
  it("keeps engagement previews untracked and places the button before the signature", () => {
    const email = prepareRowEmail({ ...args, engagement: { ...defaultEngagement, enabled: true, destination: "https://example.com" } });
    expect(email.htmlBody).toContain(ENGAGEMENT_PREVIEW_URL);
    expect(email.htmlBody.indexOf(ENGAGEMENT_PREVIEW_URL)).toBeLessThan(email.htmlBody.indexOf("Alex Sender"));
  });
  it("blocks repeats in the same spreadsheet campaign, permits another campaign and honors warn/allow", () => {
    const email = prepareRowEmail(args);
    const repeat = { recipient_email: "READER@example.com", template_id: null, content_key: "spreadsheet:campaign" };
    expect(ready(email, { batchItems: [repeat] }).status).toBe("duplicate");
    expect(ready(email, { history: [{ ...repeat, status: "sent" }] }).status).toBe("duplicate");
    expect(ready(email, { batchItems: [repeat], policy: "warn" })).toMatchObject({ status: "ready", warning: expect.any(String) });
    expect(ready(email, { batchItems: [repeat], policy: "allow" }).status).toBe("ready");
    expect(ready(email, { batchItems: [{ ...repeat, content_key: "spreadsheet:another" }] }).status).toBe("ready");
  });
  it("blocks scheduled reservations and uncertain outcomes even under allow-duplicates", () => {
    const repeat = { recipient_email: "reader@example.com", template_id: null, content_key: "spreadsheet:campaign" };
    expect(ready(undefined, { policy: "allow", scheduled: [repeat] }).status).toBe("scheduled");
    expect(ready(undefined, { policy: "allow", uncertain: [repeat] }).status).toBe("uncertain");
  });
  it("retains recipient and suppression checks", () => {
    expect(ready(undefined, { suppressions: ["reader@example.com"] }).status).toBe("suppressed");
    expect(ready(undefined, { row: { ...row, recipient_email: null } }).status).toBe("missing_email");
  });
  it("completes setup and personalization with no templates, but detects deleted columns", () => {
    const workflow = (value: Dataset) => datasetWorkflowState({ dataset: value, columns, templates: [], rules: [], placeholderMappings: [], routingValues: [], selectedCount: 1 });
    expect(workflow(dataset)).toMatchObject({ setup: true, templates: true, personalized: true, fields: [], recommended: "send" });
    expect(workflow({ ...dataset, body_column_id: "deleted" }).setup).toBe(false);
    expect(workflow({ ...dataset, body_source: "template" }).setup).toBe(false);
  });
});
