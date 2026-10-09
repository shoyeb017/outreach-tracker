import { DocumentArticle } from "@/components/help/document-article";
import { readHelpDocument } from "@/lib/help/read-document";
export default async function HelpPage() {
  const document = await readHelpDocument("getting-started");
  return document ? <DocumentArticle document={document} /> : null;
}
