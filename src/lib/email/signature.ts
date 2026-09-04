import type { SenderProfile, SignatureField } from "@/types";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function safeLink(field: Pick<SignatureField, "field_type" | "value" | "url">) {
  const value = String(field.url || field.value).trim();
  if (field.field_type === "email") return `mailto:${value.replace(/^mailto:/i, "")}`;
  if (field.field_type === "phone") return `tel:${value.replace(/[^+\d]/g, "")}`;
  if (field.field_type === "url" && /^https?:\/\//i.test(value)) return value;
  return null;
}

export function renderSignature(
  sender: Partial<SenderProfile>,
  customFields: Pick<SignatureField, "label" | "value" | "field_type" | "display_order" | "enabled" | "show_label" | "clickable" | "url">[] = [],
) {
  const settings = (sender.signature_settings ?? {}) as Record<string, unknown>;
  const compact = sender.signature_preset === "compact";
  const gap = compact ? "2px" : "4px";
  const core = [
    { label: "", value: sender.sender_name, bold: settings.boldName !== false },
    { label: "", value: sender.designation },
    { label: "", value: sender.organization },
    { label: "Email", value: sender.sender_email, type: "email" },
    { label: "Phone", value: sender.company_phone || sender.mobile, type: "phone" },
    { label: "Website", value: sender.website, type: "url" },
    { label: "", value: sender.location },
  ].filter((field) => String(field.value ?? "").trim());

  const custom = [...customFields].filter((field) => field.enabled && field.value.trim()).sort((a, b) => a.display_order - b.display_order);
  const lines = [
    ...core.map((field) => {
      const value = escapeHtml(field.value);
      const href = field.type === "email" ? `mailto:${escapeHtml(field.value)}` : field.type === "phone" ? `tel:${String(field.value).replace(/[^+\d]/g, "")}` : field.type === "url" && /^https?:\/\//i.test(String(field.value)) ? escapeHtml(field.value) : null;
      const content = href ? `<a href="${href}" style="color:#176b55;text-decoration:none">${value}</a>` : value;
      const label = field.label && settings.showLabels !== false ? `${escapeHtml(field.label)}: ` : "";
      return `<div style="margin:0 0 ${gap};${field.bold ? "font-weight:700;" : ""}">${label}${content}</div>`;
    }),
    ...custom.map((field) => {
      const href = field.clickable ? safeLink(field) : null;
      const value = escapeHtml(field.value);
      const content = href ? `<a href="${escapeHtml(href)}" style="color:#176b55;text-decoration:none">${value}</a>` : value;
      return `<div style="margin:0 0 ${gap};">${field.show_label ? `${escapeHtml(field.label)}: ` : ""}${content}</div>`;
    }),
  ];
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:#26322f;margin-top:18px"><div style="margin-bottom:8px">Best regards,</div>${lines.join("")}</div>`;
}
