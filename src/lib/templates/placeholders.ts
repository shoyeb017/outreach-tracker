import DOMPurify from "dompurify";

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export interface ResolutionResult {
  output: string;
  missing: string[];
  used: string[];
}

function readPath(context: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) return (value as Record<string, unknown>)[key];
    return undefined;
  }, context);
}

export function extractPlaceholders(input: string): string[] {
  return Array.from(new Set(Array.from(input.matchAll(TOKEN_PATTERN), (match) => match[1])));
}

export function resolvePlaceholders(input: string, context: Record<string, unknown>): ResolutionResult {
  const missing = new Set<string>();
  const used = new Set<string>();
  const output = input.replace(TOKEN_PATTERN, (whole, path: string) => {
    const value = readPath(context, path);
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.add(path);
      return whole;
    }
    used.add(path);
    return String(value);
  });
  return { output, missing: [...missing], used: [...used] };
}

export function sanitizeEmailHtml(html: string): string {
  if (typeof window === "undefined") {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
      .replace(/javascript:/gi, "");
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "a", "span", "div"],
    ALLOWED_ATTR: ["href", "target", "rel", "style"],
    ALLOW_DATA_ATTR: false,
  });
}

export function htmlToPlainText(html: string): string {
  if (typeof window !== "undefined") {
    const element = document.createElement("div");
    element.innerHTML = sanitizeEmailHtml(html);
    return element.textContent?.replace(/\n{3,}/g, "\n\n").trim() ?? "";
  }
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim();
}

export function buildTemplateContext(args: {
  rowData: Record<string, unknown>;
  profile?: Record<string, unknown>;
  sender?: Record<string, unknown>;
  signatureHtml?: string;
}) {
  return {
    ...args.rowData,
    profile: { ...(args.profile ?? {}), ...(args.sender ?? {}) },
    signature: args.signatureHtml ?? "",
  };
}
