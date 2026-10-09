import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findHelpDocument } from "./documents";

export async function readHelpDocument(slug: string) {
  const document = findHelpDocument(slug);
  if (!document) return null;
  // Only manifest-controlled filenames are ever read, never a user-supplied path.
  const markdown = await readFile(path.join(process.cwd(), "content", "help", `${document.slug}.md`), "utf8");
  return { ...document, markdown };
}
