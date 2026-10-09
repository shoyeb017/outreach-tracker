import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Read-only release check. Report filenames, never credential contents.
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [];
for (const file of tracked) {
  if (/(?:^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example") problems.push(`${file}: environment files must not be tracked`);
  if (/^(?:node_modules|\.next|test-results|playwright-report|coverage|\.vercel|\.codex|\.agents)\//.test(file)) problems.push(`${file}: generated or machine-specific content must not be tracked`);
}
for (const file of new Set(files)) {
  if (!/\.(?:[cm]?js|[cm]?ts|tsx|jsx|json|md|sql|ya?ml)$/.test(file) && file !== ".env.example") continue;
  const contents = readFileSync(file, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents) || /\b(?:ghp|gho|ghu|ghs|github_pat)_[a-zA-Z0-9_]{32,}\b/.test(contents)) problems.push(`${file}: possible private credential; inspect before committing`);
  for (const token of contents.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g) ?? []) {
    try { if (JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role === "service_role") problems.push(`${file}: possible service-role token; remove it before committing`); } catch { /* Not a JWT. */ }
  }
}
const example = readFileSync(".env.example", "utf8");
if (example.split(/\r?\n/).some((line) => line && !line.startsWith("#") && !/^[A-Z_]+=$/.test(line))) problems.push(".env.example: only empty deployment placeholders are allowed");
if (problems.length) {
  console.error([...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log("Repository check passed: no tracked environment files, generated artifacts, or detected private credentials. Nothing was staged, committed, or pushed.");
