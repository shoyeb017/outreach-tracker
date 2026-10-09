// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync("README.md", "utf8");
const imagePaths = [...readme.matchAll(/(?:src|srcset)="([^"]+)"|!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1] || match[2]);

describe("repository introduction and local documentation assets", () => {
  it("uses one product title and introduces both campaigns and the mailbox", () => {
    expect(readme.match(/^# /gm)).toHaveLength(1);
    for (const section of ["## What you can do", "## How it works", "## Product tour", "## Get started", "## Microsoft connection", "## Deployment", "## Documentation"]) expect(readme).toContain(section);
    expect(readme).toContain("Inbox, Sent, and Drafts");
    expect(readme).toContain("No hash script or separate admin signup is needed");
  });
  it("keeps all embedded images inside styles and supports both GitHub themes", () => {
    expect(imagePaths).toHaveLength(9);
    for (const path of imagePaths) {
      expect(path.startsWith("src/styles/")).toBe(true);
      expect(existsSync(path), path).toBe(true);
      const image = readFileSync(path);
      expect(image.subarray(0, 8).toString("hex"), path).toBe("89504e470d0a1a0a");
    }
    expect(readme).toContain('media="(prefers-color-scheme: dark)"');
    expect(readme).toContain("fictional sample data");
  });
  it("has no broken relative documentation or image links", () => {
    const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
    for (const path of links.filter((link) => !link.startsWith("#") && !/^https?:/.test(link))) expect(existsSync(path), path).toBe(true);
  });
  it("documents each deployment variable from the environment example", () => {
    const variables = readFileSync(".env.example", "utf8").split(/\r?\n/).filter((line) => /^[A-Z_]+=$/.test(line)).map((line) => line.slice(0, -1));
    for (const variable of variables) expect(readme).toContain(`| \`${variable}\` |`);
  });
  it("includes both required upgrades and accurate developer commands", () => {
    expect(readme).toContain("20261008_guided_workflow.sql");
    expect(readme).toContain("20261008_admin_microsoft.sql");
    expect(readme).toContain("npm run docs:screenshots");
    expect(readme).toContain("Never deploy a UI-test build");
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    for (const [, command] of readme.matchAll(/npm run ([\w:-]+)/g)) expect(scripts[command], command).toBeDefined();
  });
});
