import { describe, expect, it } from "vitest";
import { isDuplicateSend, isSuppressed } from "@/lib/email/protection";
import { renderSignature } from "@/lib/email/signature";
import { isValidEmail, normalizeEmail, validateEmail } from "@/lib/validation/email";

describe("email safety logic", () => {
  it("normalizes and validates recipient addresses", () => {
    expect(normalizeEmail(" Person@Example.COM ")).toBe("person@example.com");
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(validateEmail("nope").reason).toBe("Invalid email format");
    expect(validateEmail(" ").reason).toBe("Missing email");
  });

  it("renders an escaped, email-compatible signature with custom links", () => {
    const html = renderSignature({ sender_name: "Avery <Admin>", designation: "Director", sender_email: "avery@example.com", website: "https://example.com", signature_preset: "professional", signature_settings: {} }, [
      { label: "Booking", value: "https://example.com/book", field_type: "url", display_order: 0, enabled: true, show_label: true, clickable: true, url: null },
    ]);
    expect(html).toContain("Avery &lt;Admin&gt;");
    expect(html).toContain("mailto:avery@example.com");
    expect(html).toContain("https://example.com/book");
    expect(html).not.toContain("<Admin>");
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
