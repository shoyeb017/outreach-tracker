import Link from "next/link";
import Markdown from "react-markdown";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { findHelpDocument, headingId, helpSequence } from "@/lib/help/documents";
import type { readHelpDocument } from "@/lib/help/read-document";
import { PageHeader } from "@/components/layout/page-header";
import { MicrosoftArticle } from "./microsoft-article";

type Document = NonNullable<Awaited<ReturnType<typeof readHelpDocument>>>;
export function DocumentArticle({ document }: { document: Document }) {
  const sections = [...document.markdown.matchAll(/^## (.+)$/gm)].map((match) => ({ title: match[1], id: headingId(match[1]) }));
  if (["microsoft-setup", "troubleshooting"].includes(document.slug)) sections.push({ title: "Exact Microsoft redirect URL", id: "exact-microsoft-redirect-url" });
  const sequence = helpSequence[document.slug];
  const previous = sequence.previous ? findHelpDocument(sequence.previous) : undefined;
  const next = sequence.next ? findHelpDocument(sequence.next) : undefined;
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return <>
    <div className="doc-heading"><p className="eyebrow">{document.group} · {document.minutes} min read</p><PageHeader title={document.title} description={document.summary} /><a className="doc-download focus-ring" href={`/help/${document.slug}/markdown`} download><Download size={14} aria-hidden="true" />Download Markdown</a></div>
    <div className="doc-reading-layout">
      <aside className="doc-contents"><details open><summary>On this page</summary><nav aria-label="On this page"><ul>{sections.map((section) => <li key={section.id}><a className="focus-ring" href={`#${section.id}`}>{section.title}</a></li>)}</ul></nav></details></aside>
      <article className="doc-prose">
        <Markdown skipHtml components={{ h2: ({ children }) => <h2 id={headingId(String(children))}>{children}</h2>, a: ({ href, children }) => href?.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} rel={href?.startsWith("http") ? "noreferrer" : undefined}>{children}</a> }}>{document.markdown.split("<!-- interactive-errors -->")[0]}</Markdown>
        {["microsoft-setup", "troubleshooting"].includes(document.slug) && <MicrosoftArticle topic={document.slug} markdown={document.markdown} redirectUrl={origin ? `${origin}/settings` : null} />}
      </article>
    </div>
    <nav aria-label="Guide sequence" className="doc-sequence">{previous ? <Link href={previous.href} className="focus-ring"><ArrowLeft size={16} aria-hidden="true" /><span><small>Previous guide</small>{previous.navTitle}</span></Link> : <span />}{next && <Link href={next.href} className="focus-ring"><span><small>Next guide</small>{next.navTitle}</span><ArrowRight size={16} aria-hidden="true" /></Link>}</nav>
  </>;
}
