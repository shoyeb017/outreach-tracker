export interface EngagementSettings {
  enabled: boolean; collection_enabled: boolean; destination: string; intro: string; button_text: string;
  button_color: string; text_color: string; alignment: "left" | "center" | "right"; size: "small" | "medium" | "large";
  placement: "before_signature" | "after_signature";
}
export const ENGAGEMENT_PREVIEW_URL = "https://autmail.invalid/engagement-preview";
export const defaultEngagement: EngagementSettings = { enabled: false, collection_enabled: true, destination: "", intro: "Explore how we can help your business.", button_text: "Visit our website", button_color: "#174579", text_color: "#ffffff", alignment: "left", size: "medium", placement: "before_signature" };
export function validDestination(value: string) {
  try {
    if (/[\u0000-\u0020\\]/.test(value)) return false;
    const url = new URL(value);
    return value.length <= 2048 && url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".")
      && !/^(?:localhost|.*\.(?:localhost|local|internal)|[\d.]+|\[.*\])$/i.test(url.hostname.replace(/\.$/, ""))
      && !/^\/e\/[a-f0-9]{64}\/?$/i.test(url.pathname) && url.hostname !== "autmail.invalid";
  } catch { return false; }
}
export function engagementSettings(value: unknown): EngagementSettings {
  const source = value && typeof value === "object" ? value as Partial<EngagementSettings> : {};
  const result = { ...defaultEngagement, ...source };
  for (const field of ["intro", "button_text", "destination"] as const) if (typeof result[field] !== "string") result[field] = defaultEngagement[field];
  result.intro = result.intro.slice(0, 600); result.button_text = result.button_text.slice(0, 80); result.destination = result.destination.slice(0, 2048);
  for (const field of ["button_color", "text_color"] as const) if (!/^#[a-f0-9]{6}$/i.test(String(result[field]))) result[field] = defaultEngagement[field];
  if (!["left", "center", "right"].includes(result.alignment)) result.alignment = "left";
  if (!["small", "medium", "large"].includes(result.size)) result.size = "medium";
  if (!["before_signature", "after_signature"].includes(result.placement)) result.placement = "before_signature";
  result.enabled = source.enabled === true && validDestination(result.destination) && !!result.button_text.trim();
  result.collection_enabled = source.collection_enabled !== false;
  return Object.fromEntries(Object.keys(defaultEngagement).map(key => [key, result[key as keyof EngagementSettings]])) as unknown as EngagementSettings;
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export function engagementButton(value: EngagementSettings, destination = ENGAGEMENT_PREVIEW_URL) {
  const settings = engagementSettings(value);
  if (!settings.enabled) return "";
  const padding = settings.size === "small" ? "10px 16px" : settings.size === "large" ? "16px 26px" : "12px 20px";
  const font = settings.size === "small" ? 13 : settings.size === "large" ? 16 : 14;
  return `<div style="margin:20px 0;text-align:${settings.alignment};font-family:Arial,sans-serif">${settings.intro.trim() ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">${escape(settings.intro).replace(/\n/g, "<br />")}</p>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td align="${settings.alignment}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tbody><tr><td bgcolor="${settings.button_color}" style="background-color:${settings.button_color};padding:${padding};text-align:center"><a href="${escape(destination)}" style="display:inline-block;color:${settings.text_color};font-size:${font}px;font-weight:600;text-decoration:none;line-height:1.5">${escape(settings.button_text)}</a></td></tr></tbody></table></td></tr></tbody></table></div>`;
}
export function engagementPlainText(settings: EngagementSettings) { return settings.enabled ? `${settings.intro.trim()}\n${settings.button_text}: ${ENGAGEMENT_PREVIEW_URL}`.trim() : ""; }
/** Never follow a real token URL from an AUTMAIL preview, even a historical one. */
export function safeEngagementPreview(html: string) {
  return html.replace(/\bhref\s*=\s*(["'])(.*?)\1/gi, (attribute, quote: string, href: string) => {
    if (href === ENGAGEMENT_PREVIEW_URL || /^(?:https?:\/\/[^/]+)?\/e\/[a-f0-9]{64}(?:[?#].*)?$/i.test(href)) return `href=${quote}#engagement-preview${quote} title="Preview only; activity is not recorded"`;
    return attribute;
  });
}
export function activityKind(headers: Headers): "visit" | "suspected" | "ignore" {
  if (/prefetch|prerender/i.test(`${headers.get("purpose")} ${headers.get("sec-purpose")}`)) return "ignore";
  const agent = headers.get("user-agent") ?? "";
  return !agent || /bot|crawler|spider|preview|scanner|safelinks|proofpoint|barracuda|mimecast|curl|wget|headless/i.test(agent) ? "suspected" : "visit";
}
