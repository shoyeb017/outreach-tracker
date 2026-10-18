import { describe, expect, it } from "vitest";
import { activityKind, defaultEngagement, engagementButton, engagementSettings, ENGAGEMENT_PREVIEW_URL, safeEngagementPreview, validDestination } from "@/lib/engagement/core";
import { prepareRowEmail } from "@/lib/email/render";
import { sanitizeEmailHtml } from "@/lib/templates/placeholders";
import type { DatasetRow, EmailTemplate, SignatureField } from "@/types";
const settings = { ...defaultEngagement, enabled: true, destination: "https://inuberry.com/services" };
const row = { data: {}, template_override_id: null, routing_value: null, subject_value: null } as DatasetRow;
const template = { id: "template", name: "Example", is_active: true, is_archived: false, signature_behavior: "token_only", subject_template: "Hello", html_body: "<p>Hello!</p><p>Best regards,</p><p>{{signature}}</p>", plain_text_body: "Hello!\n\nBest regards,\n{{signature}}" } as EmailTemplate;
const fields = [{ id: "field", enabled: true, display_order: 0, field_type: "text", value: "Sample Sender", label: "", style_preference: {} }] as SignatureField[];
function render(overrides: Partial<EmailTemplate> = {}, engagement = settings) { return prepareRowEmail({ row, dataset: { fallback_template_id: "template", subject_strategy: "template" }, columns: [], rules: [], templates: [{ ...template, ...overrides }], signatureFields: fields, engagement }); }
describe("engagement composition and safe previews", () => {
  it("inserts once before the complete closing/signature without changing templates", () => {
    const email = render();
    expect(email.htmlBody.indexOf("Visit our website")).toBeLessThan(email.htmlBody.indexOf("Best regards"));
    expect(email.htmlBody.indexOf("Best regards")).toBeLessThan(email.htmlBody.indexOf("Sample Sender"));
    expect(email.htmlBody.match(/Visit our website/g)).toHaveLength(1);
    expect(email.plainTextBody.indexOf("Visit our website")).toBeLessThan(email.plainTextBody.indexOf("Best regards"));
    expect(email.htmlBody).toContain(ENGAGEMENT_PREVIEW_URL); expect(email.missing).toEqual([]);
    expect(email.htmlBody).not.toContain("autmail-signature-boundary");
    const rich=render({html_body:"<p>Hello!</p><p><strong>Best regards,</strong></p><p>{{signature}}</p>"});
    expect(rich.htmlBody.indexOf("Visit our website")).toBeLessThan(rich.htmlBody.indexOf("Best regards"));
  });
  it("supports after-signature, append, omitted signatures, and generated plain bodies", () => {
    const after = render({}, { ...settings, placement: "after_signature" });
    expect(after.htmlBody.indexOf("Sample Sender")).toBeLessThan(after.htmlBody.indexOf("Visit our website"));
    const append = render({ html_body: "<p>Hello</p><p>Kind regards,</p>", signature_behavior: "append" });
    expect(append.htmlBody.indexOf("Visit our website")).toBeLessThan(append.htmlBody.indexOf("Kind regards"));
    const none = render({ signature_behavior: "none", plain_text_body: null });
    expect(none.htmlBody).not.toContain("Sample Sender"); expect(none.htmlBody).toContain("Visit our website"); expect(none.plainTextBody).toContain(ENGAGEMENT_PREVIEW_URL);
    const disabled = render({}, { ...settings, enabled: false }); expect(disabled.htmlBody).not.toContain("Visit our website");
  });
  it("escapes text, permits controlled styles, and treats custom text as text, not placeholders", () => {
    const body = engagementButton({ ...settings, intro: '<img src=x onerror=alert(1)> {{company}}', button_text: '"Click" & visit', button_color: "#0055ff", alignment: "center" });
    expect(body).not.toContain("<img"); expect(body).toContain("&lt;img");
    expect(sanitizeEmailHtml(body)).toContain("background-color:#0055ff");
    expect(render({}, { ...settings, intro: "Hello {{my_field}}" }).missing).toEqual([]);
    expect(engagementSettings({ ...settings, button_color: "url(https://unsafe.example)" }).button_color).toBe(defaultEngagement.button_color);
  });
  it.each(["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "https://127.0.0.1", "https://localhost", "https://service.internal", "https://autmail.invalid", `https://example.com/e/${"a".repeat(64)}`])("rejects unsafe or recursive destinations: %s", value => expect(validDestination(value)).toBe(false));
  it("neutralizes real recipient links, including HTML sanitized by historical previews", () => {
    const tracked = `<a href="https://autmail.vercel.app/e/${"a".repeat(64)}">Visit</a><a href="${ENGAGEMENT_PREVIEW_URL}">Preview</a><a href="https://example.com">Direct</a>`;
    const safe = safeEngagementPreview(sanitizeEmailHtml(tracked));
    expect(safe).not.toContain("/e/"); expect(safe).not.toContain(ENGAGEMENT_PREVIEW_URL); expect(safe).toContain('href="https://example.com"');
    expect(safe).toContain("Preview only");
  });
  it("separates scanner/prefetch activity without claiming identity verification", () => {
    expect(activityKind(new Headers({ "User-Agent": "Mozilla/5.0 Chrome" }))).toBe("visit");
    expect(activityKind(new Headers({ "User-Agent": "Proofpoint scanner" }))).toBe("suspected");
    expect(activityKind(new Headers())).toBe("suspected");
    expect(activityKind(new Headers({ "Sec-Purpose": "prefetch", "User-Agent": "Mozilla" }))).toBe("ignore");
  });
});
