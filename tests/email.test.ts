import { describe, expect, it } from "vitest";
import { isDuplicateSend, isSuppressed } from "@/lib/email/protection";
import { renderSignature } from "@/lib/email/signature";
import { sanitizeEmailHtml } from "@/lib/templates/placeholders";
import { isValidEmail, normalizeEmail, validateEmail } from "@/lib/validation/email";

describe("email safety logic", () => {
  it("normalizes and validates recipient addresses", () => {
    expect(normalizeEmail(" Person@Example.COM ")).toBe("person@example.com");
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(validateEmail("nope").reason).toBe("Invalid email format");
    expect(validateEmail(" ").reason).toBe("Missing email");
  });

  it("renders an escaped, email-compatible signature with custom links", () => {
    const html = renderSignature([
      { label: "", value: "Best regards,", field_type: "text", display_order: 0, enabled: true, show_label: false, clickable: false, url: null, style_preference: {} },
      { label: "", value: "Avery <Admin>", field_type: "text", display_order: 1, enabled: true, show_label: false, clickable: false, url: null, style_preference: { bold: true } },
      { label: "Email", value: "avery@example.com", field_type: "email", display_order: 2, enabled: true, show_label: true, clickable: true, url: null, style_preference: {} },
      { label: "Booking", value: "https://example.com/book", field_type: "url", display_order: 3, enabled: true, show_label: true, clickable: true, url: null, style_preference: {} },
      { label: "Example logo", value: "https://example.com/logo.png", field_type: "image", display_order: 4, enabled: true, show_label: false, clickable: true, url: "https://example.com", style_preference: { width: 180 } },
    ]);
    expect(html).toContain("Avery &lt;Admin&gt;");
    expect(html).toContain("mailto:avery@example.com");
    expect(html).toContain("https://example.com/book");
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain('alt="Example logo"');
    expect(html).toContain('width="180"');
    expect(sanitizeEmailHtml(html)).toContain('src="https://example.com/logo.png"');
    expect(html).not.toContain("<Admin>");
    expect(renderSignature([])).toBe("");
  });

  it("rejects unsafe logo sources and clamps logo width", () => {
    const unsafe = renderSignature([
      { label: "Bad logo", value: "javascript:alert(1)", field_type: "image", display_order: 0, enabled: true, show_label: false, clickable: false, url: null, style_preference: { width: 200 } },
    ]);
    const oversized = renderSignature([
      { label: "Large logo", value: "https://example.com/logo.png", field_type: "image", display_order: 0, enabled: true, show_label: false, clickable: false, url: null, style_preference: { width: 5000 } },
    ]);
    expect(unsafe).toBe("");
    expect(oversized).toContain('width="600"');
  });

  it("applies the selected policy to same-run and historical duplicates", () => {
    const runItems = [{ recipient_email: "a@example.com", template_id: "t1" }];
    expect(isDuplicateSend({ email: "A@EXAMPLE.COM", templateId: "t1", runItems, policy: "block_template_recipient" })).toEqual({ duplicate: true, blocked: true, scope: "run" });
    expect(isDuplicateSend({ email: "A@EXAMPLE.COM", templateId: "t1", runItems, policy: "warn" })).toEqual({ duplicate: true, blocked: false, scope: "run" });
    expect(isDuplicateSend({ email: "A@EXAMPLE.COM", templateId: "t1", runItems, policy: "allow" })).toEqual({ duplicate: true, blocked: false, scope: "run" });
    expect(isDuplicateSend({ email: "A@EXAMPLE.COM", templateId: "t2", runItems, policy: "block_template_recipient" })).toEqual({ duplicate: false, blocked: false });
    const history = [{ recipient_email: "a@example.com", template_id: "t1", status: "sent" }];
    expect(isDuplicateSend({ email: "a@example.com", templateId: "t1", history, policy: "block_template_recipient" }).blocked).toBe(true);
    expect(isDuplicateSend({ email: "a@example.com", templateId: "t1", history, policy: "warn" })).toMatchObject({ duplicate: true, blocked: false });
  });

  it("matches suppression addresses after normalization", () => {
    expect(isSuppressed(" PERSON@example.com ", ["person@example.com"])).toBe(true);
    expect(isSuppressed("other@example.com", ["person@example.com"])).toBe(false);
  });
});
