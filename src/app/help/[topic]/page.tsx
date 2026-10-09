import { notFound } from "next/navigation";
import { DocumentArticle } from "@/components/help/document-article";
import { readHelpDocument } from "@/lib/help/read-document";
import { helpDocuments } from "@/lib/help/documents";
export function generateStaticParams() { return helpDocuments.filter((document) => document.href !== "/help").map(({ slug }) => ({ topic: slug })); }
export default async function HelpTopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const document = await readHelpDocument(topic);
  if (!document || document.href === "/help") notFound();
  return <DocumentArticle document={document} />;
}
