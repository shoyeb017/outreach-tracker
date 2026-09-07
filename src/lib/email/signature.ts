import type { SignatureField } from "@/types";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function safeLink(field: Pick<SignatureField, "field_type" | "value" | "url">) {
  const value = String(field.field_type === "image" ? field.url : field.url || field.value).trim();
  if (field.field_type === "email") return `mailto:${value.replace(/^mailto:/i, "")}`;
  if (field.field_type === "phone") return `tel:${value.replace(/[^+\d]/g, "")}`;
  if ((field.field_type === "url" || field.field_type === "image") && /^https?:\/\//i.test(value)) return value;
  return null;
}

function imageWidth(field: Pick<SignatureField, "style_preference">) {
  const requested = Number(field.style_preference?.width);
  return Number.isFinite(requested) ? Math.min(600, Math.max(24, Math.round(requested))) : 120;
}

export function renderSignature(
  fields: Pick<SignatureField, "label" | "value" | "field_type" | "display_order" | "enabled" | "show_label" | "clickable" | "url" | "style_preference">[] = [],
) {
  const lines = [...fields]
    .filter((field) => field.enabled && field.value.trim())
    .sort((a, b) => a.display_order - b.display_order)
    .map((field) => {
      if (field.field_type === "image") {
        const source = field.value.trim();
        if (!/^https:\/\//i.test(source)) return "";
        const width = imageWidth(field);
        const image = `<img src="${escapeHtml(source)}" alt="${escapeHtml(field.label || "Signature logo")}" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0" />`;
        const href = field.clickable ? safeLink(field) : null;
        return `<div style="margin:0 0 8px">${href ? `<a href="${escapeHtml(href)}" style="display:inline-block;text-decoration:none">${image}</a>` : image}</div>`;
      }
      const href = field.clickable ? safeLink(field) : null;
      const value = escapeHtml(field.value);
      const content = href ? `<a href="${escapeHtml(href)}" style="color:#176b55;text-decoration:none">${value}</a>` : value;
      const label = field.show_label && field.label.trim() ? `${escapeHtml(field.label)}: ` : "";
      const bold = field.style_preference?.bold === true ? "font-weight:700;" : "";
      return `<div style="margin:0 0 4px;${bold}">${label}${content}</div>`;
    })
    .filter(Boolean);

  if (!lines.length) return "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;color:#26322f;margin-top:18px">${lines.join("")}</div>`;
}
