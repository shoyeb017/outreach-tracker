import { describe, expect, it } from "vitest";
import { prepareRowEmail } from "@/lib/email/render";
import { checkEmailReadiness } from "@/lib/email/readiness";
import { renderPlainTextSignature } from "@/lib/email/signature";
import { safeNextPath } from "@/lib/navigation";
import { sanitizeEmailHtml } from "@/lib/templates/placeholders";
import type { DatasetRow, EmailTemplate, RoutingRule, SignatureField } from "@/types";

const template = (id: string): EmailTemplate => ({ id, name: id, subject_template: "Hello {{company_name}}", html_body: "<p>Hi {{company_name}},</p><p>{{annual_revenue}}</p><p>{{signature}}</p>", plain_text_body: "Hi {{company_name}},\n{{signature}}", signature_behavior: "token_only", is_active: true, is_archived: false } as EmailTemplate);
const row = (group = "Technology & Software"): DatasetRow => ({ id: "row", dataset_id: "dataset", original_data: {}, email_normalized: "contact@example.com", created_at: "2026-10-08", updated_at: "2026-10-08", row_number: 2, recipient_email: "contact@example.com", email_valid: true, data: { business_name: "Northstar Labs", revenue: "250000" }, routing_value: group, template_override_id: null, subject_value: null } as DatasetRow);
const columns = [{ id: "company", placeholder_slug: "business_name", standard_field: null }, { id: "revenue", placeholder_slug: "revenue", standard_field: null }];
const mappings = [{ placeholder: "company_name", column_id: "company" }, { placeholder: "annual_revenue", column_id: "revenue" }];
const rules = [{ normalized_value: "technology & software", template_id: "tech", action: "template" }, { normalized_value: "manufacturing & industrial", template_id: "manufacturing", action: "template" }] as RoutingRule[];
const signature = [{ value: "Best regards,", enabled: true, field_type: "text", display_order: 0 }, { value: "Seattle", enabled: true, field_type: "text", display_order: 1 }, { value: "https://example.com/logo.png", label: "Logo", field_type: "image", enabled: true, display_order: 2, style_preference: { width: 120 } }].map((field, index) => ({ id: String(index), user_id: "user", label: "", show_label: false, clickable: false, url: null, style_preference: {}, ...field })) as SignatureField[];
const args = { row: row(), columns, placeholderMappings: mappings, templates: [template("tech"), template("manufacturing")], rules, signatureFields: signature, dataset: { routing_column_id: "industry", fallback_template_id: null, subject_strategy: "template" as const } };
const readiness = (overrides: Partial<Parameters<typeof checkEmailReadiness>[0]> = {}) => checkEmailReadiness({ row: args.row, email: prepareRowEmail(args), mapped: new Set(["company_name", "annual_revenue"]), suppressions: [], policy: "block_template_recipient", ...overrides });

describe("guided outreach journey", () => {
  it("uses one chosen template for everyone without stale column rules", () => {
    const email = prepareRowEmail({ ...args, dataset: { ...args.dataset, routing_column_id: null, fallback_template_id: "manufacturing" } });
    expect(email.template?.id).toBe("manufacturing");
    expect(email.subject).toBe("Hello Northstar Labs");
    expect(email.missing).toEqual([]);
    expect(email.htmlBody).toContain("250000");
  });
  it("resolves mixed industry recipients independently in the same batch", () => {
    expect(prepareRowEmail(args).template?.id).toBe("tech");
    expect(prepareRowEmail({ ...args, row: row("Manufacturing & Industrial") }).template?.id).toBe("manufacturing");
    expect(readiness().status).toBe("ready");
  });
  it("keeps address and logo outside paragraph wrappers and creates real plain text", () => {
    const email = prepareRowEmail(args);
    expect(email.htmlBody).not.toMatch(/<p>\s*<div/);
    expect(email.htmlBody).toContain("Seattle");
    expect(email.htmlBody).toContain('width="120"');
    expect(email.plainTextBody).toBe("Hi Northstar Labs,\nBest regards,\nSeattle");
    expect(renderPlainTextSignature(signature)).not.toContain("logo.png");
  });
  it("distinguishes a missing connection from a missing value", () => {
    expect(readiness({ mapped: new Set() }).status).toBe("missing_mapping");
    const email = prepareRowEmail({ ...args, row: { ...args.row, data: { business_name: "", revenue: "" } } });
    expect(readiness({ email }).status).toBe("missing_placeholder");
  });
  it("blocks missing addresses, invalid addresses, suppressed recipients and unmatched emails", () => {
    expect(readiness({ row: { ...args.row, recipient_email: null } }).status).toBe("missing_email");
    expect(readiness({ row: { ...args.row, email_valid: false } }).status).toBe("invalid_email");
    expect(readiness({ suppressions: ["contact@example.com"] }).status).toBe("suppressed");
    expect(readiness({ email: prepareRowEmail({ ...args, row: row("Unknown") }) }).status).toBe("missing_template");
  });
  it("applies duplicate policy to shared test inboxes without blocking different templates", () => {
    const batchItems = [{ recipient_email: "contact@example.com", template_id: "tech" }];
    expect(readiness({ batchItems }).status).toBe("duplicate");
    expect(readiness({ batchItems, policy: "warn" })).toMatchObject({ status: "ready", warning: expect.any(String) });
    expect(readiness({ batchItems, policy: "allow" }).status).toBe("ready");
    expect(readiness({ batchItems, email: prepareRowEmail({ ...args, row: row("Manufacturing & Industrial") }) }).status).toBe("ready");
  });
  it("escapes imported HTML and sanitizes malicious HTML in server and browser previews", () => {
    const email = prepareRowEmail({ ...args, row: { ...args.row, data: { business_name: '<img src=x onerror=alert(1)>', revenue: "0" } } });
    expect(email.htmlBody).toContain("&lt;img");
    const html = sanitizeEmailHtml('<svg onload=alert(1)></svg><img src=x onerror=alert(1)><iframe srcdoc="bad"></iframe><a href="javascript:alert(1)">X</a><p style="background:url(https://evil.example)">Hello</p>');
    expect(html).not.toMatch(/onload|onerror|javascript:|iframe|svg|url\(/);
  });
  it("does not require template-subject fields when using the spreadsheet subject", () => {
    const email = prepareRowEmail({ ...args, templates: [{ ...template("tech"), subject_template: "{{missing_subject_field}}" }], row: { ...args.row, subject_value: "Row subject" }, dataset: { ...args.dataset, subject_strategy: "spreadsheet" } });
    expect(email.subject).toBe("Row subject");
    expect(email.missing).toEqual([]);
  });
  it("restricts authentication redirects to local paths", () => {
    for (const path of ["//evil.example", "https://evil.example", "/\\evil.example", "/\n/evil.example"]) expect(safeNextPath(path)).toBe("/dashboard");
    expect(safeNextPath("/datasets/import")).toBe("/datasets/import");
  });
});
