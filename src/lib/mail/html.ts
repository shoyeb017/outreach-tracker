"use client";
import DOMPurify from "dompurify";

export function cleanMailHtml(html: string) {
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed", "svg", "math", "video", "audio"], FORBID_ATTR: ["srcset", "background"] });
  const document = new DOMParser().parseFromString(clean, "text/html");
  for (const element of document.querySelectorAll("[style]")) if (/url\s*\(|expression\s*\(|@import/i.test(element.getAttribute("style") ?? "")) element.removeAttribute("style");
  return document.body.innerHTML;
}
export function composeHtml(body: string, signature: string, quote: string) {
  return cleanMailHtml(`<div id="autmail-composition">${body}</div>${signature ? `<div id="autmail-signature">${signature}</div>` : ""}${quote ? `<div id="autmail-quote">${quote}</div>` : ""}`);
}
export function draftParts(html: string) {
  const document = new DOMParser().parseFromString(cleanMailHtml(html), "text/html");
  const body = document.getElementById("autmail-composition");
  if (!body) return { body: "<p></p>", quote: cleanMailHtml(html), signature: false, protectedOriginal: true };
  return { body: body.innerHTML, quote: document.getElementById("autmail-quote")?.innerHTML ?? "", signature: Boolean(document.getElementById("autmail-signature")), protectedOriginal: false };
}
