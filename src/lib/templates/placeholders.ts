import sanitizeHtml from "sanitize-html";

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

export interface ResolutionResult {
  output: string;
  missing: string[];
  used: string[];
}

function readPath(context: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!["__proto__", "prototype", "constructor"].includes(key) && value && typeof value === "object" && Object.hasOwn(value, key)) return (value as Record<string, unknown>)[key];
    return undefined;
  }, context);
}

export function extractPlaceholders(input: string): string[] {
  return Array.from(new Set(Array.from(input.matchAll(TOKEN_PATTERN), (match) => match[1])));
}

export function resolvePlaceholders(input: string, context: Record<string, unknown>, escapeValues = false): ResolutionResult {
  const missing = new Set<string>();
  const used = new Set<string>();
  const output = input.replace(TOKEN_PATTERN, (whole, path: string) => {
    const value = readPath(context, path);
    if (path === "signature" && value !== undefined && value !== null) {
      used.add(path);
      return String(value);
    }
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.add(path);
      return whole;
    }
    used.add(path);
    return escapeValues ? String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!) : String(value);
  });
  return { output, missing: [...missing], used: [...used] };
}

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "a", "span", "div", "img"],
    allowedAttributes: { "*": ["style"], a: ["href", "target", "rel"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    allowedStyles: { "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb[a]?\([0-9., %]+\)$/i, /^[a-z]+$/i],
      "background-color": [/^#[0-9a-f]{3,8}$/i],
      "font-family": [/^[a-z0-9 ,'"-]+$/i],
      "font-size": [/^[0-9.]+(?:px|pt|em|rem|%)$/],
      "font-weight": [/^(?:normal|bold|[1-9]00)$/],
      "line-height": [/^[0-9.]+(?:px|em|%)?$/],
      "text-align": [/^(?:left|right|center|justify)$/],
      "text-decoration": [/^(?:none|underline|line-through)$/],
      "vertical-align": [/^(?:top|middle|bottom)$/],
      "display": [/^(?:block|inline|inline-block)$/],
      "width": [/^[0-9.]+(?:px|%)$/], "height": [/^[0-9.]+(?:px|%)$/],
      "max-width": [/^[0-9.]+(?:px|%)$/],
      "margin": [/^[0-9. px%-]+$/], "padding": [/^[0-9. px%-]+$/],
      "margin-top": [/^[0-9.]+px$/], "margin-bottom": [/^[0-9.]+px$/],
      border: [/^(?:0|none)$/], "border-left": [/^[0-9.]+px solid #[0-9a-f]{3,8}$/i],
    } },
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }) },
  });
}

export function htmlToPlainText(html: string): string {
  if (typeof window !== "undefined") {
    const element = document.createElement("div");
    element.innerHTML = sanitizeEmailHtml(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "</$1>\n");
    return element.textContent?.replace(/\n{3,}/g, "\n\n").trim() ?? "";
  }
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim();
}

export function buildTemplateContext(args: {
  rowData: Record<string, unknown>;
  signatureHtml?: string;
}) {
  return {
    ...args.rowData,
    signature: args.signatureHtml ?? "",
  };
}
