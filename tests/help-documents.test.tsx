import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { helpDocuments, headingId, parseConnectionErrors } from "@/lib/help/documents";
import { readHelpDocument } from "@/lib/help/read-document";
import { DocumentArticle } from "@/components/help/document-article";
import { GET } from "@/app/help/[topic]/markdown/route";
afterEach(cleanup);
describe("Markdown help documentation", () => {
  it("explains the production domain and keeps Microsoft and Supabase redirects distinct", async () => {
    const guide = (await readHelpDocument("microsoft-setup"))!;
    expect(guide.markdown).toContain("NEXT_PUBLIC_APP_URL=https://autmail.vercel.app");
    expect(guide.markdown).toContain("register exactly **`https://autmail.vercel.app/settings`**");
    expect(guide.markdown).toContain("**`https://autmail.vercel.app/auth/callback` is the Supabase authentication redirect**");
    render(<DocumentArticle document={guide} />);
    expect(screen.getByRole("link", { name: "autmail.vercel.app" })).toHaveAttribute("href", "https://autmail.vercel.app");
  });
  it("explains minimal mailbox permissions and organization approval without gating Compose", async () => {
    const permissions = (await readHelpDocument("permissions"))!.markdown;
    expect(permissions).toContain("**Compose does not require Inbox access.**");
    expect(permissions).toContain("`Mail.Read` — read your mailbox");
    expect(permissions).toContain("`Mail.ReadWrite` — change your mailbox");
    expect(permissions).toContain("## What the Microsoft administrator should do");
    expect(permissions).toContain("access to your own mailbox");
  });
  it("does not force ordinary users through optional custom-registration setup", async () => {
    render(<DocumentArticle document={(await readHelpDocument("default-connection"))!} />);
    const sequence = screen.getByRole("navigation", { name: "Guide sequence" });
    expect(within(sequence).getByRole("link", { name: /Next guideSending safety/ })).toHaveAttribute("href", "/help/safety");
    expect(within(sequence).queryByRole("link", { name: /My own app/ })).not.toBeInTheDocument();
  });
  it("documents the optional administrator metadata reader and links its safety guidance", async () => {
    const permissions = (await readHelpDocument("permissions"))!.markdown;
    expect(permissions).toContain("**Administrator only · optional.**");
    expect(permissions).toContain("Microsoft Graph → Application permissions");
    expect(permissions).toContain("Grant admin consent");
    for (const setting of ["MICROSOFT_READER_TENANT_ID", "MICROSOFT_READER_CLIENT_ID", "MICROSOFT_READER_CLIENT_SECRET", "MICROSOFT_READABLE_APP_IDS"]) {
      expect(permissions).toContain(`\`${setting}\``);
    }
    expect(permissions).toContain("it does not narrow Microsoft's underlying permission grant");
    expect(permissions).toContain("It does **not** grant mailbox reading or sending.");
    render(<DocumentArticle document={(await readHelpDocument("safety"))!} />);
    expect(screen.getByRole("heading", { name: "Administrator safety: Application.Read.All" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Application.Read.All setup and safety steps" })).toHaveAttribute("href", "/help/permissions#optional-administrator-metadata-reader");
  });
  it("has complete, unique guides and stable section anchors", async () => {
    expect(new Set(helpDocuments.map((document) => document.slug)).size).toBe(helpDocuments.length);
    for (const metadata of helpDocuments) {
      const document = await readHelpDocument(metadata.slug);
      expect(document?.markdown.length).toBeGreaterThan(500);
      const headings = [...document!.markdown.matchAll(/^## (.+)$/gm)].map((match) => headingId(match[1]));
      expect(new Set(headings).size).toBe(headings.length);
      render(<DocumentArticle document={document!} />);
      const toc = screen.getByRole("navigation", { name: "On this page" });
      for (const link of within(toc).getAllByRole("link")) expect(documentElementById(link.getAttribute("href")!.slice(1))).not.toBeNull();
      cleanup();
    }
  });
  it("serves allowed Markdown files but rejects arbitrary paths", async () => {
    expect((await readHelpDocument("safety"))!.markdown.match(/Keep the browser tab open/g)).toHaveLength(1);
    for (const topic of ["../../.env.local", "__proto__", "constructor", "unknown"]) {
      expect(await readHelpDocument(topic)).toBeNull();
      expect((await GET(new Request("https://example.com"), { params: Promise.resolve({ topic }) })).status).toBe(404);
    }
    const response = await GET(new Request("https://example.com"), { params: Promise.resolve({ topic: "safety" }) });
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain('filename="safety.md"');
    expect(await response.text()).toContain("same template and recipient address");
  });
  it("uses the Markdown source for all expandable troubleshooting answers", async () => {
    const document = await readHelpDocument("troubleshooting");
    const errors = parseConnectionErrors(document!.markdown);
    expect(errors.length).toBe(16);
    expect(errors[0].title).toBe("AADSTS50020 / wrong tenant");
    for (const error of errors) expect(error.answers.map((answer) => answer.label)).toEqual(["What happened", "Why it happened", "How to fix it", "How to verify the fix"]);
  });
  it("does not render raw HTML or dangerous Markdown links", async () => {
    const document = (await readHelpDocument("safety"))!;
    const view = render(<DocumentArticle document={{ ...document, markdown: '## Safe heading\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))' }} />);
    expect(view.container.querySelector("script")).toBeNull();
    expect(screen.getByText("bad").getAttribute("href")).toBe("");
  });
});
function documentElementById(id: string) { return document.getElementById(id); }
