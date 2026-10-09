"use client";

import DOMPurify from "dompurify";

export function MailBody({ html, title = "Email content" }: { html: string; title?: string }) {
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ["script", "style", "form", "input", "button", "iframe", "object", "embed", "video", "audio", "svg", "math"], FORBID_ATTR: ["srcset", "background"] });
  // A sandbox plus CSP isolates external email HTML and blocks all tracking pixels, fonts and network requests.
  const document = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>body{margin:0;padding:20px;font:14px/1.65 Arial,sans-serif;color:#172033;background:#fff;overflow-wrap:anywhere}table{max-width:100%}img{display:none}a{color:#174579}pre{white-space:pre-wrap}blockquote{border-left:2px solid #ccd7e5;margin-left:0;padding-left:16px}</style></head><body>${clean}</body></html>`;
  return <div className="min-w-0"><p className="mb-2 text-xs leading-5 text-[var(--muted-foreground)]">External images and tracking pixels are blocked. Open in Outlook for the original layout and images.</p><iframe title={title} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={document} className="h-[26rem] w-full rounded-md border bg-white sm:h-[32rem]" /></div>;
}
